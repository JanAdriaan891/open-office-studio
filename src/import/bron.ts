/** Kenmerken van het geopende bronbestand die bij opslaan meetellen. */
export interface Bronkenmerken {
  /** Het origineel was met een wachtwoord versleuteld (het wachtwoord zelf wordt niet bewaard). */
  versleuteling?: "agile" | "standard";
}
