import { defineConfig } from "vite";
export default defineConfig({
  // De engines laden WASM relatief aan import.meta.url; prebundelen verbreekt die paden.
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
    exclude: [
      "@betteroffice/docx",
      "@betteroffice/xlsx",
      "@betteroffice/pptx",
      "@betteroffice/fonts",
      "@betteroffice/docx-react",
      "@betteroffice/xlsx-react",
      "@betteroffice/pptx-react",
      "@betteroffice/docx/layout",
      "@betteroffice/docx/wasm",
    ],
  },
  server: { host: "127.0.0.1", port: 1420, strictPort: true },
  clearScreen: false,
});
