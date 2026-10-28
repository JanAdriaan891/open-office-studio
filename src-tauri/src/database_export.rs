//! Export uit Database Studio: alleen een SQLite-werkkopie of tekstexports.
//! Access-databases (.mdb/.accdb) worden nooit geschreven of overschreven.
use std::path::Path;

const SQLITE_KOP: &[u8] = b"SQLite format 3\0";
const TEKSTEXPORTS: [&str; 5] = ["csv", "sql", "bas", "json", "txt"];
const MAXIMUM: usize = 100 * 1024 * 1024;

/// Controleert naam en inhoud; geeft de kale bestandsnaam en de extensie terug.
pub fn exportnaam(naam: &str, bytes: &[u8]) -> Result<(String, String), String> {
    if bytes.is_empty() || bytes.len() > MAXIMUM {
        return Err("De export is leeg of groter dan 100 MB.".into());
    }
    // Alleen de bestandsnaam telt; een pad van buitenaf wordt genegeerd.
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
    if !TEKSTEXPORTS.contains(&extensie.as_str()) {
        return Err(
            "Alleen CSV-, bron-, rapport- en SQLite-werkkopie-exports zijn toegestaan. Access-databases worden niet overschreven."
                .into(),
        );
    }
    if std::str::from_utf8(bytes).is_err() {
        return Err("Een tekstexport moet geldige UTF-8-tekst zijn.".into());
    }
    Ok((naam, extensie))
}

#[tauri::command]
pub async fn bewaar_database_export(
    request: tauri::ipc::Request<'_>,
) -> Result<Option<String>, String> {
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) if bytes.len() <= MAXIMUM => bytes.clone(),
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
    let bestand = rfd::AsyncFileDialog::new()
        .set_title("Database-export opslaan")
        .set_file_name(&naam)
        .add_filter(
            if extensie == "sqlite" {
                "SQLite-werkkopie"
            } else {
                "Database-export"
            },
            &[&extensie],
        )
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
            .set_title("Export vervangen")
            .set_description(format!(
                "Het bestand {} bestaat al. Vervangen?",
                pad.display()
            ))
            .set_buttons(rfd::MessageButtons::YesNo)
            .show()
            .await
            != rfd::MessageDialogResult::Yes
    {
        return Ok(None);
    }
    // Het doel komt uitsluitend uit de native dialoog, nooit uit een frontendpad.
    tauri::async_runtime::spawn_blocking(move || {
        crate::schrijf_atomair(&pad, &bytes)?;
        Ok(Some(pad.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn database_en_ongeldige_inhoud_worden_geweigerd() {
        assert!(exportnaam("bron.mdb", b"tekst").is_err());
        assert!(exportnaam("bron.accdb", b"tekst").is_err());
        assert!(exportnaam("bron.docx", b"tekst").is_err());
        assert!(exportnaam("pagina.csv", b"").is_err());
        assert!(exportnaam("pagina.csv", &[255]).is_err());
        assert!(exportnaam("bron.exe", b"tekst").is_err());
        assert!(exportnaam("zonder-extensie", b"tekst").is_err());
        for ext in TEKSTEXPORTS {
            assert_eq!(exportnaam(&format!("uit.{ext}"), b"a;b").unwrap().1, ext);
        }
        assert_eq!(exportnaam("Module1.BAS", b"Sub A()").unwrap().1, "bas");
    }
    #[test]
    fn paden_van_buitenaf_worden_genegeerd() {
        assert_eq!(exportnaam("../pagina.csv", b"t").unwrap().0, "pagina.csv");
        assert_eq!(
            exportnaam("/etc/map/rapport.json", b"{}").unwrap().0,
            "rapport.json"
        );
        assert!(exportnaam("..", b"t").is_err());
    }
    #[test]
    fn sqlite_werkkopie_alleen_met_echte_kop() {
        let mut werkkopie = SQLITE_KOP.to_vec();
        werkkopie.extend_from_slice(&[0, 1, 2, 255, 254]);
        let (naam, extensie) = exportnaam("map/Klanten.SQLITE", &werkkopie).unwrap();
        assert_eq!(naam, "Klanten.SQLITE");
        assert_eq!(extensie, "sqlite");
        // Een Access-bestand of afgekapte kop met .sqlite-extensie wordt geweigerd.
        assert!(exportnaam("bron.sqlite", b"\0\x01\0\0Standard Jet DB").is_err());
        assert!(exportnaam("bron.sqlite", b"SQLite format 3").is_err());
        assert!(exportnaam("bron.sqlite", b"").is_err());
        // Binaire inhoud blijft voor tekstexports geweigerd, ook met een SQLite-kop.
        assert!(exportnaam("pagina.csv", &werkkopie).is_err());
        assert!(exportnaam("bron.mdb", &werkkopie).is_err());
        assert!(exportnaam("bron.accdb", &werkkopie).is_err());
    }
    #[test]
    fn export_wordt_volledig_en_atomair_bewaard() {
        let map = tempfile::tempdir().unwrap();
        let pad = map.path().join("pagina.csv");
        std::fs::write(&pad, b"oude, langere inhoud").unwrap();
        crate::schrijf_atomair(&pad, "Materiaal;Aantal\nHout;12\n".as_bytes()).unwrap();
        assert_eq!(
            std::fs::read_to_string(&pad).unwrap(),
            "Materiaal;Aantal\nHout;12\n"
        );
        assert_eq!(std::fs::read_dir(map.path()).unwrap().count(), 1);
    }
}
