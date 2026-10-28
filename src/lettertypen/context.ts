import { createContext } from "react";

/** De lettertypen die het geopende document noemt (groep "In dit document"). */
export const DocumentLettertypen = createContext<readonly string[]>([]);
