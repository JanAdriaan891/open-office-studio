//! Losgemaakte documentvensters en sluitbeveiliging per venster.
//!
//! Een tabblad gaat naar een ander venster via een eenmalige sleutel: het
//! bronvenster biedt het pakket aan (`bied_overdracht`), het doelvenster neemt
//! het op (`neem_overdracht`), opent het en bevestigt (`bevestig_overdracht`).
//! Pas dan krijgt de bron `office-overdracht-bevestigd` en sluit die het
//! tabblad. Zo staan bytes nooit in een URL en gaat er niets verloren als het
//! nieuwe venster niet opent.
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};
use tauri::{Emitter, Manager};

/// Grootste pakket: document (100 MB) plus een kleine JSON-kop.
const MAX_PAKKET: usize = 100 * 1024 * 1024 + 64 * 1024;
/// Vensterlabels van losgemaakte vensters; zie `capabilities/default.json`.
const VOORVOEGSEL: &str = "document-";

struct Pakket {
    bron: String,
    /// Het nieuw geopende venster, om het te sluiten als de overdracht vervalt.
    venster: Option<String>,
    bytes: Vec<u8>,
    geclaimd: bool,
}

#[derive(Default)]
pub struct Vensters {
    /// Aantal tabbladen met niet-opgeslagen wijzigingen per vensterlabel.
    gewijzigd: Mutex<HashMap<String, u32>>,
    pakketten: Mutex<HashMap<String, Pakket>>,
    teller: AtomicU64,
}

impl Vensters {
    fn volgende(&self) -> u64 {
        self.teller.fetch_add(1, Ordering::SeqCst) + 1
    }

    pub fn aantal_gewijzigd(&self, label: &str) -> u32 {
        self.gewijzigd
            .lock()
            .map(|g| g.get(label).copied().unwrap_or(0))
            .unwrap_or(0)
    }

    fn vergeet(&self, label: &str) {
        if let Ok(mut g) = self.gewijzigd.lock() {
            g.remove(label);
        }
    }
}

/// Sluitmelding met het aantal documenten in dit venster.
pub fn sluitvraag(aantal: u32) -> String {
    match aantal {
        0 | 1 => "Eén document in dit venster bevat wijzigingen die nog niet zijn opgeslagen. Die gaan verloren. Toch sluiten?".to_owned(),
        n => format!("{n} documenten in dit venster bevatten wijzigingen die nog niet zijn opgeslagen. Die gaan verloren. Toch sluiten?"),
    }
}

#[tauri::command]
pub fn wijzigingsstatus(
    venster: tauri::Window,
    gewijzigd: bool,
    aantal: Option<u32>,
    vensters: tauri::State<Vensters>,
) {
    let aantal = if gewijzigd { aantal.unwrap_or(1).max(1) } else { 0 };
    if let Ok(mut g) = vensters.gewijzigd.lock() {
        g.insert(venster.label().to_owned(), aantal);
    }
}

#[tauri::command]
pub async fn bevestig_verlaten(aantal: Option<u32>) -> bool {
    rfd::AsyncMessageDialog::new()
        .set_title("Niet-opgeslagen wijzigingen")
        .set_description(sluitvraag(aantal.unwrap_or(1)))
        .set_buttons(rfd::MessageButtons::YesNo)
        .show()
        .await
        == rfd::MessageDialogResult::Yes
}

/// Sluitbeveiliging per venster; de app stopt als het laatste venster sluit.
pub fn bij_venstergebeurtenis(venster: &tauri::Window, gebeurtenis: &tauri::WindowEvent) {
    match gebeurtenis {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            let aantal = venster.state::<Vensters>().aantal_gewijzigd(venster.label());
            if aantal > 0 {
                api.prevent_close();
                let venster = venster.clone();
                tauri::async_runtime::spawn(async move {
                    if bevestig_verlaten(Some(aantal)).await {
                        venster.state::<Vensters>().vergeet(venster.label());
                        let _ = venster.destroy();
                    }
                });
            }
        }
        tauri::WindowEvent::Destroyed => {
            venster.state::<Vensters>().vergeet(venster.label());
        }
        _ => {}
    }
}

