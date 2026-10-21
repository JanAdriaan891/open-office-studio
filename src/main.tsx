import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/space-grotesk/600.css";
import { OfficeStudio } from "./OfficeStudio";
import "../packages/access/src/access.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <OfficeStudio />
  </React.StrictMode>,
);
