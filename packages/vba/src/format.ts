/**
 * Format() en verwanten: benoemde notaties (Currency, Short Date …) en eigen
 * patronen voor getallen (0 # , . % E+ en secties met ;), datums (d m y h n s,
 * AM/PM, / en : als scheidingstekens van de landinstelling) en tekst (@ & < >).
 * Format rondt half van nul af, anders dan Round (bankiersafronding).
 */
import { delenVan, splits, type Datumdelen } from "./datum.ts";
import type { Landinstelling } from "./land.ts";
import {
  Datum,
  Getal,
  Leeg,
  NullWaarde,
  korteDatum,
  langeTijd,
  naarDatum,
  naarTekst,
  tekstNaarGetal,
  type VbaWaarde,
} from "./waarden.ts";
import { leesDatum } from "./datum.ts";
import { fout } from "./fouten.ts";

/** Half van nul af afronden op `d` decimalen, met decimale correctie. */
export function rondFormat(x: number, d: number): number {
  const f = 10 ** d;
  const g = Number((Math.abs(x) * f).toPrecision(15));
  return (Math.sign(x) * Math.floor(g + 0.5)) / f;
}

function groepeer(geheel: string, scheiding: string) {
  return geheel.replace(/\B(?=(\d{3})+(?!\d))/g, scheiding);
}

/** Vast aantal decimalen, met groepering naar keuze. */
export function vastGetal(x: number, decimalen: number, land: Landinstelling, groepen: boolean, voorloopNul = true) {
  const r = rondFormat(x, decimalen);
  let [g, d] = Math.abs(r).toFixed(decimalen).split(".");
  if (!voorloopNul && g === "0" && decimalen > 0) g = "";
  if (groepen) g = groepeer(g, land.duizendtal);
  const tekst = d ? `${g}${land.decimaal}${d}` : g;
  return { tekst, negatief: r < 0 };
}

export function weekdag(delen: Datumdelen, eersteDag: number) {
  // 1 = eerste dag van de week volgens eersteDag (1 = zondag … 7 = zaterdag)
  return ((delen.weekdag - eersteDag + 7) % 7) + 1;
}

/** Weeknummer zoals DatePart("ww"): eersteWeek 1 = week met 1 jan, 2 = eerste week met 4 dagen, 3 = eerste volle week. */
export function weekVanJaar(serie: number, eersteDag: number, eersteWeek: number): number {
  const d = delenVan(serie);
  const dag = Math.trunc(splits(serie).dagen);
  const begin = (jaar: number) => {
    // dagnummer van 1 januari en het begin van week 1
    const jan1 = Math.round(dagVan(jaar, 1, 1));
    const wd = weekdag(delenVan(jan1), eersteDag); // 1..7
    let start = jan1 - (wd - 1);
    if (eersteWeek === 2 && wd > 4) start += 7;
    if (eersteWeek === 3 && wd > 1) start += 7;
    return start;
  };
  let start = begin(d.jaar);
  if (dag < start) start = begin(d.jaar - 1);
  else if (eersteWeek !== 1) {
    const volgend = begin(d.jaar + 1);
    if (dag >= volgend) return 1;
  }
  return Math.floor((dag - start) / 7) + 1;
}

function dagVan(j: number, m: number, d: number) {
  const ms = Date.UTC(2000, m - 1, d);
  const x = new Date(ms);
  x.setUTCFullYear(j);
  return Math.round((x.getTime() - Date.UTC(1899, 11, 30)) / 86400000);
}

export function dagVanJaar(serie: number) {
  const d = delenVan(serie);
  return Math.trunc(splits(serie).dagen) - dagVan(d.jaar, 1, 1) + 1;
}

function isNederlands(land: Landinstelling) {
  return land.waar === "Waar";
}

export function langeDatum(d: Datumdelen, land: Landinstelling) {
  if (isNederlands(land)) return `${land.dagen[d.weekdag - 1]} ${d.dag} ${land.maanden[d.maand - 1]} ${d.jaar}`;
  return `${land.dagen[d.weekdag - 1]}, ${land.maanden[d.maand - 1]} ${d.dag}, ${d.jaar}`;
}

