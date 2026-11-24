/**
 * Lange formules leesbaar over meerdere regels zetten en weer terug (#376).
 *
 * Er komt alleen witruimte bij of af op plekken waar een formule die toelaat:
 * na een haakje openen, na een argumentscheiding en voor een haakje sluiten.
 * Tekst tussen aanhalingstekens, bladnamen en matrixconstanten blijven
 * letterlijk staan. Een komma tussen twee cijfers kan een decimaalteken zijn
 * (regio) en wordt daarom nooit als scheiding behandeld.
 */

const INSPRONG = "  ";
/** Een haakjesgroep die korter is en geen geneste aanroep heeft, blijft op één regel. */
const KORT = 40;

/** Het einde (exclusief) van een letterlijk stuk dat op `i` begint, of -1. */
function letterlijkTot(f: string, i: number): number {
  const c = f[i];
  if (c === '"' || c === "'") {
    for (let j = i + 1; j < f.length; j++) {
      if (f[j] !== c) continue;
      if (f[j + 1] === c) j++;
      else return j + 1;
    }
    return f.length;
  }
  if (c === "{") {
    let j = i + 1;
    while (j < f.length && f[j] !== "}") {
      const eind = f[j] === '"' ? letterlijkTot(f, j) : j + 1;
      j = eind;
    }
    return Math.min(f.length, j + 1);
  }
  return -1;
}

const cijfer = (c: string | undefined) => !!c && c >= "0" && c <= "9";
function isScheiding(f: string, i: number) {
  if (f[i] === ";") return true;
  if (f[i] !== ",") return false;
  let v = i - 1;
  while (v >= 0 && f[v] === " ") v--;
  let n = i + 1;
  while (n < f.length && f[n] === " ") n++;
  return !(cijfer(f[v]) && cijfer(f[n]));
}

const RAND = new Set([..."(),;+-*/&=<>^{}"]);

/** Haalt regeleinden en inspringing weg; de formule zelf verandert niet. */
export function formuleOpEenRegel(formule: string): string {
  if (!formule.startsWith("=")) return formule;
  let uit = "";
  for (let i = 0; i < formule.length; ) {
    const eind = letterlijkTot(formule, i);
    if (eind > 0) {
      uit += formule.slice(i, eind);
      i = eind;
      continue;
    }
    if (/\s/.test(formule[i])) {
      let j = i;
      while (j < formule.length && /\s/.test(formule[j])) j++;
      const stuk = formule.slice(i, j);
      if (!/[\r\n]/.test(stuk)) uit += stuk;
      else if (!(RAND.has(uit[uit.length - 1] ?? "(") || RAND.has(formule[j] ?? ")"))) uit += " ";
      i = j;
      continue;
    }
    uit += formule[i++];
  }
  return uit.trimEnd();
}

/** Positie van het bijbehorende haakje sluiten, of -1 bij een onvolledige formule. */
function sluithaak(f: string, open: number): number {
  let diepte = 0;
  for (let i = open; i < f.length; ) {
    const eind = letterlijkTot(f, i);
    if (eind > 0) {
      i = eind;
      continue;
    }
    if (f[i] === "(") diepte++;
    else if (f[i] === ")" && --diepte === 0) return i;
    i++;
  }
  return -1;
}

function opmaak(f: string, diepte: number): string {
  let uit = "";
  for (let i = 0; i < f.length; ) {
    const eind = letterlijkTot(f, i);
    if (eind > 0) {
      uit += f.slice(i, eind);
      i = eind;
      continue;
    }
    if (f[i] !== "(") {
      uit += f[i++];
      continue;
    }
    const sluit = sluithaak(f, i);
    if (sluit < 0) return uit + f.slice(i);
    const binnen = f.slice(i + 1, sluit);
    // Argumenten op het bovenste niveau van deze groep.
    const delen: string[] = [];
    let begin = 0, d = 0, genest = false;
    for (let j = 0; j < binnen.length; ) {
      const e = letterlijkTot(binnen, j);
      if (e > 0) {
        j = e;
        continue;
      }
      if (binnen[j] === "(") {
        d++;
        genest = true;
      } else if (binnen[j] === ")") d--;
      else if (d === 0 && isScheiding(binnen, j)) {
        delen.push(binnen.slice(begin, j + 1));
        begin = j + 1;
      }
      j++;
    }
    delen.push(binnen.slice(begin));
    if (delen.length < 2 || (!genest && binnen.length <= KORT)) {
      uit += `(${opmaak(binnen, diepte)})`;
    } else {
      const spring = INSPRONG.repeat(diepte + 1);
      uit += `(\n${delen.map((deel) => spring + opmaak(deel.trim(), diepte + 1)).join("\n")}\n${INSPRONG.repeat(diepte)})`;
    }
    i = sluit + 1;
  }
  return uit;
}

/** Zet elk argument van een lange of geneste aanroep op een eigen, ingesprongen regel. */
export function formuleOpRegels(formule: string): string {
  if (!formule.startsWith("=")) return formule;
  return opmaak(formuleOpEenRegel(formule), 0);
}
