import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Lint, LintActie, LintGroep } from "./Lint";

const Icoon = () => <svg />;

function html() {
  return renderToStaticMarkup(
    <Lint
      bestand={() => {}}
      tabs={[
        {
          id: "start",
          naam: "Start",
          inhoud: (
            <LintGroep naam="Klembord">
              <LintActie icoon={Icoon} naam="Plakken" groot />
              <LintActie icoon={Icoon} naam="Vet" actief />
            </LintGroep>
          ),
        },
        { id: "invoegen", naam: "Invoegen", inhoud: null },
      ]}
    />,
  );
}

describe("lint: ARIA-structuur", () => {
  const markup = html();
  const doc = new DOMParserLite(markup);

  it("is een tablist met één geselecteerde, tabbare tab", () => {
    expect(doc.alle('role="tab"')).toHaveLength(2);
    expect(markup).toMatch(/role="tablist" aria-label="Lint"/);
    expect(doc.alle('aria-selected="true"')).toHaveLength(1);
    expect(markup).toMatch(/aria-selected="true"[^>]*tabindex="0"/);
    expect(markup).toMatch(/aria-selected="false"[^>]*tabindex="-1"/);
  });

  it("koppelt tab, tabpanel en toolbar", () => {
    const paneel = /role="tabpanel" id="([^"]+)" aria-labelledby="([^"]+)"/.exec(markup)!;
    expect(markup).toContain(`aria-controls="${paneel[1]}"`);
    expect(markup).toContain(`id="${paneel[2]}"`);
    expect(markup).toMatch(/role="toolbar" aria-label="Start"/);
  });

  it("geeft groepen en knoppen een toegankelijke naam", () => {
    expect(markup).toMatch(/role="group" aria-label="Klembord"/);
    expect(markup).toContain('aria-label="Plakken"');
    expect(markup).toMatch(/aria-label="Vet" aria-pressed="true"/);
    // De ingeklapte groepsknop meldt of zijn paneel open is.
    expect(markup).toMatch(/class="ribbon-groep-knop" aria-expanded="false" aria-controls="[^"]+"/);
  });

  it("verbergt decoratie en scrollknoppen voor schermlezers", () => {
    expect(markup).toMatch(/class="ribbon-scroll ribbon-scroll-links" hidden="" tabindex="-1" aria-hidden="true"/);
    expect(markup).toMatch(/class="ribbon-groep-naam" aria-hidden="true"/);
  });
});

/** Kleine teller op ruwe markup; genoeg voor attribuutcontroles. */
class DOMParserLite {
  constructor(private markup: string) {}
  alle(attribuut: string) {
    return this.markup.split(attribuut).slice(1);
  }
}
