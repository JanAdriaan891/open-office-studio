import type { MailFout, MailFoutcode } from "./contract";

const CODES: MailFoutcode[] = [
  "verbinding", "aanmelding", "certificaat", "tijdslimiet", "niet-gevonden",
  "geweigerd", "te-groot", "niet-beschikbaar", "intern",
];

export class MailFoutMelding extends Error implements MailFout {
  constructor(
    public code: MailFoutcode,
    public melding: string,
  ) {
    super(melding);
  }
}

/** Zet elke fout (van invoke, de demo of de interface) om naar `MailFout`. */
export function naarMailFout(fout: unknown): MailFoutMelding {
  if (fout instanceof MailFoutMelding) return fout;
  let waarde: unknown = fout;
  if (typeof waarde === "string") {
    try {
      waarde = JSON.parse(waarde);
    } catch {
      // Gewone tekst.
    }
  }
  if (waarde && typeof waarde === "object" && "code" in waarde) {
    const { code, melding } = waarde as { code: unknown; melding?: unknown };
    if (typeof code === "string" && (CODES as string[]).includes(code))
      return new MailFoutMelding(code as MailFoutcode, String(melding ?? ""));
  }
  const tekst = fout instanceof Error ? fout.message : String(fout);
  // Een desktopversie zonder e-mailbackend meldt een onbekende opdracht.
  if (/command .*email_.* not found|not allowed|unknown command/i.test(tekst))
    return new MailFoutMelding("niet-beschikbaar", "De e-mailfunctie ontbreekt in deze versie van de desktopapp.");
  return new MailFoutMelding("intern", tekst);
}

const UITLEG: Record<MailFoutcode, string> = {
  verbinding: "Geen verbinding met de server. Controleer je internetverbinding en de servernaam en poort.",
  aanmelding: "Aanmelden mislukt. Controleer gebruikersnaam en wachtwoord (Extra › Accountinstellingen).",
  certificaat: "Het certificaat van de server wordt niet vertrouwd of hoort niet bij deze servernaam.",
  tijdslimiet: "De server reageerde niet op tijd. Probeer het later opnieuw.",
  "niet-gevonden": "Het bericht of de map bestaat niet (meer) op de server.",
  geweigerd: "De server heeft de opdracht geweigerd.",
  "te-groot": "Het bericht is te groot voor de server. Verklein of verwijder bijlagen.",
  "niet-beschikbaar": "Deze functie is hier niet beschikbaar.",
  intern: "Er ging iets mis.",
};

/** Leesbare melding: uitleg per oorzaak plus de servermelding. */
export function foutTekst(fout: unknown, context = "") {
  const f = naarMailFout(fout);
  const uitleg = UITLEG[f.code];
  const detail = f.melding && f.melding !== uitleg ? ` (${f.melding})` : "";
  return `${context ? context + ": " : ""}${uitleg}${detail}`;
}
