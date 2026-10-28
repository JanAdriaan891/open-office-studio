import type { Adres } from "./contract";

/**
 * Adresregels zoals een gebruiker ze typt of plakt:
 * `"Jansen, Piet" <piet@voorbeeld.nl>, info@voorbeeld.nl; Ans <ans@voorbeeld.nl>`.
 * Komma's en puntkomma's binnen aanhalingstekens of punthaken scheiden niet.
 */
export function splitsAdresregel(regel: string): string[] {
  const delen: string[] = [];
  let huidig = "";
  let citaat = false;
  let haak = false;
  for (let i = 0; i < regel.length; i++) {
    const teken = regel[i];
    if (teken === "\\" && citaat && i + 1 < regel.length) {
      huidig += teken + regel[++i];
      continue;
    }
    if (teken === '"' && !haak) citaat = !citaat;
    else if (teken === "<" && !citaat) haak = true;
    else if (teken === ">" && !citaat) haak = false;
    if ((teken === "," || teken === ";" || teken === "\n") && !citaat && !haak) {
      if (huidig.trim()) delen.push(huidig.trim());
      huidig = "";
      continue;
    }
    huidig += teken;
  }
  if (huidig.trim()) delen.push(huidig.trim());
  return delen;
}

/** Eén adres ontleden; geeft null bij een onleesbaar adres. */
export function parseAdres(tekst: string): Adres | null {
  const invoer = tekst.trim();
  if (!invoer) return null;
  const haak = invoer.match(/^(.*?)<\s*([^<>\s]+)\s*>\s*$/s);
  if (haak) {
    let naam = haak[1].trim();
    if (naam.startsWith('"') && naam.endsWith('"') && naam.length >= 2)
      naam = naam.slice(1, -1).replace(/\\(.)/g, "$1");
    return { naam: naam.trim(), adres: haak[2] };
  }
  const kaal = invoer.replace(/^mailto:/i, "");
  if (/\s/.test(kaal)) return null;
  return { naam: "", adres: kaal };
}

export function parseAdressen(regel: string): Adres[] {
  return splitsAdresregel(regel)
    .map(parseAdres)
    .filter((adres): adres is Adres => adres !== null);
}

const ADRES = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:.]{2,}$/;
export function isGeldigAdres(adres: string) {
  return ADRES.test(adres) && !adres.includes("..");
}

/** Weergave volgens RFC 5322: naam tussen aanhalingstekens als dat nodig is. */
export function formatAdres(adres: Adres): string {
  if (!adres.naam || adres.naam === adres.adres) return adres.adres;
  const naam = /[",;:<>@()[\]\\.]/.test(adres.naam)
    ? `"${adres.naam.replace(/(["\\])/g, "\\$1")}"`
    : adres.naam;
  return `${naam} <${adres.adres}>`;
}

export function formatAdressen(adressen: Adres[]) {
  return adressen.map(formatAdres).join(", ");
}

/** Korte weergave voor lijsten: naam als die er is, anders het adres. */
export function toonAdres(adres?: Adres) {
  if (!adres) return "(onbekend)";
  return adres.naam || adres.adres;
}

export function zelfdeAdres(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Ontdubbelt op adres (hoofdletterongevoelig) en laat de eerste naam staan. */
export function uniekeAdressen(adressen: Adres[], zonder: string[] = []) {
  const gezien = new Set(zonder.map((a) => a.toLowerCase()));
  const uit: Adres[] = [];
  for (const adres of adressen) {
    const sleutel = adres.adres.toLowerCase();
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    uit.push(adres);
  }
  return uit;
}
