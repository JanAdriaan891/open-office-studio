/**
 * Laadt sql.js in de browser of worker met de WASM uit de eigen bundel
 * (Vite `?url`), nooit van een CDN. Alleen voor Vite-builds; Node gebruikt
 * `initSqlJs()` uit `sql.js` direct.
 */
import initSqlJs, { type SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";

let laden: Promise<SqlJsStatic> | null = null;

export function laadSqlJs(): Promise<SqlJsStatic> {
  laden ??= initSqlJs({ locateFile: () => wasmUrl }).catch((fout) => {
    laden = null;
    throw fout;
  });
  return laden;
}
