/**
 * Sessiestand van het begrensde raster (#371): per werkmap en per blad of het
 * raster begrensd is en hoe groot het nu is. De rekenregels staan in
 * begrensdRaster.ts; hier komen het gebruikte bereik uit de rekenkern, de
 * app-voorkeur per bestand en de eigenschap in het bestand samen.
 */
import { useSyncExternalStore } from "react";
import type { WorkbookHandle } from "@betteroffice/xlsx";
import type { XlsxEditorApi, XlsxPluginSelection } from "@betteroffice/xlsx-react";
import { leesInstellingen, volgInstellingen } from "../instellingen";
import { leesAfdrukInstellingen, ontleedBereikA1 } from "../afdrukken/rekenbladInstellingen";
import { MAX_KOLOMMEN, MAX_RIJEN, ontleedBereik, type Bereik } from "../lint/rekenblad-logica";
import { tabellen } from "./tabellen";
import { tekenobjecten } from "./tekenAnkers";
import {
  begrensSelectie,
  buitenRaster,
  keuzeNaarTekst,
  keuzeUitTekst,
  leesRasterKeuze,
  meegroeien,
  normaliseerMarge,
  omvangMetCel,
  passendeOmvang,
  schrijfRasterKeuze,
  verenig,
  vergroot,
  zelfdeOmvang,
  type Omvang,
  type RasterKeuze,
  type Selectie,
} from "./begrensdRaster";

interface Stand {
  naam: string;
  /** Per sessie-id van het blad; een blad zonder eigen keuze volgt de standaard uit Instellingen. */
  keuze: Map<string, boolean>;
  /** De huidige omvang per begrensd blad; groeit mee en krimpt alleen op verzoek. */
  omvang: Map<string, Omvang>;
  /** De gebruiker (of het bestand) koos zelf; alleen dan reist de keuze mee in het bestand. */
  expliciet: boolean;
  hadEigenschap: boolean;
  afdruk: Map<string, Bereik>;
  gebruikt: Map<string, { versie: string; bereik: Bereik | null }>;
  /** Het celbereik per inhoudsgrootte van de rekenkern; zie `celBereik`. */
  cellen: Map<string, { sleutel: string; bereik: Bereik | null }>;
  luisteraars: Set<() => void>;
}
export interface RasterBlad {
  begrensd: boolean;
  omvang: Omvang;
}
/** Waarom het raster veranderde; voor de melding aan schermlezers. */
export type RasterMelding =
  | { soort: "grens"; rij: boolean; kolom: boolean; omvang: Omvang }
  | { soort: "uitgebreid"; omvang: Omvang }
  | { soort: "aangepast"; omvang: Omvang };

const standen = new WeakMap<object, Stand>();
const meldingen = new WeakMap<object, Set<(m: RasterMelding) => void>>();
const SLEUTEL = "openaec-rekenblad-raster";
const MAX_BESTANDEN = 100;

const marge = () => normaliseerMarge(leesInstellingen().rekenblad.rastermarge);
const standaardBegrensd = () => leesInstellingen().rekenblad.raster === "begrensd";

function leesVoorkeur(naam: string): RasterKeuze | null {
  try {
    const alles = JSON.parse(localStorage.getItem(SLEUTEL) ?? "{}") as Record<string, unknown>;
    const tekst = alles?.[naam];
    return typeof tekst === "string" ? keuzeUitTekst(tekst) : null;
  } catch {
    return null;
  }
}
function bewaarVoorkeur(naam: string, keuze: RasterKeuze) {
  if (!naam) return;
  try {
    const alles = JSON.parse(localStorage.getItem(SLEUTEL) ?? "{}") as Record<string, string>;
    const rest = Object.entries(alles && typeof alles === "object" ? alles : {}).filter(([n]) => n !== naam);
    // De recentste keuzes achteraan; oudere bestanden vallen af.
    localStorage.setItem(
      SLEUTEL,
      JSON.stringify(Object.fromEntries([...rest.slice(-(MAX_BESTANDEN - 1)), [naam, keuzeNaarTekst(keuze)]])),
    );
  } catch {
    // Zonder browseropslag geldt de keuze voor deze sessie (en in het bestand).
  }
}

