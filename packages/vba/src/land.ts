/**
 * Landinstelling voor conversies zoals Windows ze aan VBA geeft (CStr, CDbl,
 * CDate, Format, MonthName). Standaard Nederlands, zoals een Nederlandse Access.
 */
export interface Landinstelling {
  decimaal: string;
  duizendtal: string;
  /** Volgorde van de korte datum. */
  datumVolgorde: "dmy" | "mdy" | "ymd";
  datumScheiding: string;
  tijdScheiding: string;
  /** Korte datum met voorloopnullen (dd-mm) of zonder (d-m). */
  korteDatumNullen: boolean;
  /** 24-uursklok of AM/PM. */
  uur24: boolean;
  valuta: string;
  /** Valutasymbool vóór (true) of na het bedrag. */
  valutaVoor: boolean;
  maanden: string[];
  maandenKort: string[];
  dagen: string[]; // zondag eerst, zoals vbSunday = 1
  dagenKort: string[];
  waar: string;
  onwaar: string;
}

export const NEDERLANDS: Landinstelling = {
  decimaal: ",",
  duizendtal: ".",
  datumVolgorde: "dmy",
  datumScheiding: "-",
  tijdScheiding: ":",
  korteDatumNullen: false,
  uur24: true,
  valuta: "€",
  valutaVoor: true,
  maanden: [
    "januari",
    "februari",
    "maart",
    "april",
    "mei",
    "juni",
    "juli",
    "augustus",
    "september",
    "oktober",
    "november",
    "december",
  ],
  maandenKort: ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"],
  dagen: ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"],
  dagenKort: ["zo", "ma", "di", "wo", "do", "vr", "za"],
  waar: "Waar",
  onwaar: "Onwaar",
};

export const ENGELS_VS: Landinstelling = {
  decimaal: ".",
  duizendtal: ",",
  datumVolgorde: "mdy",
  datumScheiding: "/",
  tijdScheiding: ":",
  korteDatumNullen: false,
  uur24: false,
  valuta: "$",
  valutaVoor: true,
  maanden: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
  maandenKort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  dagen: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  dagenKort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  waar: "True",
  onwaar: "False",
};
