# Spellingcontrole: bronnen en licenties (#21)

De bestanden zelf staan niet in Git. `scripts/haal-woordenboeken.mjs` haalt ze van een vaste commit
(sha256 in `assets/woordenboeken.json`), `scripts/bouw-spelling-wasm.mjs` bouwt de module. Beide
schrijven de licentieteksten naar `public/licenses/woordenboeken/` en `public/licenses/spelling/`,
zodat ze met de app worden meegeleverd.

| Onderdeel | Versie | Licentie | Bron |
|---|---|---|---|
| Nederlands woordenboek (OpenTaal) | 2.20.23 (2023-03-10) | BSD-3-Clause of CC BY 3.0 (naar keuze) | github.com/OpenTaal/opentaal-hunspell @ ad0351b7 |
| Engels (VK), SCOWL en_GB-ise | 2020.12.07 (dictionary-en-gb 3.0.0) | MIT AND BSD (SCOWL, met publiek domein en WordNet) | github.com/wooorm/dictionaries @ 8cfea406 |
| Engels (VS), SCOWL en_US | 2020.12.07 (dictionary-en 4.0.0) | MIT AND BSD | github.com/wooorm/dictionaries @ 8cfea406 |
| spellbook (Rust, Hunspell-compatibel) | 0.4.2 (2026-06-03) | MPL-2.0 | crates.io/crates/spellbook |
| hashbrown | 0.17.1 | MIT OR Apache-2.0 | crates.io |
| foldhash | 0.2.0 | Zlib | crates.io |

OpenTaal vraagt bronvermelding: "Nederlands woordenboek voor spellingcontrole, © OpenTaal". MPL-2.0
geldt per bestand: de broncode van spellbook is ongewijzigd en staat op crates.io; onze eigen laag
(`src/spelling/rust/src/lib.rs`) valt onder de projectlicentie.
