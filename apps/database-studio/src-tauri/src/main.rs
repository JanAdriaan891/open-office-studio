#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{io::Write, path::Path};

const SQLITE_KOP: &[u8] = b"SQLite format 3\0";

fn exportnaam(naam: &str, bytes: &[u8]) -> Result<(String, String), String> {
    if bytes.is_empty() || bytes.len() > 100 * 1024 * 1024 {
        return Err("De export is leeg, ongeldig of groter dan 100 MB.".into());
    }
    let naam = Path::new(naam)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Bestandsnaam ontbreekt.")?
        .to_owned();
    let extensie = Path::new(&naam)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if extensie == "sqlite" {
        // Alleen een echte SQLite-werkkopie; nooit een MDB/ACCDB onder een andere naam.
        if !bytes.starts_with(SQLITE_KOP) {
            return Err("Dit is geen SQLite-werkkopie.".into());
        }
        return Ok((naam, extensie));
    }
    if !["csv", "sql", "bas", "json", "txt"].contains(&extensie.as_str()) {
        return Err(
            "Alleen CSV-, bron-, rapport- en SQLite-werkkopie-exports zijn toegestaan. Access-databases worden niet overschreven."
                .into(),
        );
    }
    if std::str::from_utf8(bytes).is_err() {
        return Err("De export is leeg, ongeldig of groter dan 100 MB.".into());
    }
    Ok((naam, extensie))
}

fn schrijf_atomair(pad: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut tijdelijk =
        tempfile::NamedTempFile::new_in(pad.parent().ok_or("De doelmap ontbreekt.")?)
            .map_err(|e| e.to_string())?;
    tijdelijk.write_all(bytes).map_err(|e| e.to_string())?;
    tijdelijk.as_file().sync_all().map_err(|e| e.to_string())?;
    tijdelijk.persist(pad).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn bewaar_database_export(
    request: tauri::ipc::Request<'_>,
) -> Result<Option<String>, String> {
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) if bytes.len() <= 100 * 1024 * 1024 => bytes.clone(),
        _ => return Err("Stuur de export als binaire gegevens van maximaal 100 MB.".into()),
    };
    let kop = request
        .headers()
        .get("x-database-naam")
        .and_then(|n| n.to_str().ok())
        .ok_or("Bestandsnaam ontbreekt.")?;
    let naam = percent_encoding::percent_decode_str(kop)
        .decode_utf8()
        .map_err(|_| "Ongeldige bestandsnaam.")?;
    let (naam, extensie) = exportnaam(&naam, &bytes)?;
    // Dialoogteksten in de taal van de interface (de frontend stuurt ze mee); anders Nederlands.
    let tekst = |kop: &str, standaard: &str| -> String {
        request
            .headers()
            .get(kop)
            .and_then(|w| w.to_str().ok())
            .and_then(|w| percent_encoding::percent_decode_str(w).decode_utf8().ok())
            .map(|w| w.trim().to_string())
            .filter(|w| !w.is_empty() && w.len() <= 300)
            .unwrap_or_else(|| standaard.to_string())
    };
    let titel = tekst("x-dialoog-titel", "Database-export opslaan");
    let filter = if extensie == "sqlite" {
        tekst("x-dialoog-filter-sqlite", "SQLite-werkkopie")
    } else {
        tekst("x-dialoog-filter-export", "Database-export")
    };
    let vervang_titel = tekst("x-vervang-titel", "Export vervangen");
    let vervang_tekst = tekst("x-vervang-tekst", "Dit exportbestand bestaat al. Vervangen?");
    let bestand = rfd::AsyncFileDialog::new()
        .set_title(&titel)
        .set_file_name(&naam)
        .add_filter(&filter, &[&extensie])
        .save_file()
        .await;
    let Some(bestand) = bestand else {
        return Ok(None);
    };
    let mut pad = bestand.path().to_path_buf();
    if pad.extension().is_none() {
        pad.set_extension(&extensie);
    }
    if pad
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_lowercase)
        != Some(extensie)
    {
        return Err("De gekozen extensie past niet bij de export.".into());
    }
    if pad.exists()
        && rfd::AsyncMessageDialog::new()
            .set_title(&vervang_titel)
            .set_description(&vervang_tekst)
            .set_buttons(rfd::MessageButtons::YesNo)
            .show()
            .await
            != rfd::MessageDialogResult::Yes
    {
        return Ok(None);
    }
    tauri::async_runtime::spawn_blocking(move || {
        schrijf_atomair(&pad, &bytes)?;
        Ok(Some(pad.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![bewaar_database_export])
        .run(tauri::generate_context!())
        .expect("Open Database Studio kon niet starten");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn database_en_ongeldige_inhoud_worden_geweigerd() {
        assert!(exportnaam("bron.mdb", b"tekst").is_err());
        assert!(exportnaam("bron.accdb", b"tekst").is_err());
        assert!(exportnaam("pagina.csv", b"").is_err());
        assert!(exportnaam("pagina.csv", &[255]).is_err());
        assert!(exportnaam("bron.exe", b"tekst").is_err());
        assert_eq!(exportnaam("rapport.json", b"{}").unwrap().1, "json");
        assert_eq!(exportnaam("rapport.txt", b"tekst").unwrap().1, "txt");
        assert_eq!(
            exportnaam("../pagina.csv", b"tekst").unwrap().0,
            "pagina.csv"
        );
    }
    #[test]
    fn sqlite_werkkopie_alleen_met_echte_kop() {
        let mut werkkopie = b"SQLite format 3\0".to_vec();
        werkkopie.extend_from_slice(&[0, 1, 2, 255, 254]);
        let (naam, extensie) = exportnaam("map/Klanten.SQLITE", &werkkopie).unwrap();
        assert_eq!(naam, "Klanten.SQLITE");
        assert_eq!(extensie, "sqlite");
        // Een Access-bestand of willekeurige bytes met .sqlite-extensie worden geweigerd.
        assert!(exportnaam("bron.sqlite", b"\0\x01\0\0Standard Jet DB").is_err());
        assert!(exportnaam("bron.sqlite", b"").is_err());
        // Binaire inhoud blijft voor tekstexports geweigerd, ook met een SQLite-kop.
        assert!(exportnaam("pagina.csv", &werkkopie).is_err());
        assert!(exportnaam("bron.mdb", &werkkopie).is_err());
    }
    #[test]
    fn export_wordt_volledig_en_atomair_bewaard() {
        let map = tempfile::tempdir().unwrap();
        let pad = map.path().join("pagina.csv");
        std::fs::write(&pad, b"oud").unwrap();
        schrijf_atomair(&pad, "Materiaal;Aantal\nHout;12\n".as_bytes()).unwrap();
        assert_eq!(
            std::fs::read_to_string(&pad).unwrap(),
            "Materiaal;Aantal\nHout;12\n"
        );
        assert_eq!(std::fs::read_dir(map.path()).unwrap().count(), 1);
    }
}
