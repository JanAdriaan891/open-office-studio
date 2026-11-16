import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import i18next, { zetTaal } from "../../i18n/config";
import { INTERFACETALEN } from "../../i18n/talen";
import { StijlBeheerGroep } from "./StijlGalerij";

const proef = vi.hoisted(() => ({ huidigeStijl: true }));
vi.mock("./StijlenBeheer", () => ({
  useStijlen: () => ({
    alineastijl: proef.huidigeStijl ? "ProjectBody" : undefined,
    stijlen: {
      styles: proef.huidigeStijl
        ? [{ styleId: "ProjectBody", name: "Project Body", type: "paragraph" }]
        : [],
    },
    kanHerladen: proef.huidigeStijl,
    open: vi.fn(),
    werkBij: vi.fn(),
    fout: vi.fn(),
  }),
  bevestigingOverslaan: () => false,
}));

const tekst = (waarde: string) =>
  renderToStaticMarkup(<span>{waarde}</span>).replace(/^<span>|<\/span>$/g, "");

afterEach(async () => {
  await zetTaal("nl");
  vi.restoreAllMocks();
});

describe("#363 gerenderde stijlbeheerlabels", () => {
  it.each(INTERFACETALEN)(
    "vertaalt labels, namen en hints in %s",
    async (taal) => {
      await zetTaal(taal);
      for (const huidigeStijl of [true, false]) {
        proef.huidigeStijl = huidigeStijl;
        const html = renderToStaticMarkup(<StijlBeheerGroep />);
        expect(html).not.toMatch(/styles\.manage\.|\{\{|writer:/);
        for (const sleutel of [
          "styles.gallery.group",
          "styles.shortcutPane",
          "styles.pane.newStyle",
          "styles.pane.styleSet",
        ])
          expect(html).toContain(tekst(i18next.t(`writer:${sleutel}`)));
        const name = "Project Body";
        expect(html).toContain(
          tekst(
            i18next.t(
              huidigeStijl
                ? "writer:styles.editor.modifyTitle"
                : "writer:styles.editor.modify",
              { name },
            ),
          ),
        );
        expect(html).toContain(
          tekst(
            i18next.t(
              huidigeStijl
                ? "writer:styles.update.title"
                : "writer:styles.update.confirm",
              { name },
            ),
          ),
        );
        expect((html.match(/class="ribbon-actie /g) ?? []).length).toBe(5);
        // No current style: update/modify remain disabled and their labels readable.
        if (!huidigeStijl)
          expect((html.match(/disabled=""/g) ?? []).length).toBe(4);
      }
    },
  );
});
