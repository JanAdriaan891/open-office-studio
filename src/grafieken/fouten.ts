/** Een melding voor de gebruiker over grafieken; geen programmeerfout. */
export class GrafiekFout extends Error {
  constructor(bericht: string) {
    super(bericht);
    this.name = "GrafiekFout";
  }
}

/** Grenzen die een grafiek of pakket niet mag overschrijden. */
export const LIMIETEN = {
  /** Gecomprimeerde grootte van een kantoordocument. */
  pakketBytes: 100 * 1024 * 1024,
  /** Uitgepakte grootte van alle onderdelen samen. */
  uitgepaktBytes: 400 * 1024 * 1024,
  onderdelen: 20000,
  reeksen: 24,
  categorieen: 1000,
  /** Cellen in een gegevensbereik (rijen × kolommen). */
  cellen: 25000,
  titel: 255,
  grafiekenPerPakket: 500,
} as const;