function meld(h: object) {
  standen.get(h)?.luisteraars.forEach((l) => l());
}
function meldRaster(h: object, m: RasterMelding) {
  meldingen.get(h)?.forEach((l) => l(m));
}

/**
 * Het laatste spoor waarvan de voorrand op of vóór `px` ligt (bladpixels,
 * zonder zoom). Verborgen sporen delen hun rand met het volgende spoor; het
 * laatste daarvan telt, zodat een verborgen rij het bereik nooit verkleint.
 */
function spoorBij(h: WorkbookHandle, blad: number, as: "rij" | "kolom", px: number, begin = 0) {
  const rand = (n: number) => (as === "rij" ? h.cellRect(blad, n, 0).y : h.cellRect(blad, 0, n).x);
  let laag = begin;
  let hoog = (as === "rij" ? MAX_RIJEN : MAX_KOLOMMEN) - 1;
  while (laag < hoog) {
    const midden = (laag + hoog + 1) >> 1;
    if (rand(midden) <= px + 0.25) laag = midden;
    else hoog = midden - 1;
  }
  return laag;
}

/** Wat een leeg blad als inhoudsgrootte meldt: 26 kolommen en 50 rijen. */
const LEEG = { rijen: 50, kolommen: 26 };
/** De inhoudsgrootte van de rekenkern reikt één spoor voorbij de laatste gebruikte cel. */
const VOORBIJ = 1;

/**
 * Het bereik met opgeslagen cellen, vanaf A1. De rekenkern houdt de omvang
 * van de inhoud bij voor zijn schuifruimte; die lezen kost niets. Het
 * gebruikte bereik zelf opvragen doorloopt alle cellen en is op een groot
 * blad te duur om na elke toetsaanslag te doen. Alleen bij de omvang van een
 * leeg blad (dan is het blad klein) vragen we het bereik zelf op.
 */
function celBereik(h: WorkbookHandle, blad: number, stand: Stand | undefined, id: string): Bereik | null {
  let info: { contentWidth: number; contentHeight: number } | null = null;
  try {
    info = h.sheetInfoFor(blad);
  } catch {
    info = null;
  }
  if (!info || !(info.contentWidth > 0) || !(info.contentHeight > 0))
    return h.selectionData(blad, 0, 0, "usedRange").usedRange ?? null;
  const sleutel = `${info.contentWidth}:${info.contentHeight}`;
  const bekend = stand?.cellen.get(id);
  if (bekend && bekend.sleutel === sleutel) return bekend.bereik;
  const rijen = spoorBij(h, blad, "rij", info.contentHeight);
  const kolommen = spoorBij(h, blad, "kolom", info.contentWidth);
  const bereik =
    rijen === LEEG.rijen && kolommen === LEEG.kolommen
      ? (h.selectionData(blad, 0, 0, "usedRange").usedRange ?? null)
      : rijen > VOORBIJ && kolommen > VOORBIJ
        ? { top: 0, left: 0, bottom: rijen - VOORBIJ - 1, right: kolommen - VOORBIJ - 1 }
        : (h.selectionData(blad, 0, 0, "usedRange").usedRange ?? null);
  stand?.cellen.set(id, { sleutel, bereik });
  return bereik;
}

