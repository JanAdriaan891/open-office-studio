/**
 * OpenAEC-lint: een herbruikbaar lint voor OpenAEC-apps (Office Studio,
 * Planner Studio). Alleen React als afhankelijkheid; kleuren via de
 * custom properties `--lint-*` met de OpenAEC-shelltokens als terugval.
 *
 * - Scrollknoppen en muiswiel zodra het lint niet past.
 * - Groepen klappen per stap in: compact (labels weg), daarna één knop met
 *   een uitklappaneel. `prioriteit` houdt een groep langer volledig.
 * - Toetsenbord: Alt of F10 voor toetstips, pijltjes door tabs en knoppen,
 *   Enter opent een ingeklapte groep, Esc gaat terug; Ctrl+F1 verbergt het lint.
 */
export { Lint, LintGroep, LintActie } from "./Lint";
export type { LintProps, LintTab, LintTeksten, LintIcoon } from "./Lint";
export { kiesNiveaus, inklapvolgorde, scrollKnoppen, wielNaarHorizontaal } from "./inklappen";
export type { GroepMaten, Indeling, Niveau } from "./inklappen";
export { kenToetstips, zoekToetstip } from "./toetstips";
export { focusbare } from "./focus";
