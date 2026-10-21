use serde_json::Value;
use std::{
    fs,
    path::PathBuf,
    process::{Command, Stdio},
    time::{Duration, Instant},
};

pub const PROFIEL: &str = r#"<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop><prop oor:name="DisableActiveContent" oor:op="fuse"><value>true</value></prop></item></oor:items>"#;

fn catalogus() -> Value {
    serde_json::from_str(include_str!("../../src/formaten.json"))
        .expect("Ongeldige ingebouwde formaatcatalogus")
}
pub fn mag_bewaren(ext: &str) -> bool {
    catalogus().as_object().is_some_and(|modules| {
        modules
            .values()
            .any(|module| module["uitvoer"].get(ext).is_some())
    })
}
fn filter(bron: &str, doel: &str, module: &str) -> Result<String, String> {
    let catalogus = catalogus();
    let gegevens = catalogus.get(module).ok_or("Onbekende kantoormodule.")?;
    if !gegevens["invoer"]
        .as_array()
        .is_some_and(|invoer| invoer.iter().any(|ext| ext.as_str() == Some(bron)))
    {
        return Err("Het bronformaat hoort niet bij deze module.".into());
    }
    gegevens["uitvoer"]
        .get(doel)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| "Dit uitvoerformaat wordt niet ondersteund.".into())
}
fn programma() -> Option<PathBuf> {
    let namen = if cfg!(target_os = "windows") {
        vec!["soffice.exe", "libreoffice.exe"]
    } else {
        vec!["libreoffice", "soffice"]
    };
    let mut kandidaten = vec![
        PathBuf::from("/Applications/LibreOffice.app/Contents/MacOS/soffice"),
        PathBuf::from("/usr/bin/libreoffice"),
    ];
    for sleutel in ["PROGRAMFILES", "PROGRAMFILES(X86)"] {
        if let Some(pad) = std::env::var_os(sleutel) {
            kandidaten.push(PathBuf::from(pad).join("LibreOffice/program/soffice.exe"));
        }
    }
    // Gebruik de normale desktopinstallatie vóór hulpmiddelen uit een ontwikkelomgeving.
    if let Some(pad) = kandidaten.into_iter().find(|p| p.is_file()) {
        return Some(pad);
    }
    if let Some(paden) = std::env::var_os("PATH") {
        for naam in &namen {
            for pad in std::env::split_paths(&paden) {
                let p = pad.join(naam);
                if p.is_file() {
                    return Some(p);
                }
            }
        }
    }
    None
}
fn stop(kind: &mut std::process::Child) {
    #[cfg(unix)]
    unsafe {
        libc::kill(-(kind.id() as i32), libc::SIGKILL);
    }
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &kind.id().to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = kind.kill();
    let _ = kind.wait();
}
pub fn converteer(bytes: &[u8], bron: &str, doel: &str, module: &str) -> Result<Vec<u8>, String> {
    if bytes.is_empty() || bytes.len() > 100 * 1024 * 1024 {
        return Err("Kies een bestand van maximaal 100 MB dat niet leeg is.".into());
    }
    let uitvoerfilter = filter(bron, doel, module)?;
    let programma = programma().ok_or("Voor dit formaat is een lokale LibreOffice-installatie nodig. DOCX, XLSX en PPTX werken rechtstreeks.")?;
    let map = tempfile::tempdir().map_err(|e| e.to_string())?;
    let invoer = map.path().join(format!("invoer.{bron}"));
    let uit = map.path().join("uit");
    let profiel = map.path().join("profiel");
    fs::create_dir_all(profiel.join("user")).map_err(|e| e.to_string())?;
    fs::create_dir(&uit).map_err(|e| e.to_string())?;
    fs::write(&invoer, bytes).map_err(|e| e.to_string())?;
    fs::write(profiel.join("user/registrymodifications.xcu"), PROFIEL)
        .map_err(|e| e.to_string())?;
    let profiel_url = tauri::Url::from_directory_path(&profiel)
        .map_err(|_| "Het tijdelijke profielpad is ongeldig.")?;
    let log = fs::File::create(map.path().join("conversie.log")).map_err(|e| e.to_string())?;
    let mut opdracht = Command::new(programma);
    opdracht.args([
        format!("-env:UserInstallation={profiel_url}"),
        "--headless".into(),
        "--nologo".into(),
        "--nodefault".into(),
        "--norestore".into(),
        "--convert-to".into(),
        format!("{doel}:{uitvoerfilter}"),
        "--outdir".into(),
    ]);
    opdracht
        .arg(&uit)
        .arg(&invoer)
        .stdin(Stdio::null())
        .stdout(log.try_clone().map_err(|e| e.to_string())?)
        .stderr(log);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        opdracht.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        opdracht.creation_flags(0x08000000);
    }
    let mut kind = opdracht
        .spawn()
        .map_err(|e| format!("Conversie kon niet starten: {e}"))?;
    let start = Instant::now();
    loop {
        match kind.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if start.elapsed() < Duration::from_secs(45) => {
                std::thread::sleep(Duration::from_millis(30))
            }
            Ok(None) => {
                stop(&mut kind);
                return Err("Conversie duurde langer dan 45 seconden en is gestopt. Het origineel is behouden.".into());
            }
            Err(e) => {
                stop(&mut kind);
                return Err(e.to_string());
            }
        }
    }
    let resultaat = uit.join(format!("invoer.{doel}"));
    let grootte = fs::metadata(&resultaat).map_err(|_| "Dit bestand kon niet worden geconverteerd. Het kan beschadigd of beveiligd zijn, of het formaatfilter ontbreekt in de lokale runtime.")?.len();
    if grootte == 0 || grootte > 100 * 1024 * 1024 {
        return Err("De conversie leverde geen bruikbaar bestand van maximaal 100 MB op.".into());
    }
    fs::read(resultaat).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    #[test]
    fn formaat_en_module_moeten_overeenkomen() {
        assert!(filter("odt", "docx", "docx").is_ok());
        assert!(filter("xls", "xlsx", "xlsx").is_ok());
        assert!(filter("ppt", "pptx", "pptx").is_ok());
        assert!(filter("odt", "xlsx", "xlsx").is_err());
        assert!(filter("../doc", "docx", "docx").is_err());
        assert!(filter("docx", "exe", "docx").is_err());
        assert!(!mag_bewaren("exe"));
    }
    #[test]
    #[ignore = "Vereist een lokale LibreOffice-installatie"]
    fn drie_odf_formaten_heen_en_terug() {
        for (module, odf) in [("docx", "odt"), ("xlsx", "ods"), ("pptx", "odp")] {
            let pad = Path::new(env!("CARGO_MANIFEST_DIR"))
                .join(format!("../public/templates/nieuw.{module}"));
            let origineel = fs::read(pad).unwrap();
            let open_document = converteer(&origineel, module, odf, module).unwrap();
            let opnieuw = converteer(&open_document, odf, module, module).unwrap();
            assert!(opnieuw.starts_with(b"PK"));
            assert!(!open_document.is_empty());
        }
    }
    #[test]
    #[ignore = "Vereist een lokale LibreOffice-installatie en OFFICE_TEST_UIT"]
    fn voorbeelden_in_odf_oud_en_pdf() {
        let uit = PathBuf::from(
            std::env::var_os("OFFICE_TEST_UIT")
                .expect("Kies een uitvoermap voor de controlebestanden"),
        );
        fs::create_dir_all(&uit).unwrap();
        let mut metingen = vec![];
        for (module, naam, formaten) in [
            ("docx", "Ontwerpnotitie", ["odt", "doc", "pdf"]),
            ("xlsx", "Materiaaloverzicht", ["ods", "xls", "pdf"]),
            ("pptx", "Ontwerpvisie", ["odp", "ppt", "pdf"]),
        ] {
            let origineel = fs::read(
                Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join(format!("../docs/voorbeelden/{naam}.{module}")),
            )
            .unwrap();
            for formaat in formaten {
                let start = Instant::now();
                let omgezet = converteer(&origineel, module, formaat, module).unwrap();
                metingen.push(serde_json::json!({"van": module, "naar": formaat, "ms": start.elapsed().as_millis(), "bytes": omgezet.len()}));
                fs::write(uit.join(format!("{naam}.{formaat}")), &omgezet).unwrap();
                if formaat == "pdf" {
                    assert!(omgezet.starts_with(b"%PDF-"));
                } else {
                    let start = Instant::now();
                    let heropend = converteer(&omgezet, formaat, module, module).unwrap();
                    assert!(heropend.starts_with(b"PK"));
                    metingen.push(serde_json::json!({"van": formaat, "naar": module, "ms": start.elapsed().as_millis(), "bytes": heropend.len()}));
                    fs::write(uit.join(format!("{naam}-via-{formaat}.{module}")), heropend)
                        .unwrap();
                }
            }
        }
        if let Some(pad) = std::env::var_os("OFFICE_TEST_STRICT") {
            let bron = fs::read(pad).unwrap();
            let omgezet = converteer(&bron, "xlsx", "xlsx", "xlsx").unwrap();
            assert!(omgezet.starts_with(b"PK"));
            fs::write(uit.join("Strict-omgezet.xlsx"), omgezet).unwrap();
        }
        fs::write(
            uit.join("metingen.json"),
            serde_json::to_vec_pretty(&metingen).unwrap(),
        )
        .unwrap();
    }
}
