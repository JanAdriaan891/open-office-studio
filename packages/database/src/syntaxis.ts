/** Eenvoudige, alleen-weergevende syntaxiskleuring voor VBA en Access-SQL. */
export type Tokensoort =
  | "sleutelwoord"
  | "tekst"
  | "commentaar"
  | "getal"
  | "naam"
  | "gewoon";
export interface Token {
  tekst: string;
  soort: Tokensoort;
}
const vba = new Set(
  "and as boolean byref byval call case const currency date debug declare dim do double each else elseif end enum error exit explicit false for function get global gosub goto if in integer is let lib like long loop me mod new next not nothing null object on option optional or private property public redim resume select set single static step string sub then to true type until variant wend while with xor attribute".split(
    " ",
  ),
);
const sql = new Set(
  "add all alter and as asc between by column constraint create crosstab delete desc distinct distinctrow drop exists from group having in index inner insert into is join left like not null on or order outer owneraccess parameters percent pivot primary right select set table top transform union update values where with".split(
    " ",
  ),
);
export function kleurTokens(bron: string, taal: "vba" | "sql"): Token[] {
  const tokens: Token[] = [];
  const woorden = taal === "vba" ? vba : sql;
  const patroon =
    taal === "vba"
      ? /('[^\r\n]*|\bRem\b[^\r\n]*)|("(?:[^"\r\n]|"")*"?)|(\b\d+(?:\.\d+)?\b|&H[0-9A-F]+\b)|([A-Za-z_][\w]*)|(\[[^\]\r\n]*\])/giy
      : /(--[^\r\n]*)|("(?:[^"\r\n]|"")*"?|'(?:[^'\r\n]|'')*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w]*)|(\[[^\]\r\n]*\])/giy;
  let gewoon = "";
  let positie = 0;
  const duw = (tekst: string, soort: Tokensoort) => {
    if (gewoon) tokens.push({ tekst: gewoon, soort: "gewoon" });
    gewoon = "";
    tokens.push({ tekst, soort });
  };
  while (positie < bron.length) {
    patroon.lastIndex = positie;
    const treffer = patroon.exec(bron);
    if (!treffer) {
      gewoon += bron[positie++];
      continue;
    }
    const [geheel, commentaar, tekst, getal, woord, naam] = treffer;
    if (commentaar) duw(geheel, "commentaar");
    else if (tekst) duw(geheel, "tekst");
    else if (getal) duw(geheel, "getal");
    else if (naam) duw(geheel, "naam");
    else if (woord && woorden.has(woord.toLowerCase()))
      duw(geheel, "sleutelwoord");
    else gewoon += geheel;
    positie += geheel.length;
  }
  if (gewoon) tokens.push({ tekst: gewoon, soort: "gewoon" });
  return tokens;
}
