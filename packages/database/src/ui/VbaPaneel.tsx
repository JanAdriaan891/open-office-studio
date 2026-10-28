/** VBA-module: bron, procedures met “Uitvoeren”, en het uitvoervenster. */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Code2, Eraser, Pencil, Play, Save, Square, Trash2, X } from "lucide-react";
import type { LaadResultaat, ProcedureInfo } from "../../../vba/src/protocol.ts";
import { kleurTokens } from "../syntaxis.ts";
import type { VbaModule } from "./vba-sessie.ts";
import type { Uitvoerregel, VbaBediening } from "./useVba.tsx";
import { MODI } from "./extern-logica.ts";
import type { OntbrekendModus } from "../../../vba/src/extern-typen.ts";

/** Broncode met kleuren; `markeer` (regelnummer, 1 = eerste) markeert een regel en scrolt erheen. */
export function Bron({ bron, taal, markeer }: { bron: string; taal: "vba" | "sql"; markeer?: number }) {
  const pre = useRef<HTMLPreElement>(null);
  const markering = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const p = pre.current;
    const m = markering.current;
    if (!p || !m || !markeer) return;
    const stijl = getComputedStyle(p);
    const hoogte = parseFloat(stijl.lineHeight) || 20;
    m.style.top = `${parseFloat(stijl.paddingTop) + (markeer - 1) * hoogte}px`;
    m.style.height = `${hoogte}px`;
    p.scrollTop = Math.max(0, (markeer - 1) * hoogte - p.clientHeight / 3);
    m.scrollIntoView?.({ block: "nearest" });
  }, [markeer, bron]);
  return (
    <pre ref={pre} className={`database-bron${markeer ? " heeft-markering" : ""}`}>
      {!!markeer && <span ref={markering} className="database-bron-markering" aria-hidden />}
      <code>
        {kleurTokens(bron, taal).map((token, index) =>
          token.soort === "gewoon" ? (
            token.tekst
          ) : (
            <span key={index} className={`syntax-${token.soort}`}>
              {token.tekst}
            </span>
          ),
        )}
      </code>
    </pre>
  );
}

const CATEGORIE: Record<string, string> = {
  proces: "processen starten",
  bestand: "bestanden",
  com: "COM/ActiveX",
  "windows-api": "Windows-API",
  toetsenbord: "toetsenbord",
  omgeving: "omgeving",
  register: "register",
  hyperlink: "hyperlinks",
  export: "export",
};