/** Gegevens, opmaak, objecten, tabellen, filter en afdrukbereik van één blad; alleen de rechter- en onderrand tellen. */
export function gebruiktBereik(h: WorkbookHandle, blad: number): Bereik | null {
  const stand = standen.get(h);
  const id = h.sheetInfo().sheetIds[blad];
  const versie = h.version();
  const bekend = stand?.gebruikt.get(id);
  if (bekend && bekend.versie === versie) return bekend.bereik;
  const delen: (Bereik | null | undefined)[] = [];
  const probeer = (lees: () => void) => {
    try {
      lees();
    } catch {
      // Een onleesbaar onderdeel mag het raster niet blokkeren.
    }
  };
  probeer(() => delen.push(celBereik(h, blad, stand, id)));
  probeer(() => {
    for (const g of h.charts(blad)) if (g.anchorRange) delen.push(ontleedBereik(g.anchorRange));
  });
  probeer(() => {
    for (const o of tekenobjecten(h, blad)) {
      const { row, col } = o.plek;
      // Zonder eindanker heeft het object een maat in pixels vanaf zijn beginpunt.
      const onder = () => h.cellRect(blad, row, 0).y + o.plek.y + o.plek.hoogte;
      const rechts = () => h.cellRect(blad, 0, col).x + o.plek.x + o.plek.breedte;
      delen.push({
        top: row,
        left: col,
        bottom: o.einde ? o.einde.row : spoorBij(h, blad, "rij", onder() - 1, row),
        right: o.einde ? o.einde.col : spoorBij(h, blad, "kolom", rechts() - 1, col),
      });
    }
  });
  probeer(() => {
    for (const t of tabellen(h, blad)) delen.push(ontleedBereik(t.ref));
  });
  probeer(() => {
    const filter = h.sheetInfoFor(blad).autoFilter;
    if (filter) delen.push(ontleedBereik(filter));
  });
  delen.push(stand?.afdruk.get(id));
  const bereik = verenig(delen);
  stand?.gebruikt.set(id, { versie, bereik });
  return bereik;
}

const isBegrensd = (stand: Stand, id: string) => stand.keuze.get(id) ?? standaardBegrensd();

/** De weergave van één blad; null zolang de werkmap niet is voorbereid. */
export function rasterBlad(h: WorkbookHandle, blad: number): RasterBlad | null {
  const stand = standen.get(h);
  if (!stand) return null;
  const id = h.sheetInfo().sheetIds[blad];
  if (!id) return null;
  if (!isBegrensd(stand, id))
    return { begrensd: false, omvang: { rijen: MAX_RIJEN, kolommen: MAX_KOLOMMEN } };
  const vorige = stand.omvang.get(id) ?? null;
  const omvang = meegroeien(vorige, gebruiktBereik(h, blad), marge());
  if (zelfdeOmvang(vorige, omvang)) return { begrensd: true, omvang: vorige! };
  stand.omvang.set(id, omvang);
  return { begrensd: true, omvang };
}

function keuzeVan(h: WorkbookHandle, stand: Stand): RasterKeuze {
  const info = h.sheetInfo();
  const bladen: RasterKeuze["bladen"] = [];
  const onbeperkt: string[] = [];
  info.sheetIds.forEach((id, index) => {
    // Een blad zonder eigen keuze blijft de standaard volgen, ook na heropenen.
    if (!stand.keuze.has(id)) return;
    const naam = info.sheetNames[index];
    const omvang = stand.keuze.get(id) ? rasterBlad(h, index)?.omvang : null;
    if (omvang) bladen.push({ naam, ...omvang });
    else onbeperkt.push(naam);
  });
  return { bladen, onbeperkt };
}

/** Vanaf een eigen keuze ligt elk bestaand blad vast, ook wie tot dan de standaard volgde. */
function legVast(h: WorkbookHandle, stand: Stand) {
  if (stand.expliciet) return;
  const begrensd = standaardBegrensd();
  for (const id of h.sheetInfo().sheetIds) if (!stand.keuze.has(id)) stand.keuze.set(id, begrensd);
  stand.expliciet = true;
}
function bewaar(h: WorkbookHandle, stand: Stand) {
  bewaarVoorkeur(stand.naam, keuzeVan(h, stand));
  meld(h);
}

