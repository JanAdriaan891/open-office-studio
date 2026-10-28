/**
 * Talen van de spellingcontrole en de koppeling met OOXML-taalcodes
 * (`w:lang/@w:val`, bijvoorbeeld "nl-NL" of "en-GB").
 */

export type TaalId = "nl" | "en-GB" | "en-US";
/** Een taal zonder woordenboek: niet controleren (zoals Word). */
export type Taal = TaalId | "geen";

export const TALEN: readonly { id: TaalId; naam: string; kort: string }[] = [
  { id: "nl", naam: "Nederlands", kort: "NL" },
  { id: "en-GB", naam: "Engels (Verenigd Koninkrijk)", kort: "EN-GB" },
  { id: "en-US", naam: "Engels (Verenigde Staten)", kort: "EN-US" },
];

export const taalNaam = (taal: Taal) =>
  taal === "geen" ? "Niet controleren" : (TALEN.find((t) => t.id === taal)?.naam ?? taal);
export const taalKort = (taal: Taal) =>
  taal === "geen" ? "—" : (TALEN.find((t) => t.id === taal)?.kort ?? taal);

/**
 * Een OOXML/BCP-47-taalcode naar een woordenboek. Onbekende talen (Duits,
 * Frans, …) geven "geen"; een lege code geeft null (erven).
 */
export function taalUitCode(code: string | null | undefined): Taal | null {
  if (!code) return null;
  const c = code.trim().replace("_", "-").toLowerCase();
  if (!c) return null;
  if (c === "nl" || c.startsWith("nl-")) return "nl";
  if (c === "en-us" || c === "en-ca" || c === "en") return "en-US";
  if (c.startsWith("en-")) return "en-GB";
  // x-none en zxx ("geen taal") zijn in Word: niet controleren.
  return "geen";
}

/** Het woordenboek voor de taal van de gebruikersinterface/het systeem. */
export function standaardTaal(voorkeur?: readonly string[]): TaalId {
  const lijst = voorkeur ?? (typeof navigator !== "undefined" ? navigator.languages : []) ?? [];
  for (const code of lijst) {
    const taal = taalUitCode(code);
    if (taal && taal !== "geen") return taal;
  }
  return "nl";
}