function middelDatum(d: Datumdelen, land: Landinstelling) {
  const j = String(d.jaar % 100).padStart(2, "0");
  return `${String(d.dag).padStart(2, "0")}-${land.maandenKort[d.maand - 1]}-${j}`;
}

function algemeneDatum(serie: number, land: Landinstelling) {
  return naarTekst(new Datum(serie), land);
}

// ---------- benoemde notaties ----------

function benoemd(w: VbaWaarde, naam: string, land: Landinstelling): string | null {
  const k = naam.toLowerCase();
  const nl = isNederlands(land);
  const getal = () => naarGetalVoorFormat(w, land);
  switch (k) {
    case "general number":
      return naarTekst(new Getal("Double", getal()), land);
    case "currency": {
      const { tekst, negatief } = vastGetal(getal(), 2, land, true);
      if (nl) return `${land.valuta} ${negatief ? "-" : ""}${tekst}`;
      return negatief ? `(${land.valuta}${tekst})` : `${land.valuta}${tekst}`;
    }
    case "fixed": {
      const { tekst, negatief } = vastGetal(getal(), 2, land, false);
      return (negatief ? "-" : "") + tekst;
    }
    case "standard": {
      const { tekst, negatief } = vastGetal(getal(), 2, land, true);
      return (negatief ? "-" : "") + tekst;
    }
    case "percent": {
      const { tekst, negatief } = vastGetal(getal() * 100, 2, land, false);
      return (negatief ? "-" : "") + tekst + "%";
    }
    case "scientific":
      return getalPatroon(getal(), "0.00E+00", land);
    case "yes/no":
      return getal() !== 0 ? (nl ? "Ja" : "Yes") : nl ? "Nee" : "No";
    case "true/false":
      return getal() !== 0 ? land.waar : land.onwaar;
    case "on/off":
      return getal() !== 0 ? (nl ? "Aan" : "On") : nl ? "Uit" : "Off";
    case "general date":
      return algemeneDatum(naarDatum(w, land), land);
    case "long date":
      return langeDatum(delenVan(naarDatum(w, land)), land);
    case "medium date":
      return middelDatum(delenVan(naarDatum(w, land)), land);
    case "short date":
      return korteDatum(delenVan(naarDatum(w, land)), land);
    case "long time":
      return langeTijd(delenVan(naarDatum(w, land)), land);
    case "medium time": {
      const d = delenVan(naarDatum(w, land));
      const u = d.uur % 12 || 12;
      return `${String(u).padStart(2, "0")}${land.tijdScheiding}${String(d.minuut).padStart(2, "0")} ${d.uur < 12 ? "AM" : "PM"}`;
    }
    case "short time": {
      const d = delenVan(naarDatum(w, land));
      return `${String(d.uur).padStart(2, "0")}${land.tijdScheiding}${String(d.minuut).padStart(2, "0")}`;
    }
  }
  return null;
}

function naarGetalVoorFormat(w: VbaWaarde, land: Landinstelling): number {
  if (w instanceof Getal) return w.w;
  if (w instanceof Datum) return w.w;
  if (typeof w === "boolean") return w ? -1 : 0;
  if (w instanceof Leeg) return 0;
  if (typeof w === "string") {
    const n = tekstNaarGetal(w, land);
    if (n !== null) return n;
  }
  throw fout(13);
}

// ---------- patronen opdelen ----------

interface Deel {
  soort: "tok" | "lit";
  t: string;
}