/** Leest de keuze uit het bestand of de app-voorkeur en koppelt de selectiebewaking. */
export function bereidRasterWeergave(api: XlsxEditorApi, bytes: Uint8Array | null, naam: string) {
  const h = api.handle;
  if (standen.has(h)) return;
  const stand: Stand = {
    naam,
    keuze: new Map(),
    omvang: new Map(),
    expliciet: false,
    hadEigenschap: false,
    afdruk: new Map(),
    gebruikt: new Map(),
    cellen: new Map(),
    luisteraars: new Set(),
  };
  standen.set(h, stand);
  const info = h.sheetInfo();
  let keuze: RasterKeuze | null = null;
  if (bytes) {
    try {
      keuze = leesRasterKeuze(bytes);
      stand.hadEigenschap = !!keuze;
    } catch {
      keuze = null;
    }
    try {
      leesAfdrukInstellingen(bytes).forEach((inst, index) => {
        const b = inst?.afdrukbereik ? ontleedBereikA1(inst.afdrukbereik) : null;
        const id = info.sheetIds[index];
        if (b && id) stand.afdruk.set(id, { top: b.rij1, left: b.kol1, bottom: b.rij2, right: b.kol2 });
      });
    } catch {
      // Zonder afdrukbereik telt alleen de inhoud.
    }
  }
  keuze ??= leesVoorkeur(naam);
  if (keuze) {
    stand.expliciet = true;
    info.sheetIds.forEach((id, index) => {
      const naam = info.sheetNames[index]?.toLowerCase();
      const b = keuze!.bladen.find((x) => x.naam.toLowerCase() === naam);
      if (b) {
        stand.keuze.set(id, true);
        stand.omvang.set(id, { rijen: b.rijen, kolommen: b.kolommen });
      } else if (keuze!.onbeperkt.some((n) => n.toLowerCase() === naam)) stand.keuze.set(id, false);
    });
  }
  // Ga naar, het naamvak, zoeken en plakken selecteren via de API: die cel
  // hoort zichtbaar te worden. Toetsen en de muis lopen binnen de engine en
  // worden door `bewaakRasterSelectie` binnen het raster gehouden.
  const kies = api.selectCells.bind(api);
  ruw.set(api, kies);
  api.selectCells = (blad, sel) => {
    try {
      toonSelectie(h, blad, sel);
    } catch {
      // De selectie zelf gaat voor.
    }
    return kies(blad, sel);
  };
}
const ruw = new WeakMap<XlsxEditorApi, XlsxEditorApi["selectCells"]>();

/** Breidt het raster uit zodat de selectie zichtbaar is; hele rijen en kolommen tellen niet. */
export function toonSelectie(h: WorkbookHandle, blad: number, sel: Selectie) {
  const stand = standen.get(h);
  const huidig = rasterBlad(h, blad);
  if (!stand || !huidig?.begrensd) return false;
  const buiten = buitenRaster(sel, huidig.omvang);
  if (!buiten) return false;
  const omvang = omvangMetCel(huidig.omvang, buiten, marge());
  const id = h.sheetInfo().sheetIds[blad];
  legVast(h, stand);
  stand.omvang.set(id, omvang);
  bewaar(h, stand);
  meldRaster(h, { soort: "uitgebreid", omvang });
  return true;
}

/** Zet een selectie die via toetsen of de muis buiten het raster kwam terug op de rand. */
export function bewaakRasterSelectie(api: XlsxEditorApi, sel: XlsxPluginSelection) {
  if (!sel?.cells) return;
  const h = api.handle;
  const huidig = rasterBlad(h, sel.sheetIndex);
  if (!huidig?.begrensd) return;
  const binnen = begrensSelectie(sel.cells, huidig.omvang);
  if (!binnen) return;
  const buiten = buitenRaster(sel.cells, huidig.omvang)!;
  const kies = ruw.get(api) ?? api.selectCells.bind(api);
  queueMicrotask(() => {
    try {
      if (api.handle !== h) return;
      kies(sel.sheetIndex, binnen);
      meldRaster(h, {
        soort: "grens",
        rij: buiten.row >= huidig.omvang.rijen,
        kolom: buiten.col >= huidig.omvang.kolommen,
        omvang: huidig.omvang,
      });
    } catch {
      // De editor kan inmiddels gesloten zijn.
    }
  });
}

export function zetBegrensd(h: WorkbookHandle, blad: number, aan: boolean) {
  const stand = standen.get(h);
  const id = h.sheetInfo().sheetIds[blad];
  if (!stand || !id) return;
  legVast(h, stand);
  stand.keuze.set(id, aan);
  if (aan) stand.omvang.set(id, passendeOmvang(gebruiktBereik(h, blad), marge()));
  else stand.omvang.delete(id);
  bewaar(h, stand);
}

/** Rijen of kolommen toevoegen via de groeistroken. */
export function groeiRaster(h: WorkbookHandle, blad: number, erbij: Partial<Omvang>) {
  const stand = standen.get(h);
  const huidig = rasterBlad(h, blad);
  const id = h.sheetInfo().sheetIds[blad];
  if (!stand || !huidig?.begrensd || !id) return;
  const omvang = vergroot(huidig.omvang, erbij);
  if (zelfdeOmvang(omvang, huidig.omvang)) return;
  legVast(h, stand);
  stand.omvang.set(id, omvang);
  bewaar(h, stand);
  meldRaster(h, { soort: "uitgebreid", omvang });
}

