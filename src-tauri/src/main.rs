#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{
    io::Write,
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::Manager;

#[tauri::command]
fn wijzigingsstatus(gewijzigd: bool, status: tauri::State<AtomicBool>) {
    status.store(gewijzigd, Ordering::SeqCst);
}

#[tauri::command]
async fn bevestig_verlaten() -> bool {
    rfd::AsyncMessageDialog::new()
        .set_title("Niet-opgeslagen wijzigingen")
        .set_description("Wijzigingen die nog niet zijn opgeslagen gaan verloren. Toch sluiten?")
        .set_buttons(rfd::MessageButtons::YesNo)
        .show()
        .await
        == rfd::MessageDialogResult::Yes
}

fn schrijf_atomair(pad: &Path, bytes: &[u8]) -> Result<(), String> {
    let map = pad.parent().ok_or("De doelmap ontbreekt.")?;
    let mut tijdelijk = tempfile::NamedTempFile::new_in(map).map_err(|e| e.to_string())?;
    tijdelijk.write_all(bytes).map_err(|e| e.to_string())?;
    tijdelijk.as_file().sync_all().map_err(|e| e.to_string())?;
    tijdelijk.persist(pad).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn bewaar_kopie(naam: String, bytes: Vec<u8>) -> Result<Option<String>, String> {
    if bytes.is_empty() || bytes.len() > 100 * 1024 * 1024 {
        return Err("Het bestand is leeg of groter dan 100 MB.".into());
    }
    let bestandsnaam = Path::new(&naam)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("Naamloos.docx")
        .to_owned();
    let extensie = Path::new(&bestandsnaam)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !["docx", "xlsx", "pptx"].contains(&extensie.as_str()) {
        return Err("Niet-ondersteund bestandsformaat.".into());
    }
    let bestand = rfd::AsyncFileDialog::new()
        .set_title("Kopie opslaan")
        .set_file_name(&bestandsnaam)
        .add_filter("Kantoorbestand", &[&extensie])
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
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        != Some(extensie)
    {
        return Err("De gekozen extensie past niet bij het document.".into());
    }
    if pad.exists() {
        let bevestiging = rfd::AsyncMessageDialog::new()
            .set_title("Bestand vervangen")
            .set_description(format!(
                "Het bestand {} bestaat al. Vervangen?",
                pad.display()
            ))
            .set_buttons(rfd::MessageButtons::YesNo)
            .show()
            .await;
        if bevestiging != rfd::MessageDialogResult::Yes {
            return Ok(None);
        }
    }
    // Het doel komt uitsluitend uit de native dialoog, nooit uit een frontendpad.
    tauri::async_runtime::spawn_blocking(move || {
        schrijf_atomair(&pad, &bytes)?;
        Ok(Some(pad.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn main() {
    tauri::Builder::default()
        .manage(AtomicBool::new(false))
        .on_window_event(|venster, gebeurtenis| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = gebeurtenis {
                if venster.state::<AtomicBool>().load(Ordering::SeqCst) {
                    api.prevent_close();
                    let venster = venster.clone();
                    tauri::async_runtime::spawn(async move {
                        if bevestig_verlaten().await {
                            let _ = venster.destroy();
                        }
                    });
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            bewaar_kopie,
            wijzigingsstatus,
            bevestig_verlaten
        ])
        .run(tauri::generate_context!())
        .expect("De kantooromgeving kon niet starten");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn vervangt_bestand_volledig() {
        let map = tempfile::tempdir().unwrap();
        let pad = map.path().join("test.docx");
        std::fs::write(&pad, b"oude langere inhoud").unwrap();
        schrijf_atomair(&pad, b"nieuw").unwrap();
        assert_eq!(std::fs::read(&pad).unwrap(), b"nieuw");
        assert_eq!(std::fs::read_dir(map.path()).unwrap().count(), 1);
    }
    #[test]
    fn fout_laat_bestaande_inhoud_met_rust() {
        let map = tempfile::tempdir().unwrap();
        let origineel = map.path().join("origineel.docx");
        std::fs::write(&origineel, b"behouden").unwrap();
        assert!(schrijf_atomair(&map.path().join("ontbreekt/test.docx"), b"nieuw").is_err());
        assert_eq!(std::fs::read(origineel).unwrap(), b"behouden");
    }
}