/** Splitst een patroon in tokens en letterlijke tekst ("…", \x). */
function tokens(patroon: string): Deel[] {
  const uit: Deel[] = [];
  for (let i = 0; i < patroon.length; i++) {
    const c = patroon[i];
    if (c === '"') {
      const eind = patroon.indexOf('"', i + 1);
      const tekst = eind < 0 ? patroon.slice(i + 1) : patroon.slice(i + 1, eind);
      uit.push({ soort: "lit", t: tekst });
      i = eind < 0 ? patroon.length : eind;
    } else if (c === "\\") {
      uit.push({ soort: "lit", t: patroon[i + 1] ?? "" });
      i++;
    } else uit.push({ soort: "tok", t: c });
  }
  return uit;
}

function secties(patroon: string): string[] {
  const uit: string[] = [];
  let huidig = "";
  let inTekst = false;
  for (let i = 0; i < patroon.length; i++) {
    const c = patroon[i];
    if (c === '"') inTekst = !inTekst;
    if (c === "\\" && !inTekst) {
      huidig += c + (patroon[i + 1] ?? "");
      i++;
      continue;
    }
    if (c === ";" && !inTekst) {
      uit.push(huidig);
      huidig = "";
    } else huidig += c;
  }
  uit.push(huidig);
  return uit;
}

function zonderLiteralen(patroon: string) {
  return tokens(patroon)
    .filter((d) => d.soort === "tok")
    .map((d) => d.t)
    .join("");
}

