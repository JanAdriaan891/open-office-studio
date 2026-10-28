//! Spellingcontrole voor Open Office Studio.
//!
//! Een dunne laag om [`spellbook`] (MPL-2.0, Hunspell-compatibel, een Rust-port
//! van Nuspell) met een kale C-ABI, zodat de module zonder wasm-bindgen in een
//! Web Worker draait (`src/spelling/worker.ts`). Alle tekst gaat als UTF-8 via
//! een gedeelde invoerbuffer; uitvoer staat in een tweede buffer.
//!
//! Volgorde vanuit JavaScript:
//! 1. `buffer(n)` geeft een pointer naar `n` vrije bytes; schrijf daar de invoer.
//! 2. Roep `laad`, `controleer` of `suggesties` aan met de lengte.
//! 3. Lees uitvoer met `uitvoer_ptr()`/`uitvoer_len()`.

use spellbook::Dictionary;

/// Woordenboeken, op volgnummer (1, 2, …); 0 betekent "geen".
static mut WOORDENBOEKEN: Vec<Option<Dictionary>> = Vec::new();
static mut INVOER: Vec<u8> = Vec::new();
static mut UITVOER: Vec<u8> = Vec::new();

#[allow(static_mut_refs)]
fn invoer(len: usize) -> &'static [u8] {
    // Single-threaded (één worker), dus geen gelijktijdige toegang.
    unsafe { &INVOER[..len.min(INVOER.len())] }
}

#[allow(static_mut_refs)]
fn woordenboek(id: u32) -> Option<&'static Dictionary> {
    unsafe { WOORDENBOEKEN.get((id as usize).checked_sub(1)?)?.as_ref() }
}

#[allow(static_mut_refs)]
fn zet_uitvoer(bytes: &[u8]) {
    unsafe {
        UITVOER.clear();
        UITVOER.extend_from_slice(bytes);
    }
}

/// Zorgt voor een invoerbuffer van minstens `len` bytes en geeft het adres.
#[no_mangle]
#[allow(static_mut_refs)]
pub extern "C" fn buffer(len: usize) -> *mut u8 {
    unsafe {
        if INVOER.len() < len {
            INVOER.resize(len, 0);
        }
        INVOER.as_mut_ptr()
    }
}

#[no_mangle]
#[allow(static_mut_refs)]
pub extern "C" fn uitvoer_ptr() -> *const u8 {
    unsafe { UITVOER.as_ptr() }
}

#[no_mangle]
#[allow(static_mut_refs)]
pub extern "C" fn uitvoer_len() -> usize {
    unsafe { UITVOER.len() }
}

/// Laadt een woordenboek. De invoer is `aff`, dan een nulbyte, dan `dic`.
/// Geeft het volgnummer, of 0 bij een fout (de melding staat in de uitvoer).
#[no_mangle]
#[allow(static_mut_refs)]
pub extern "C" fn laad(len: usize) -> u32 {
    let data = invoer(len);
    let Some(scheiding) = data.iter().position(|&b| b == 0) else {
        zet_uitvoer(b"geen scheiding tussen .aff en .dic");
        return 0;
    };
    let (Ok(aff), Ok(dic)) = (
        core::str::from_utf8(&data[..scheiding]),
        core::str::from_utf8(&data[scheiding + 1..]),
    ) else {
        zet_uitvoer(b"woordenboek is geen geldige UTF-8");
        return 0;
    };
    match Dictionary::new(aff, dic) {
        Ok(woordenboek) => unsafe {
            WOORDENBOEKEN.push(Some(woordenboek));
            // Invoer van megabytes niet vasthouden.
            INVOER = Vec::new();
            WOORDENBOEKEN.len() as u32
        },
        Err(fout) => {
            zet_uitvoer(format!("{fout}").as_bytes());
            0
        }
    }
}

/// Ruimt een woordenboek op.
#[no_mangle]
#[allow(static_mut_refs)]
pub extern "C" fn verwijder(id: u32) {
    unsafe {
        if let Some(plek) = (id as usize).checked_sub(1).and_then(|i| WOORDENBOEKEN.get_mut(i)) {
            *plek = None;
        }
    }
}

/// Controleert één woord: 1 = goed, 0 = onbekend, -1 = ongeldig verzoek.
#[no_mangle]
pub extern "C" fn controleer(id: u32, len: usize) -> i32 {
    let (Some(wb), Ok(woord)) = (woordenboek(id), core::str::from_utf8(invoer(len))) else {
        return -1;
    };
    wb.check(woord) as i32
}

/// Controleert woorden gescheiden door `\n`; de uitvoer krijgt per woord één
/// byte (1 = goed, 0 = onbekend). Geeft het aantal woorden, of -1.
#[no_mangle]
pub extern "C" fn controleer_lijst(id: u32, len: usize) -> i32 {
    let (Some(wb), Ok(tekst)) = (woordenboek(id), core::str::from_utf8(invoer(len))) else {
        return -1;
    };
    let checker = wb.checker();
    let uitkomst: Vec<u8> = tekst.split('\n').map(|w| checker.check(w) as u8).collect();
    zet_uitvoer(&uitkomst);
    uitkomst.len() as i32
}

/// Suggesties voor één woord, gescheiden door `\n` in de uitvoer.
/// Geeft het aantal, of -1.
#[no_mangle]
pub extern "C" fn suggesties(id: u32, len: usize) -> i32 {
    let (Some(wb), Ok(woord)) = (woordenboek(id), core::str::from_utf8(invoer(len))) else {
        return -1;
    };
    let mut lijst = Vec::new();
    wb.suggest(woord, &mut lijst);
    zet_uitvoer(lijst.join("\n").as_bytes());
    lijst.len() as i32
}

#[cfg(test)]
mod tests {
    use super::*;

    fn schrijf(tekst: &[u8]) -> usize {
        let p = buffer(tekst.len());
        unsafe { core::ptr::copy_nonoverlapping(tekst.as_ptr(), p, tekst.len()) };
        tekst.len()
    }

    #[test]
    fn klein_woordenboek() {
        let mut data = b"SET UTF-8\nSFX S Y 1\nSFX S 0 s .\n".to_vec();
        data.push(0);
        data.extend_from_slice(b"2\nboom/S\nhuis\n");
        let id = laad(schrijf(&data));
        assert!(id > 0);
        assert_eq!(controleer(id, schrijf(b"bomen")), 0);
        assert_eq!(controleer(id, schrijf(b"booms")), 1);
        assert_eq!(controleer_lijst(id, schrijf(b"huis\nhuus\nboom")), 3);
        let uit = unsafe { core::slice::from_raw_parts(uitvoer_ptr(), uitvoer_len()) };
        assert_eq!(uit, &[1, 0, 1]);
        assert!(suggesties(id, schrijf(b"huus")) >= 1);
        let uit = unsafe { core::slice::from_raw_parts(uitvoer_ptr(), uitvoer_len()) };
        assert!(core::str::from_utf8(uit).unwrap().split('\n').any(|s| s == "huis"));
        assert_eq!(controleer(99, schrijf(b"huis")), -1);
    }
}
