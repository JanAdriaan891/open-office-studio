#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{
    ffi::OsString,
    io::Write,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use tauri::Manager;
mod conversie;

fn lees_bytes(request: &tauri::ipc::Request<'_>) -> Result<Vec<u8>, String> {
    match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes)
            if !bytes.is_empty() && bytes.len() <= 100 * 1024 * 1024 =>
        {
            Ok(bytes.clone())
        }
        _ => Err(
            "Het bestand is leeg, groter dan 100 MB of niet als binaire gegevens verzonden.".into(),
        ),
    }
}

#[tauri::command]
async fn converteer_document(
    request: tauri::ipc::Request<'_>,
) -> Result<tauri::ipc::Response, String> {
    let bytes = lees_bytes(&request)?;
    let kop = |naam| {
        request
            .headers()
            .get(naam)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned)
            .ok_or_else(|| "De formaatinformatie ontbreekt.".to_owned())
    };
    let bron = kop("x-office-bron")?;
    let doel = kop("x-office-doel")?;
    let module = kop("x-office-module")?;
    tauri::async_runtime::spawn_blocking(move || {
        conversie::converteer(&bytes, &bron, &doel, &module).map(tauri::ipc::Response::new)
    })
    .await
    .map_err(|e| e.to_string())?
}

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
async fn bewaar_kopie(request: tauri::ipc::Request<'_>) -> Result<Option<String>, String> {
    let bytes = lees_bytes(&request)?;
    let naam = request
        .headers()
        .get("x-office-naam")
        .and_then(|v| v.to_str().ok())
        .ok_or("De bestandsnaam ontbreekt.")?;
    let naam = percent_encoding::percent_decode_str(naam)
        .decode_utf8()
        .map_err(|_| "De bestandsnaam bevat ongeldige tekens.")?
        .into_owned();
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
    if !conversie::mag_bewaren(&extensie) {
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

/// Het bestand waarmee de app is gestart, bijvoorbeeld via een bestandskoppeling.
struct Startbestand(Mutex<Option<PathBuf>>);

fn startpad(argumenten: impl Iterator<Item = OsString>) -> Option<PathBuf> {
    argumenten
        .skip(1)
        .map(PathBuf::from)
        .find(|pad| pad.is_file())
}

fn lees_beperkt(pad: &Path) -> Result<Vec<u8>, String> {
    let grootte = std::fs::metadata(pad).map_err(|e| e.to_string())?.len();
    if grootte == 0 || grootte > 100 * 1024 * 1024 {
        return Err("Het bestand is leeg of groter dan 100 MB.".into());
    }
    std::fs::read(pad).map_err(|e| e.to_string())
}

#[tauri::command]
fn startbestand(start: tauri::State<Startbestand>) -> Option<String> {
    let pad = start.0.lock().ok()?;
    Some(pad.as_ref()?.file_name()?.to_string_lossy().into_owned())
}

// Het pad komt uitsluitend uit de opstartargumenten en wordt één keer afgegeven.
#[tauri::command]
async fn lees_startbestand(
    start: tauri::State<'_, Startbestand>,
) -> Result<tauri::ipc::Response, String> {
    let pad = start
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .take()
        .ok_or("Er is geen startbestand.")?;
    tauri::async_runtime::spawn_blocking(move || lees_beperkt(&pad).map(tauri::ipc::Response::new))
        .await
        .map_err(|e| e.to_string())?
}

fn main() {
    tauri::Builder::default()
        .manage(AtomicBool::new(false))
        .manage(Startbestand(Mutex::new(startpad(std::env::args_os()))))
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
            bevestig_verlaten,
            converteer_document,
            startbestand,
            lees_startbestand
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
    #[test]
    fn startpad_neemt_alleen_een_bestaand_bestand() {
        let map = tempfile::tempdir().unwrap();
        let pad = map.path().join("notitie.docx");
        std::fs::write(&pad, b"inhoud").unwrap();
        let argumenten = |rest: Vec<OsString>| {
            std::iter::once(OsString::from("open-office-studio.exe")).chain(rest)
        };
        let ontbreekt = map.path().join("ontbreekt.docx");
        assert_eq!(startpad(argumenten(vec![])), None);
        assert_eq!(
            startpad(argumenten(vec!["--vlag".into(), ontbreekt.into()])),
            None
        );
        assert_eq!(
            startpad(argumenten(vec!["--vlag".into(), pad.clone().into()])),
            Some(pad.clone())
        );
        // Het programma zelf telt nooit mee als startbestand.
        assert_eq!(startpad(std::iter::once(pad.into_os_string())), None);
    }
    #[test]
    fn startbestand_lezen_weigert_leeg_bestand() {
        let map = tempfile::tempdir().unwrap();
        let leeg = map.path().join("leeg.xlsx");
        std::fs::write(&leeg, b"").unwrap();
        assert!(lees_beperkt(&leeg).is_err());
        let gevuld = map.path().join("gevuld.xlsx");
        std::fs::write(&gevuld, b"PK").unwrap();
        assert_eq!(lees_beperkt(&gevuld).unwrap(), b"PK");
    }
}
