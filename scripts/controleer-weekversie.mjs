import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const gegevens = JSON.parse(await readFile("versie.json", "utf8"));
assert.match(gegevens.versie, /^\d{4}\.(?:[1-9]|[1-4]\d|5[0-3])\.[1-9]\d*$/);
assert.equal(
  gegevens.versie,
  `${gegevens.jaar}.${gegevens.week}.${gegevens.volgnummer}`,
);
assert.equal(
  gegevens.label,
  `${gegevens.jaar}-W${String(gegevens.week).padStart(2, "0")}.${gegevens.volgnummer}`,
);
for (const pad of [
  "package.json",
  "src-tauri/tauri.conf.json",
  "apps/access-studio/src-tauri/tauri.conf.json",
]) {
  assert.equal(
    JSON.parse(await readFile(pad, "utf8")).version,
    gegevens.versie,
    pad,
  );
}
for (const [map, naam] of [
  ["src-tauri", "open-office-studio"],
  ["apps/access-studio/src-tauri", "open-access-studio"],
]) {
  const cargo = await readFile(`${map}/Cargo.toml`, "utf8");
  assert.equal(cargo.match(/^version = "([^"]+)"/m)?.[1], gegevens.versie, map);
  const lock = await readFile(`${map}/Cargo.lock`, "utf8");
  assert.equal(
    lock.match(new RegExp(`name = "${naam}"\\nversion = "([^"]+)"`))?.[1],
    gegevens.versie,
    map,
  );
}
console.log(`Office en Access gebruiken weekversie ${gegevens.label}.`);
