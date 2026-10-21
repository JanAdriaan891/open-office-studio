import { cp, mkdir } from "node:fs/promises";
await mkdir("public/voorbeelden", { recursive: true });
for (const naam of [
  "Ontwerpnotitie.docx",
  "Materiaaloverzicht.xlsx",
  "Ontwerpvisie.pptx",
])
  await cp(`docs/voorbeelden/${naam}`, `public/voorbeelden/${naam}`);
await mkdir("public/fonts", { recursive: true });
await cp("node_modules/@betteroffice/fonts/assets", "public/fonts", {
  recursive: true,
});
await mkdir("public/licenses/fonts", { recursive: true });
await cp(
  "node_modules/@betteroffice/fonts/LICENSE",
  "public/licenses/fonts/LICENSE",
);
await cp(
  "node_modules/@betteroffice/fonts/LICENSES",
  "public/licenses/fonts/LICENSES",
  { recursive: true },
);
await cp("node_modules/@betteroffice/fonts-cjk/assets", "public/fonts", {
  recursive: true,
});
await mkdir("public/licenses/fonts-cjk", { recursive: true });
await cp(
  "node_modules/@betteroffice/fonts-cjk/LICENSE",
  "public/licenses/fonts-cjk/LICENSE",
);
await cp(
  "node_modules/@betteroffice/fonts-cjk/LICENSES",
  "public/licenses/fonts-cjk/LICENSES",
  { recursive: true },
);
await import("./kopieer-licenties.mjs");
