/** Aanmelding van de ingebouwde (JS-)weergevers, allemaal met prioriteit 0. */
import { registreerWeergever, type Weergever } from "./contract";
import { AfbeeldingWeergever } from "./weergevers/AfbeeldingWeergever";
import { CadWeergever } from "./weergevers/CadWeergever";
import { IfcWeergever } from "./weergevers/IfcWeergever";
import { MarkdownWeergever } from "./weergevers/MarkdownWeergever";
import { OfficeWeergever } from "./weergevers/OfficeWeergever";
import { OnbekendWeergever } from "./weergevers/OnbekendWeergever";
import { PdfWeergever } from "./weergevers/PdfWeergever";
import { TekstWeergever } from "./weergevers/TekstWeergever";

const altijd = () => true;

export const STANDAARD_WEERGEVERS: Weergever[] = [
  { naam: "afbeelding-js", soort: "afbeelding", prioriteit: 0, kan: altijd, Component: AfbeeldingWeergever },
  { naam: "tekst-js", soort: "tekst", prioriteit: 0, kan: altijd, Component: TekstWeergever },
  { naam: "markdown-js", soort: "markdown", prioriteit: 0, kan: altijd, Component: MarkdownWeergever },
  { naam: "pdf-webview", soort: "pdf", prioriteit: 0, kan: altijd, Component: PdfWeergever },
  { naam: "dwg-metadata", soort: "dwg", prioriteit: 0, kan: altijd, Component: CadWeergever },
  { naam: "dxf-metadata", soort: "dxf", prioriteit: 0, kan: altijd, Component: CadWeergever },
  { naam: "ifc-metadata", soort: "ifc", prioriteit: 0, kan: altijd, Component: IfcWeergever },
  { naam: "office-kaart", soort: "office", prioriteit: 0, kan: altijd, Component: OfficeWeergever },
  { naam: "onbekend-kaart", soort: "onbekend", prioriteit: 0, kan: altijd, Component: OnbekendWeergever },
];

let aangemeld = false;

/** Meldt de ingebouwde weergevers één keer aan (idempotent). */
export function registreerStandaardWeergevers() {
  if (aangemeld) return;
  aangemeld = true;
  // Eerst aanmelden zodat later aangemelde weergevers met gelijke prioriteit winnen.
  for (const w of STANDAARD_WEERGEVERS) registreerWeergever(w);
}
