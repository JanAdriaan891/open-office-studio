import type { BewaarUitkomst } from "./opslag";

/** Melding na Opslaan (als) voor het tabblad dat is bewaard. */
export function opslagMelding(uitkomst: BewaarUitkomst) {
  return (
    (uitkomst.status === "opgeslagen"
      ? "Opgeslagen: " + uitkomst.pad
      : uitkomst.status === "geëxporteerd"
        ? "Geëxporteerd: " +
          uitkomst.pad +
          ". Sla je bewerkbare bestand ook op om de wijzigingen te behouden."
        : uitkomst.status === "geannuleerd"
          ? "Opslaan geannuleerd."
          : "Download aangevraagd. Controleer het bestand in je downloads.") +
    (uitkomst.toelichting ? " " + uitkomst.toelichting : "")
  );
}
