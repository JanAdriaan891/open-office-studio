//! Prestatieproef (natief): `cargo run --release --example meet -- nl.aff nl.dic tekst.txt`.
use std::time::Instant;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let aff = std::fs::read_to_string(&args[0]).unwrap();
    let dic = std::fs::read_to_string(&args[1]).unwrap();
    let tekst = std::fs::read_to_string(&args[2]).unwrap();
    let t = Instant::now();
    let wb = spellbook::Dictionary::new(&aff, &dic).unwrap();
    println!("laden: {:?}", t.elapsed());
    let woorden: Vec<&str> = tekst
        .split(|c: char| !c.is_alphanumeric() && c != '\'' && c != '-')
        .filter(|w| !w.is_empty())
        .collect();
    let t = Instant::now();
    let fout: Vec<&&str> = woorden.iter().filter(|w| !wb.check(w)).collect();
    let duur = t.elapsed();
    println!(
        "controle: {} woorden in {:?} ({:?} per 1000), onbekend: {:?}",
        woorden.len(),
        duur,
        duur * 1000 / woorden.len().max(1) as u32,
        fout
    );
    for w in fout.iter().take(5) {
        let t = Instant::now();
        let mut s = Vec::new();
        wb.suggest(w, &mut s);
        println!("suggesties {w}: {:?} in {:?}", &s[..s.len().min(5)], t.elapsed());
    }
}