/** "Raster aanpassen aan inhoud": terug naar het gebruikte bereik plus marge. */
export function pasRasterAan(h: WorkbookHandle, blad: number) {
  const stand = standen.get(h);
  const id = h.sheetInfo().sheetIds[blad];
  if (!stand || !id || !rasterBlad(h, blad)?.begrensd) return;
  const omvang = passendeOmvang(gebruiktBereik(h, blad), marge());
  legVast(h, stand);
  stand.omvang.set(id, omvang);
  bewaar(h, stand);
  meldRaster(h, { soort: "aangepast", omvang });
}

export function abonneerRaster(h: object, luisteraar: () => void) {
  const stand = standen.get(h);
  if (!stand) return () => {};
  stand.luisteraars.add(luisteraar);
  return () => {
    stand.luisteraars.delete(luisteraar);
  };
}
export function abonneerRasterMeldingen(h: object, luisteraar: (m: RasterMelding) => void) {
  let lijst = meldingen.get(h);
  if (!lijst) meldingen.set(h, (lijst = new Set()));
  lijst.add(luisteraar);
  return () => {
    lijst.delete(luisteraar);
  };
}

/**
 * De weergavekeuze in de werkboekbytes. Zonder eigen keuze en zonder bestaande
 * eigenschap blijven de bytes ongewijzigd; werkbladen worden nooit aangeraakt.
 */
export function bewaarRasterKeuze(h: object, bytes: Uint8Array): Uint8Array {
  const stand = standen.get(h);
  if (!stand || (!stand.expliciet && !stand.hadEigenschap)) return bytes;
  try {
    const keuze = keuzeVan(h as WorkbookHandle, stand);
    // Alles onbeperkt bij een onbeperkte standaard: geen eigenschap nodig.
    return schrijfRasterKeuze(bytes, keuze.bladen.length || standaardBegrensd() ? keuze : null);
  } catch {
    // Liever opslaan zonder weergavekeuze dan niet opslaan.
    return bytes;
  }
}

// ------------------------------------------------- bediening voor de statusbalk

let zichtbaar: XlsxEditorApi | null = null;
let ronde = 0;
const kijkers = new Set<() => void>();
const meldKijkers = () => {
  ronde++;
  kijkers.forEach((l) => l());
};

/** De zichtbare rekenbladeditor meldt zich hier voor de statusbalk. */
export function registreerRasterEditor(api: XlsxEditorApi) {
  zichtbaar = api;
  const stop = [
    abonneerRaster(api.handle, meldKijkers),
    api.commands.subscribe(meldKijkers),
    // Invoegen, plakken en doorvoeren laten het raster meegroeien zonder opdracht van de engine.
    api.handle.onUpdate(meldKijkers),
    volgInstellingen(meldKijkers),
  ];
  meldKijkers();
  return () => {
    stop.forEach((s) => s());
    if (zichtbaar === api) zichtbaar = null;
    meldKijkers();
  };
}
const volgKijkers = (l: () => void) => {
  kijkers.add(l);
  return () => {
    kijkers.delete(l);
  };
};

export interface RasterBediening {
  begrensd: boolean;
  omvang: Omvang;
  zet: (aan: boolean) => void;
  pasAan: () => void;
}
/** De rasterweergave van het actieve blad in de zichtbare editor, of null. */
export function useRasterBediening(): RasterBediening | null {
  useSyncExternalStore(volgKijkers, () => ronde, () => ronde);
  const api = zichtbaar;
  if (!api) return null;
  try {
    const blad = api.handle.sheetInfo().activeSheet;
    const r = rasterBlad(api.handle, blad);
    if (!r) return null;
    return {
      ...r,
      zet: (aan) => zetBegrensd(api.handle, api.handle.sheetInfo().activeSheet, aan),
      pasAan: () => pasRasterAan(api.handle, api.handle.sheetInfo().activeSheet),
    };
  } catch {
    return null;
  }
}
