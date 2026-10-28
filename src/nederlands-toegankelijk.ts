/**
 * Nederlandse teksten voor schermlezers: toegankelijke namen en meldingen
 * van de engines (actieve cel, pagina, diatitel). Apart van nederlands.ts
 * zodat de gewone vertalingen los daarvan kunnen groeien.
 */
import type { Translations as TekstVertaling } from "@betteroffice/docx-i18n";
import type { Translations as RekenbladVertaling } from "@betteroffice/xlsx-i18n";
import type { Translations as DiaVertaling } from "@betteroffice/pptx-i18n";
import { tekstNl, rekenbladNl, diaNl } from "./nederlands";
import { tekstPaginaNl } from "./nederlands-pagina";

type Boom = { [sleutel: string]: unknown };

/** Voegt b diep samen in a; waarden uit a blijven staan. */
export function voegSamen<T extends Boom>(a: T, b: Boom): T {
  const uit: Boom = { ...a };
  for (const [sleutel, waarde] of Object.entries(b)) {
    const bestaand = uit[sleutel];
    uit[sleutel] =
      waarde && typeof waarde === "object" && !Array.isArray(waarde)
        ? voegSamen((bestaand as Boom) ?? {}, waarde as Boom)
        : (bestaand ?? waarde);
  }
  return uit as T;
}

const tekstToegankelijk = {
  font: { selectAriaLabel: "Lettertype kiezen" },
  colorPicker: { ariaLabel: "Kleurkiezer voor {type}" },
  dialogs: {
    findReplace: { findAriaLabel: "Zoektekst", replaceAriaLabel: "Vervangtekst" },
    insertImage: { uploadAriaLabel: "Klik of sleep om een afbeelding te uploaden" },
    keyboardShortcuts: { ariaLabel: "Sneltoetsen" },
  },
  contextMenu: { ariaLabel: "Menu met AI-acties", textMenuAriaLabel: "Menu voor tekstbewerking" },
  sidebar: { ariaLabel: "Zijbalk met opmerkingen en wijzigingen" },
  titleBar: { documentNameAriaLabel: "Documentnaam", menuBarAriaLabel: "Menubalk" },
  imageWrap: { menu: { ariaLabel: "Opties voor tekstterugloop" } },
  image: { editableAriaLabel: "Bewerkbare afbeelding" },
  unsaved: { unsavedAriaLabel: "Niet-opgeslagen wijzigingen", savedAriaLabel: "Alle wijzigingen opgeslagen" },
  loading: { label: "Laden" },
  a11y: {
    pageLabel: "Pagina {number}",
    headerLabel: "Koptekst",
    footerLabel: "Voettekst",
    selected: "Geselecteerd",
    selectionCleared: "Selectie opgeheven",
    commentedText: "Tekst met opmerking",
    trackedInsertion: "Bijgehouden invoeging",
    trackedDeletion: "Bijgehouden verwijdering",
    listItem: "Lijstitem, niveau {level}",
    contentControl: "Inhoudsbesturingselement",
    addRepeatingItem: "Item toevoegen",
    removeRepeatingItem: "Item verwijderen",
  },
};

const rekenbladToegankelijk = {
  a11y: {
    gridLabel: "Rekenbladraster",
    rowHeaderLabel: "Rij {row}",
    columnHeaderLabel: "Kolom {column}",
    cellLabel: "{address}, {value}",
    cellLabelSelected: "{address}, {value}, geselecteerd",
    emptyCellLabel: "{address}, leeg",
    emptyCellLabelSelected: "{address}, leeg, geselecteerd",
  },
  proposals: { panelLabel: "Voorstellen" },
  plugins: {
    toolbarGroup: "Uitbreidingen",
    panelTabs: "Panelen van uitbreidingen",
    collapsePanel: "{title} inklappen",
    expandPanel: "{title} uitklappen",
  },
};

const diaToegankelijk = {
  proposals: { targetLabel: "Wijzigen" },
};

export const tekstNlVolledig: TekstVertaling = voegSamen(voegSamen(tekstNl as Boom, tekstToegankelijk), tekstPaginaNl);
export const rekenbladNlVolledig: RekenbladVertaling = voegSamen(
  rekenbladNl as Boom,
  rekenbladToegankelijk,
);
export const diaNlVolledig: DiaVertaling = voegSamen(diaNl as Boom, diaToegankelijk);
