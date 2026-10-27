/**
 * Lokale voorkeuren van de interface (per gebruiker, in deze browser/webview):
 * toestemming voor externe inhoud en de kolomindeling. Alles in try/catch,
 * want opslag kan ontbreken of geblokkeerd zijn.
 */
const EXTERN = "openaec-email-extern";
const INDELING = "openaec-email-indeling";

interface ExternVoorkeur {
  berichten: string[];
  afzenders: string[];
}

function lees<T>(sleutel: string, standaard: T): T {
  try {
    const waarde = localStorage.getItem(sleutel);
    return waarde ? { ...standaard, ...JSON.parse(waarde) } : standaard;
  } catch {
    return standaard;
  }
}
function schrijf(sleutel: string, waarde: unknown) {
  try {
    localStorage.setItem(sleutel, JSON.stringify(waarde));
  } catch {
    // Niet bewaard; werkt dan alleen in deze sessie.
  }
}

const sessie: ExternVoorkeur = { berichten: [], afzenders: [] };

export function externToegestaan(berichtSleutel: string, afzender: string) {
  const v = lees<ExternVoorkeur>(EXTERN, { berichten: [], afzenders: [] });
  const adres = afzender.toLowerCase();
  return (
    v.berichten.includes(berichtSleutel) ||
    sessie.berichten.includes(berichtSleutel) ||
    (!!adres && (v.afzenders.includes(adres) || sessie.afzenders.includes(adres)))
  );
}

export function onthoudExtern(keuze: { bericht?: string; afzender?: string }) {
  const v = lees<ExternVoorkeur>(EXTERN, { berichten: [], afzenders: [] });
  if (keuze.bericht) {
    v.berichten = [...v.berichten.filter((b) => b !== keuze.bericht), keuze.bericht].slice(-500);
    sessie.berichten.push(keuze.bericht);
  }
  if (keuze.afzender) {
    const adres = keuze.afzender.toLowerCase();
    v.afzenders = [...v.afzenders.filter((a) => a !== adres), adres];
    sessie.afzenders.push(adres);
  }
  schrijf(EXTERN, v);
}

export function vergeetExterneAfzender(afzender: string) {
  const v = lees<ExternVoorkeur>(EXTERN, { berichten: [], afzenders: [] });
  v.afzenders = v.afzenders.filter((a) => a !== afzender.toLowerCase());
  schrijf(EXTERN, v);
}

export function vertrouwdeAfzenders() {
  return lees<ExternVoorkeur>(EXTERN, { berichten: [], afzenders: [] }).afzenders;
}

export interface Indeling {
  mappen: number;
  lijst: number;
  toonMappen: boolean;
  toonLeesvenster: boolean;
}
export const STANDAARD_INDELING: Indeling = { mappen: 230, lijst: 380, toonMappen: true, toonLeesvenster: true };

export function leesIndeling(): Indeling {
  return lees(INDELING, STANDAARD_INDELING);
}
export function bewaarIndeling(indeling: Indeling) {
  schrijf(INDELING, indeling);
}

const ISPDB = "openaec-email-ispdb";
/** Ook de Thunderbird-database (ISPDB) raadplegen; standaard uit, want de domeinnaam gaat naar Mozilla. */
export function leesIspdb(): boolean {
  try {
    return localStorage.getItem(ISPDB) === "1";
  } catch {
    return false;
  }
}
export function bewaarIspdb(aan: boolean) {
  try {
    localStorage.setItem(ISPDB, aan ? "1" : "0");
  } catch {
    // Alleen voor deze sessie.
  }
}
