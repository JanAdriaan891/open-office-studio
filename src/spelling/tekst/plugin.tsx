/**
 * De plug-in die de spellingcontrole in de docx-engine haakt: luistert naar
 * laden en wijzigen, en tekent de golflijnen in de overlaylaag van de engine
 * (die meeschuift met scrollen en zoomen).
 */
import { defineDocxPlugin, type DocxPlugin, type DocxPluginGrant } from "@betteroffice/docx-react";
import { Golflijnen } from "./Golflijnen";
import type { PluginStaat, SpellingSessie } from "./sessie";

export const SPELLING_PLUGIN = "oos-spelling";

/** De plug-in mag de alinea's lezen en vervangingen als edit-batch toepassen. */
export const spellingGrant: DocxPluginGrant = { document: "write", editBatches: true };

export function maakSpellingPlugin(sessie: SpellingSessie): DocxPlugin {
  return defineDocxPlugin<PluginStaat>({
    id: SPELLING_PLUGIN,
    createState: () => ({ teller: 0 }),
    initialize(context) {
      sessie.bijLaden(context);
    },
    onEvent(context, event) {
      if (event.type === "load") sessie.bijLaden(context);
      else if (event.type === "document-change") sessie.bijWijziging(context);
      else sessie.bijContext(context);
    },
    overlay: ({ context, geometry }) => <Golflijnen sessie={sessie} context={context} geometry={geometry} />,
  });
}
