//! Foutmodel van Email Studio: elke fout gaat als `{code, melding}` naar de
//! interface (zie `MailFoutcode` in `packages/email/src/contract.ts`).
//! Meldingen zijn Nederlandstalig en bevatten nooit wachtwoorden of tokens.

use serde::Serialize;
use std::fmt;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Foutcode {
    Verbinding,
    Aanmelding,
    Certificaat,
    Tijdslimiet,
    NietGevonden,
    Geweigerd,
    TeGroot,
    NietBeschikbaar,
    Intern,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct MailFout {
    pub code: Foutcode,
    pub melding: String,
}

pub type Uitkomst<T> = Result<T, MailFout>;

impl MailFout {
    pub fn nieuw(code: Foutcode, melding: impl Into<String>) -> Self {
        Self {
            code,
            melding: melding.into(),
        }
    }
    pub fn verbinding(m: impl Into<String>) -> Self {
        Self::nieuw(Foutcode::Verbinding, m)
    }
    pub fn aanmelding(m: impl Into<String>) -> Self {
        Self::nieuw(Foutcode::Aanmelding, m)
    }
    pub fn certificaat(m: impl Into<String>) -> Self {
        Self::nieuw(Foutcode::Certificaat, m)
    }
    pub fn tijdslimiet(m: impl Into<String>) -> Self {
        Self::nieuw(Foutcode::Tijdslimiet, m)
    }
    pub fn niet_gevonden(m: impl Into<String>) -> Self {
        Self::nieuw(Foutcode::NietGevonden, m)
    }
    pub fn geweigerd(m: impl Into<String>) -> Self {
        Self::nieuw(Foutcode::Geweigerd, m)
    }
    pub fn te_groot(m: impl Into<String>) -> Self {
        Self::nieuw(Foutcode::TeGroot, m)
    }
    pub fn niet_beschikbaar(m: impl Into<String>) -> Self {
        Self::nieuw(Foutcode::NietBeschikbaar, m)
    }
    pub fn intern(m: impl Into<String>) -> Self {
        Self::nieuw(Foutcode::Intern, m)
    }

    /// Verwijdert een geheim uit de melding, voor het geval een server of
    /// bibliotheek het (onverhoopt) terugkaatst.
    pub fn zonder_geheim(mut self, geheim: &str) -> Self {
        if geheim.len() >= 3 && self.melding.contains(geheim) {
            self.melding = self.melding.replace(geheim, "••••");
        }
        self
    }
}

impl fmt::Display for MailFout {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}: {}", self.code, self.melding)
    }
}

impl std::error::Error for MailFout {}

/// Kort en veilig: servertekst wordt ingekort en ontdaan van stuurtekens.
pub fn servertekst(tekst: &str) -> String {
    let schoon: String = tekst
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let schoon = schoon.trim();
    if schoon.chars().count() > 200 {
        format!("{}…", schoon.chars().take(200).collect::<String>())
    } else {
        schoon.to_string()
    }
}

/// Vertaalt een I/O-fout (inclusief TLS-fouten van rustls) naar een mailfout.
pub fn uit_io(fout: &std::io::Error, host: &str) -> MailFout {
    if let Some(binnen) = fout.get_ref() {
        if let Some(tls) = binnen.downcast_ref::<rustls::Error>() {
            return uit_tls(tls, host);
        }
    }
    use std::io::ErrorKind::*;
    match fout.kind() {
        TimedOut => MailFout::tijdslimiet(format!(
            "De server {host} reageerde niet op tijd. Controleer de servernaam, de poort en de firewall."
        )),
        ConnectionRefused => MailFout::verbinding(format!(
            "De server {host} weigerde de verbinding. Controleer de poort en de beveiligingsinstelling."
        )),
        NotFound => MailFout::verbinding(format!("De servernaam {host} is niet gevonden.")),
        ConnectionReset | ConnectionAborted | BrokenPipe | UnexpectedEof => {
            MailFout::verbinding(format!(
                "De verbinding met {host} werd onverwacht verbroken. Past de beveiliging (SSL/TLS of STARTTLS) bij de poort?"
            ))
        }
        _ => MailFout::verbinding(format!(
            "Geen verbinding met {host}: {}",
            servertekst(&fout.to_string())
        )),
    }
}

pub fn uit_tls(fout: &rustls::Error, host: &str) -> MailFout {
    use rustls::{CertificateError, Error};
    match fout {
        Error::InvalidCertificate(c) => {
            let reden = match c {
                CertificateError::Expired | CertificateError::ExpiredContext { .. } => {
                    "het certificaat is verlopen".to_string()
                }
                CertificateError::NotValidYet | CertificateError::NotValidYetContext { .. } => {
                    "het certificaat is nog niet geldig (klopt de klok van deze computer?)".into()
                }
                CertificateError::UnknownIssuer => {
                    "het certificaat is niet uitgegeven door een vertrouwde certificaatautoriteit (mogelijk zelfondertekend)".into()
                }
                CertificateError::NotValidForName
                | CertificateError::NotValidForNameContext { .. } => {
                    format!("het certificaat hoort niet bij de naam {host}; gebruik de servernaam die op het certificaat staat")
                }
                CertificateError::Revoked => "het certificaat is ingetrokken".into(),
                andere => format!("het certificaat is ongeldig ({andere:?})"),
            };
            MailFout::certificaat(format!(
                "De beveiligde verbinding met {host} is geweigerd: {reden}. \
                 Om je wachtwoord te beschermen maakt Email Studio geen verbinding met een server waarvan de identiteit niet vaststaat."
            ))
        }
        andere => MailFout::verbinding(format!(
            "De beveiligde verbinding met {host} kwam niet tot stand ({}). Past de beveiliging (SSL/TLS of STARTTLS) bij de poort?",
            servertekst(&andere.to_string())
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serialiseert_volgens_contract() {
        let f = MailFout::niet_beschikbaar("x");
        assert_eq!(
            serde_json::to_value(&f).unwrap(),
            serde_json::json!({"code": "niet-beschikbaar", "melding": "x"})
        );
        assert_eq!(
            serde_json::to_value(Foutcode::TeGroot).unwrap(),
            serde_json::json!("te-groot")
        );
    }

    #[test]
    fn verwijdert_geheim_uit_melding() {
        let f = MailFout::aanmelding("server zei: geheim123 fout").zonder_geheim("geheim123");
        assert!(!f.melding.contains("geheim123"));
    }

    #[test]
    fn certificaatfout_wordt_herkend() {
        let io = std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            rustls::Error::InvalidCertificate(rustls::CertificateError::UnknownIssuer),
        );
        let f = uit_io(&io, "mail.example.org");
        assert_eq!(f.code, Foutcode::Certificaat);
        assert!(f.melding.contains("vertrouwde"));
    }
}