function isDatumPatroon(patroon: string) {
  const t = zonderLiteralen(patroon).toLowerCase();
  if (/[0#]/.test(t)) return false;
  return /[dmyhnswq]|am\/pm|a\/p|ttttt|^c$/.test(t);
}

function isGetalPatroon(patroon: string) {
  return /[0#]/.test(zonderLiteralen(patroon)) || /^[%.,E+-]+$/i.test(zonderLiteralen(patroon));
}

// ---------- getallen ----------

export function getalPatroon(x: number, sectie: string, land: Landinstelling, metMin = true): string {
  const delen = tokens(sectie);
  const tok = delen.filter((d) => d.soort === "tok").map((d) => d.t);
  const procent = tok.includes("%");
  // Wetenschappelijke notatie
  const eIndex = delen.findIndex((d, i) => d.soort === "tok" && /[eE]/.test(d.t) && delen[i + 1]?.soort === "tok" && /[+-]/.test(delen[i + 1].t));
  let waarde = procent ? x * 100 : x;
  // Indeling: plaatshouders vóór en na de decimale punt
  const placeholders = (lijst: Deel[]) => lijst.filter((d) => d.soort === "tok" && (d.t === "0" || d.t === "#"));
  const mantisseDelen = eIndex >= 0 ? delen.slice(0, eIndex) : delen;
  const puntIndex = mantisseDelen.findIndex((d) => d.soort === "tok" && d.t === ".");
  const geheelDelen = puntIndex >= 0 ? mantisseDelen.slice(0, puntIndex) : mantisseDelen;
  const decimaalDelen = puntIndex >= 0 ? mantisseDelen.slice(puntIndex + 1) : [];
  const geheelPH = placeholders(geheelDelen);
  const decimalen = placeholders(decimaalDelen).length;
  // Duizendtallen: komma tussen plaatshouders; komma's direct vóór de punt schalen met 1000.
  let groepen = false;
  let schaal = 0;
  {
    const posities = geheelDelen.map((d, i) => (d.soort === "tok" && (d.t === "0" || d.t === "#") ? i : -1)).filter((i) => i >= 0);
    const eerste = posities[0] ?? -1;
    const laatste = posities[posities.length - 1] ?? -1;
    geheelDelen.forEach((d, i) => {
      if (d.soort === "tok" && d.t === ",") {
        if (i > eerste && i < laatste) groepen = true;
        else if (i > laatste && eerste >= 0) schaal++;
      }
    });
  }
  waarde /= 1000 ** schaal;
  let exponent = 0;
  if (eIndex >= 0 && waarde !== 0) {
    const geheelCijfers = Math.max(1, geheelPH.length);
    exponent = Math.floor(Math.log10(Math.abs(waarde))) - (geheelCijfers - 1);
    waarde /= 10 ** exponent;
    if (Math.abs(rondFormat(waarde, decimalen)) >= 10 ** geheelCijfers) {
      waarde /= 10;
      exponent++;
    }
  }
  const afgerond = rondFormat(Math.abs(waarde), decimalen);
  let [gTekst, dTekst = ""] = afgerond.toFixed(decimalen).split(".");
  const negatief = x < 0 && afgerond !== 0 && metMin;
  // Geheel deel
  const minimum = geheelPH.filter((d) => d.t === "0").length;
  if (gTekst === "0" && minimum === 0) gTekst = "";
  while (gTekst.length < minimum) gTekst = "0" + gTekst;
  if (groepen) gTekst = groepeer(gTekst, land.duizendtal);
  // Plaatshouders vullen. Staan er letterlijke tekens tussen de plaatshouders
  // (bv. "000-0000"), dan cijfer voor cijfer van rechts; anders alles op de plek
  // van de eerste plaatshouder.
  let uitGeheel = "";
  {
    const phIdx = geheelDelen.map((d, i) => (d.soort === "tok" && (d.t === "0" || d.t === "#") ? i : -1)).filter((i) => i >= 0);
    const eerste = phIdx[0] ?? -1;
    const laatste = phIdx[phIdx.length - 1] ?? -1;
    const tussenLiteraal = geheelDelen.some((d, i) => i > eerste && i < laatste && !(d.soort === "tok" && (d.t === "0" || d.t === "#" || d.t === ",")));
    const toewijzing = new Map<number, string>();
    if (tussenLiteraal) {
      let rest = gTekst.split(land.duizendtal).join("");
      for (let p = phIdx.length - 1; p >= 0; p--) {
        if (p === 0) toewijzing.set(phIdx[p], rest);
        else {
          toewijzing.set(phIdx[p], rest.slice(-1));
          rest = rest.slice(0, -1);
        }
      }
    } else if (eerste >= 0) toewijzing.set(eerste, gTekst);
    geheelDelen.forEach((d, i) => {
      if (toewijzing.has(i)) uitGeheel += toewijzing.get(i);
      else if (d.soort === "lit") uitGeheel += d.t;
      else if (d.t === "0" || d.t === "#" || d.t === ",") {
        /* plaatshouder of groepering: al verwerkt */
      } else uitGeheel += d.t;
    });
  }
  // Decimalen
  let uitDecimaal = "";
  if (puntIndex >= 0) {
    // '#' achteraan: nullen weglaten
    const ph = placeholders(decimaalDelen);
    let cijfers = dTekst.split("");
    for (let i = ph.length - 1; i >= 0; i--) {
      if (ph[i].t === "#" && cijfers[i] === "0") cijfers = cijfers.slice(0, i);
      else break;
    }
    let ci = 0;
    for (const d of decimaalDelen) {
      if (d.soort === "tok" && (d.t === "0" || d.t === "#")) uitDecimaal += cijfers[ci++] ?? "";
      else if (d.soort === "lit") uitDecimaal += d.t;
      else if (d.t !== ",") uitDecimaal += d.t;
    }
    uitDecimaal = land.decimaal + uitDecimaal;
  }
  let uit = uitGeheel + uitDecimaal;
  if (eIndex >= 0) {
    const teken = delen[eIndex + 1].t;
    const expDelen = delen.slice(eIndex + 2);
    const expCijfers = placeholders(expDelen).filter((d) => d.t === "0").length;
    const exp = String(Math.abs(exponent)).padStart(expCijfers, "0");
    const expTeken = exponent < 0 ? "-" : teken === "+" ? "+" : "";
    let na = "";
    let geplaatst = false;
    for (const d of expDelen) {
      if (d.soort === "tok" && (d.t === "0" || d.t === "#")) {
        if (!geplaatst) {
          na += exp;
          geplaatst = true;
        }
      } else na += d.t;
    }
    uit += delen[eIndex].t + expTeken + na;
  }
  return (negatief ? "-" : "") + uit;
}

// ---------- datums ----------

export function datumPatroon(serie: number, patroon: string, land: Landinstelling, eersteDag = 1, eersteWeek = 1): string {
  const d = delenVan(serie);
  const delen = tokens(patroon);
  const ampm = /am\/pm|a\/p|ampm/i.test(zonderLiteralen(patroon));
  let uit = "";
  let laatsteWasUur = false;
  const tok = delen;
  for (let i = 0; i < tok.length; i++) {
    const deel = tok[i];
    if (deel.soort === "lit") {
      uit += deel.t;
      continue;
    }
    const c = deel.t;
    const lc = c.toLowerCase();
    // reeks van dezelfde letter
    let n = 1;
    while (tok[i + n]?.soort === "tok" && tok[i + n].t.toLowerCase() === lc && /[dmyhnswqt]/.test(lc)) n++;
    const p2 = (x: number) => String(x).padStart(2, "0");
    switch (lc) {
      case "d":
        uit +=
          n === 1
            ? d.dag
            : n === 2
              ? p2(d.dag)
              : n === 3
                ? land.dagenKort[d.weekdag - 1]
                : n === 4
                  ? land.dagen[d.weekdag - 1]
                  : n === 5
                    ? korteDatum(d, land)
                    : langeDatum(d, land);
        i += n - 1;
        laatsteWasUur = false;
        continue;
      case "m":
        if (laatsteWasUur && n <= 2) {
          uit += n === 1 ? d.minuut : p2(d.minuut);
          laatsteWasUur = false;
        } else
          uit += n === 1 ? d.maand : n === 2 ? p2(d.maand) : n === 3 ? land.maandenKort[d.maand - 1] : land.maanden[d.maand - 1];
        i += n - 1;
        continue;
      case "y":
        if (n === 1) uit += dagVanJaar(serie);
        else if (n <= 3) uit += p2(d.jaar % 100);
        else uit += String(d.jaar).padStart(4, "0");
        i += n - 1;
        laatsteWasUur = false;
        continue;
      case "h": {
        const u = ampm ? d.uur % 12 || 12 : d.uur;
        uit += n === 1 ? u : p2(u);
        i += n - 1;
        laatsteWasUur = true;
        continue;
      }
      case "n":
        uit += n === 1 ? d.minuut : p2(d.minuut);
        i += n - 1;
        laatsteWasUur = false;
        continue;
      case "s":
        uit += n === 1 ? d.seconde : p2(d.seconde);
        i += n - 1;
        laatsteWasUur = false;
        continue;
      case "w":
        uit += n === 1 ? weekdag(d, eersteDag) : weekVanJaar(serie, eersteDag, eersteWeek);
        i += n - 1;
        continue;
      case "q":
        uit += Math.floor((d.maand - 1) / 3) + 1;
        continue;
      case "t":
        if (n >= 5) {
          uit += langeTijd(d, land);
          i += n - 1;
          continue;
        }
        uit += c;
        continue;
      case "c":
        uit += algemeneDatum(serie, land);
        continue;
      case "a": {
        const rest = tok
          .slice(i, i + 5)
          .map((x) => x.t)
          .join("");
        if (/^am\/pm/i.test(rest)) {
          const tekst = d.uur < 12 ? rest.slice(0, 2) : rest.slice(3, 5);
          uit += tekst;
          i += 4;
          continue;
        }
        if (/^a\/p/i.test(rest)) {
          uit += d.uur < 12 ? rest[0] : rest[2];
          i += 2;
          continue;
        }
        if (/^ampm/i.test(rest)) {
          uit += d.uur < 12 ? "AM" : "PM";
          i += 3;
          continue;
        }
        uit += c;
        continue;
      }
      case "/":
        uit += land.datumScheiding;
        continue;
      case ":":
        uit += land.tijdScheiding;
        continue;
      default:
        uit += c;
    }
  }
  return uit;
}

// ---------- tekst ----------

function tekstPatroon(s: string, patroon: string): string {
  const delen = tokens(patroon);
  let hoofd = 0;
  let links = false;
  const plaats = delen.filter((d) => d.soort === "tok" && (d.t === "@" || d.t === "&")).length;
  for (const d of delen) {
    if (d.soort !== "tok") continue;
    if (d.t === "<") hoofd = -1;
    if (d.t === ">") hoofd = 1;
    if (d.t === "!") links = true;
  }
  if (hoofd === 1) s = s.toUpperCase();
  if (hoofd === -1) s = s.toLowerCase();
  if (!plaats) return s;
  // Vul plaatshouders; standaard van rechts naar links.
  const tekens = s.split("");
  const toewijzing: string[] = new Array(plaats).fill("");
  const phSoort: string[] = delen.filter((d) => d.soort === "tok" && (d.t === "@" || d.t === "&")).map((d) => d.t);
  let extra = "";
  if (links) {
    for (let i = 0; i < plaats; i++) toewijzing[i] = tekens[i] ?? (phSoort[i] === "@" ? " " : "");
    extra = tekens.slice(plaats).join("");
  } else {
    const begin = tekens.length - plaats;
    for (let i = 0; i < plaats; i++) {
      const t = tekens[begin + i];
      toewijzing[i] = t ?? (phSoort[i] === "@" ? " " : "");
    }
    extra = begin > 0 ? tekens.slice(0, begin).join("") : "";
  }
  let uit = "";
  let p = 0;
  for (const d of delen) {
    if (d.soort === "lit") uit += d.t;
    else if (d.t === "@" || d.t === "&") {
      if (p === 0 && !links) uit += extra;
      uit += toewijzing[p++];
      if (p === plaats && links) uit += extra;
    } else if (!"<>!".includes(d.t)) uit += d.t;
  }
  return uit;
}

// ---------- Format ----------

export function formatteer(w: VbaWaarde, patroon: string | undefined, land: Landinstelling, eersteDag = 1, eersteWeek = 1): string {
  if (patroon === undefined || patroon === "") {
    if (w instanceof NullWaarde) return "";
    return naarTekst(w, land);
  }
  const naam = benoemd(w instanceof NullWaarde ? 0 : w, patroon, land);
  if (naam !== null) return w instanceof NullWaarde ? "" : naam;
  const s = secties(patroon);
  if (w instanceof NullWaarde) return s.length >= 4 ? getalPatroon(0, s[3], land).replace(/[0#]/g, "") || zonderPH(s[3]) : "";
  if (isDatumPatroon(s[0])) {
    let serie: number | null = null;
    if (w instanceof Datum || w instanceof Getal) serie = w.w;
    else if (typeof w === "string") serie = leesDatum(w, land.datumVolgorde) ?? tekstNaarGetal(w, land);
    else if (w instanceof Leeg) serie = 0;
    else if (typeof w === "boolean") serie = w ? -1 : 0;
    if (serie === null) return tekstPatroon(naarTekst(w, land), patroon);
    return datumPatroon(serie, s[0], land, eersteDag, eersteWeek);
  }
  if (isGetalPatroon(s[0])) {
    let x: number | null = null;
    if (w instanceof Getal || w instanceof Datum) x = w.w;
    else if (typeof w === "boolean") x = w ? -1 : 0;
    else if (w instanceof Leeg) x = 0;
    else if (typeof w === "string") x = tekstNaarGetal(w, land);
    if (x === null) return naarTekst(w, land);
    if (x < 0 && s.length >= 2 && s[1] !== "") return getalPatroon(-x, s[1], land, false);
    if (x === 0 && s.length >= 3 && s[2] !== "") return getalPatroon(0, s[2], land);
    if (x < 0 && s.length >= 2 && s[1] === "") return getalPatroon(x, s[0], land);
    return getalPatroon(x, s[0], land);
  }
  return tekstPatroon(naarTekst(w, land), s[0]);
}

function zonderPH(sectie: string) {
  return tokens(sectie)
    .map((d) => d.t)
    .join("");
}

export { splits };