fn kop(request: &tauri::ipc::Request<'_>, naam: &str) -> Option<String> {
    let waarde = request.headers().get(naam)?.to_str().ok()?;
    percent_encoding::percent_decode_str(waarde)
        .decode_utf8()
        .ok()
        .map(|s| s.into_owned())
}

/// Biedt een tabblad aan; `x-office-doel` is "nieuw" of het label van een bestaand venster.
#[tauri::command]
pub async fn bied_overdracht(
    app: tauri::AppHandle,
    venster: tauri::Window,
    request: tauri::ipc::Request<'_>,
) -> Result<String, String> {
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(b) if b.len() >= 4 && b.len() <= MAX_PAKKET => b.clone(),
        _ => return Err("De overdracht is leeg of te groot.".into()),
    };
    let doel = kop(&request, "x-office-doel").unwrap_or_else(|| "nieuw".into());
    let vensters = app.state::<Vensters>();
    let sleutel = format!("o{}", vensters.volgende());
    let label = (doel == "nieuw").then(|| format!("{VOORVOEGSEL}{}", vensters.volgende()));
    vensters
        .pakketten
        .lock()
        .map_err(|e| e.to_string())?
        .insert(
            sleutel.clone(),
            Pakket {
                bron: venster.label().to_owned(),
                venster: label.clone(),
                bytes,
                geclaimd: false,
            },
        );
    let resultaat = match &label {
        Some(label) => {
            let titel = kop(&request, "x-office-titel")
                .map(|t| t.chars().take(200).collect::<String>())
                .unwrap_or_else(|| "Open Office Studio".into());
            let positie = kop(&request, "x-office-x")
                .zip(kop(&request, "x-office-y"))
                .and_then(|(x, y)| Some((x.parse::<f64>().ok()?, y.parse::<f64>().ok()?)));
            maak_venster(&app, label, &titel, &sleutel, positie)
        }
        None => {
            if app.get_webview_window(&doel).is_none() {
                Err("Het hoofdvenster is niet beschikbaar.".into())
            } else {
                app.emit_to(doel.as_str(), "office-overdracht", sleutel.clone())
                    .map_err(|e| e.to_string())
            }
        }
    };
    if let Err(fout) = resultaat {
        vensters.pakketten.lock().map_err(|e| e.to_string())?.remove(&sleutel);
        return Err(format!("Het venster kon niet worden geopend: {fout}"));
    }
    Ok(sleutel)
}

fn maak_venster(
    app: &tauri::AppHandle,
    label: &str,
    titel: &str,
    sleutel: &str,
    positie: Option<(f64, f64)>,
) -> Result<(), String> {
    let url = format!("index.html?venster=document&overdracht={sleutel}");
    let mut bouwer =
        tauri::WebviewWindowBuilder::new(app, label, tauri::WebviewUrl::App(url.into()))
            .title(titel)
            .inner_size(1200.0, 800.0)
            .min_inner_size(800.0, 600.0);
    bouwer = match positie {
        // Het venster verschijnt onder de muis, met de tabbalk ongeveer onder de cursor.
        Some((x, y)) => bouwer.position((x - 160.0).max(0.0), (y - 50.0).max(0.0)),
        None => bouwer.center(),
    };
    bouwer.build().map(|_| ()).map_err(|e| e.to_string())
}

/// Het doelvenster neemt het pakket op; het blijft bewaard tot bevestigen of weigeren.
#[tauri::command]
pub fn neem_overdracht(
    sleutel: String,
    vensters: tauri::State<Vensters>,
) -> Result<tauri::ipc::Response, String> {
    let mut pakketten = vensters.pakketten.lock().map_err(|e| e.to_string())?;
    let pakket = pakketten
        .get_mut(&sleutel)
        .ok_or("Deze overdracht is verlopen of al opgenomen.")?;
    if pakket.geclaimd {
        return Err("Deze overdracht is al opgenomen.".into());
    }
    pakket.geclaimd = true;
    Ok(tauri::ipc::Response::new(pakket.bytes.clone()))
}