export function VbaPaneel({
  module,
  vba,
  modules,
  onWijzig,
  onVerwijder,
  regel,
}: {
  module: VbaModule;
  /** Regel om te markeren (sprong vanuit Externe verwijzingen). */
  regel?: number;
  vba: VbaBediening;
  modules: VbaModule[];
  /** Bewaart de bron in de werkkopie (`bewaarModule`); een fout blijft in de editor staan. */
  onWijzig: (bron: string) => void | Promise<void>;
  /** Verwijdert de module uit de werkkopie (na bevestiging door de aanroeper). */
  onVerwijder?: () => void | Promise<void>;
}) {
  const [info, setInfo] = useState<{ procedures: ProcedureInfo[]; laad: LaadResultaat } | null>(null);
  const [fout, setFout] = useState("");
  const [bewaarFout, setBewaarFout] = useState("");
  const [bewaren, setBewaren] = useState(false);
  const [bewerken, setBewerken] = useState(false);
  const [concept, setConcept] = useState(module.bron);
  const sessie = vba.sessie;

  useEffect(() => {
    setConcept(module.bron);
    setBewerken(false);
    setBewaarFout("");
  }, [module.naam, module.bron]);

  useEffect(() => {
    let actief = true;
    setInfo(null);
    setFout("");
    if (!sessie) return;
    // Alleen ontleden (laden); er wordt hier niets uitgevoerd.
    sessie.procedures(modules).then(
      (r) => actief && setInfo(r),
      (e) => actief && setFout(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      actief = false;
    };
  }, [sessie, modules]);

  const eigen = info?.procedures.filter((p) => p.module.toLowerCase() === module.naam.toLowerCase()) ?? [];
  const parseerfouten = info?.laad.fouten.filter((f) => f.module?.toLowerCase() === module.naam.toLowerCase()) ?? [];
  const afgeschermd = info?.laad.afscherming.filter((b) => b.module.toLowerCase() === module.naam.toLowerCase()) ?? [];
  const formulier = module.soort === "formulier" ? module.naam.replace(/^(form|report)_/i, "") : null;
  const modusId = useId();

  return (
    <div className="database-vba">
      <section className="database-vba-procedures" aria-label="Procedures">
        <h3>Procedures</h3>
        {!sessie && <p className="muted">Open eerst een werkkopie om VBA uit te voeren.</p>}
        {sessie && (
          <div className="database-vba-modus">
            <label>
              Bij ontbrekende onderdelen
              <select
                value={vba.ontbrekend}
                disabled={!!vba.bezig}
                aria-describedby={modusId}
                onChange={(e) => vba.setOntbrekend(e.target.value as OntbrekendModus)}
              >
                {MODI.map((m) => (
                  <option key={m.waarde} value={m.waarde}>
                    {m.naam}
                  </option>
                ))}
              </select>
            </label>
            <small id={modusId}>{MODI.find((m) => m.waarde === vba.ontbrekend)?.uitleg} Er wordt nooit iets buiten de werkkopie aangesproken.</small>
          </div>
        )}
        {sessie && !info && !fout && <p role="status">Module ontleden…</p>}
        {fout && (
          <p className="melding fout" role="alert">
            {fout}
          </p>
        )}
        {parseerfouten.map((f, i) => (
          <p key={i} className="melding fout" role="alert">
            Syntaxisfout op regel {f.regel ?? "?"}: {f.beschrijving}. Deze module kan niet worden uitgevoerd.
          </p>
        ))}
        {!!afgeschermd.length && (
          <p className="melding">
            Deze module gebruikt {afgeschermd.length} afgeschermde {afgeschermd.length === 1 ? "constructie" : "constructies"} (
            {[...new Set(afgeschermd.map((b) => `${b.naam} (${CATEGORIE[b.categorie] ?? b.categorie})`))].slice(0, 6).join(", ")}). Die worden
            geweigerd als ze worden bereikt.
          </p>
        )}
        {info && !eigen.length && !parseerfouten.length && (
          <p className="muted">Geen publieke procedures zonder verplichte parameters in deze module.</p>
        )}
        <ul>
          {eigen.map((p) => {
            const uitvoerbaar = !p.gebeurtenis && module.soort === "module";
            return (
              <li key={p.naam}>
                <span>
                  <Code2 size={14} aria-hidden /> {p.naam}
                  <small>
                    {p.type === "function" ? "Function" : "Sub"}
                    {p.gebeurtenis ? " · gebeurtenis" : ""}
                  </small>
                </span>
                {uitvoerbaar ? (
                  <button
                    disabled={!!vba.bezig}
                    onClick={() => void vba.voerUit(module.naam, p.naam)}
                    aria-label={`${p.naam} uitvoeren`}
                  >
                    <Play size={14} /> Uitvoeren
                  </button>
                ) : (
                  <small className="muted">{formulier ? `Via formulier ‘${formulier}’` : module.soort === "klasse" ? "Klassemodule" : "Gebeurtenis"}</small>
                )}
              </li>
            );
          })}
        </ul>
        {formulier && (
          <p className="muted">
            Gebeurtenissen van deze formuliermodule (Form_Load, Form_Current, knop_Click) worden uitgevoerd wanneer je het formulier ‘
            {formulier}’ opent en gebruikt. Maak daarvoor een formulier met deze naam (Maken › Formulier); het Access-formulierontwerp
            zelf is niet leesbaar.
          </p>
        )}
      </section>
      <section className="database-vba-bron" aria-label="Broncode">
        <div className="database-werkbalk">
          <h3>Broncode</h3>
          {bewerken ? (
            <>
              <button
                className="primary"
                disabled={bewaren}
                onClick={async () => {
                  setBewaren(true);
                  setBewaarFout("");
                  try {
                    await onWijzig(concept);
                    setBewerken(false);
                  } catch (e) {
                    setBewaarFout(e instanceof Error ? e.message : String(e));
                  } finally {
                    setBewaren(false);
                  }
                }}
              >
                <Save size={14} /> Opslaan in werkkopie
              </button>
              <button
                disabled={bewaren}
                onClick={() => {
                  setConcept(module.bron);
                  setBewerken(false);
                  setBewaarFout("");
                }}
              >
                <X size={14} /> Annuleren
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setBewerken(true)}>
                <Pencil size={14} /> Bewerken
              </button>
              {onVerwijder && (
                <button className="is-gevaar" onClick={() => void onVerwijder()}>
                  <Trash2 size={14} /> Module verwijderen
                </button>
              )}
            </>
          )}
        </div>
        {bewaarFout && (
          <p className="melding fout" role="alert">
            {bewaarFout}
          </p>
        )}
        {bewerken ? (
          <textarea className="database-vba-editor" aria-label={`Broncode van ${module.naam}`} spellCheck={false} value={concept} onChange={(e) => setConcept(e.target.value)} />
        ) : (
          <>
            {!!regel && <p className="muted">Regel {regel} is gemarkeerd.</p>}
            <Bron bron={module.bron} taal="vba" markeer={regel} />
          </>
        )}
        <p className="muted">
          {module.herkomst === "access"
            ? module.gewijzigd
              ? "Uit het Access-origineel, bewerkt in de werkkopie."
              : "Uit het Access-origineel."
            : "Gemaakt in de werkkopie."}{" "}
          Opslaan bewaart de module in de werkkopie (_openaec_modules); bewaar de werkkopie als .sqlite om de wijziging te houden. Het
          origineel blijft ongewijzigd.
        </p>
      </section>
    </div>
  );
}

export function VbaUitvoer({ vba }: { vba: VbaBediening }) {
  const lijst = useRef<HTMLDivElement>(null);
  useEffect(() => {
    lijst.current?.scrollTo({ top: lijst.current.scrollHeight });
  }, [vba.uitvoer.length]);
  if (!vba.uitvoer.length && !vba.bezig) return null;
  return (
    <section className="database-vba-uitvoer" aria-label="Uitvoervenster">
      <div className="database-werkbalk">
        <h3>Directvenster</h3>
        {vba.bezig && (
          <span role="status" className="database-vba-bezig">
            Bezig: {vba.bezig}
          </span>
        )}
        <button onClick={vba.stop} disabled={!vba.bezig} className={vba.bezig ? "is-gevaar" : ""}>
          <Square size={14} /> Stop
        </button>
        <button onClick={vba.wisUitvoer} disabled={!!vba.bezig}>
          <Eraser size={14} /> Wissen
        </button>
      </div>
      <div ref={lijst} className="database-vba-log" role="log" aria-live="polite">
        {vba.uitvoer.map((r: Uitvoerregel, i) => (
          <div key={i} className={`regel-${r.soort}`}>
            {r.tekst}
          </div>
        ))}
      </div>
    </section>
  );
}