#[tauri::command]
pub fn bevestig_overdracht(
    app: tauri::AppHandle,
    sleutel: String,
    vensters: tauri::State<Vensters>,
) -> Result<(), String> {
    let pakket = vensters
        .pakketten
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&sleutel)
        .ok_or("Deze overdracht is onbekend.")?;
    app.emit_to(pakket.bron.as_str(), "office-overdracht-bevestigd", sleutel)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn weiger_overdracht(
    app: tauri::AppHandle,
    sleutel: String,
    vensters: tauri::State<Vensters>,
) -> Result<(), String> {
    let Some(pakket) = vensters
        .pakketten
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&sleutel)
    else {
        return Ok(());
    };
    app.emit_to(pakket.bron.as_str(), "office-overdracht-geweigerd", sleutel)
        .map_err(|e| e.to_string())
}

/// Na een time-out: intrekken als nog niet opgenomen ("ingetrokken"), anders "geclaimd".
#[tauri::command]
pub fn trek_overdracht_in(
    app: tauri::AppHandle,
    sleutel: String,
    vensters: tauri::State<Vensters>,
) -> Result<String, String> {
    let mut pakketten = vensters.pakketten.lock().map_err(|e| e.to_string())?;
    let stand = trek_in(&mut pakketten, &sleutel);
    drop(pakketten);
    if let Some(Some(label)) = stand.as_ref().ok() {
        // Het lege venster dat het pakket nooit opnam, verdwijnt weer.
        if let Some(venster) = app.get_webview_window(label) {
            let _ = venster.destroy();
        }
    }
    Ok(match stand {
        Ok(_) => "ingetrokken",
        Err(true) => "geclaimd",
        Err(false) => "onbekend",
    }
    .into())
}

/// Ok(venster) als ingetrokken; Err(true) als al opgenomen; Err(false) als onbekend.
fn trek_in(
    pakketten: &mut HashMap<String, Pakket>,
    sleutel: &str,
) -> Result<Option<String>, bool> {
    match pakketten.get(sleutel) {
        None => Err(false),
        Some(p) if p.geclaimd => Err(true),
        Some(_) => Ok(pakketten.remove(sleutel).and_then(|p| p.venster)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pakket(geclaimd: bool) -> Pakket {
        Pakket {
            bron: "main".into(),
            venster: Some("document-2".into()),
            bytes: vec![0, 0, 0, 0],
            geclaimd,
        }
    }

    #[test]
    fn intrekken_alleen_als_nog_niet_opgenomen() {
        let mut p = HashMap::new();
        p.insert("a".to_owned(), pakket(false));
        p.insert("b".to_owned(), pakket(true));
        assert_eq!(trek_in(&mut p, "a"), Ok(Some("document-2".into())));
        assert!(!p.contains_key("a"));
        assert_eq!(trek_in(&mut p, "b"), Err(true));
        assert!(p.contains_key("b"));
        assert_eq!(trek_in(&mut p, "c"), Err(false));
    }

    #[test]
    fn sluitvraag_noemt_het_aantal() {
        assert!(sluitvraag(1).starts_with("Eén document"));
        assert!(sluitvraag(3).starts_with("3 documenten"));
    }

    #[test]
    fn wijzigingen_per_venster() {
        let v = Vensters::default();
        v.gewijzigd.lock().unwrap().insert("main".into(), 2);
        assert_eq!(v.aantal_gewijzigd("main"), 2);
        assert_eq!(v.aantal_gewijzigd("document-1"), 0);
        v.vergeet("main");
        assert_eq!(v.aantal_gewijzigd("main"), 0);
    }
}
