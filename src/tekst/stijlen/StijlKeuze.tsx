import { useDocxCommand } from "@betteroffice/docx-react";
import { OpdrachtKeuze, type GebondenOpdracht } from "../../Ribbon";
import { useEditorApi } from "../../lint/editorApi";
import { stijlNaam } from "./model";
import { metHeleAlinea } from "./toepassen";
import { useHerhaalbaar } from "../bewerken/herhaalmelding";

/** Keuzelijst met alle alineastijlen (lint en mini-werkbalk), met Nederlandse namen. */
export function AlineastijlKeuze({ naam, breed }: { naam: string; breed?: boolean }) {
  const opdracht = useHerhaalbaar("paragraphStyle", useDocxCommand("paragraphStyle"));
  const api = useEditorApi().tekst;
  const gebonden: GebondenOpdracht = {
    ...opdracht,
    execute: (args) => metHeleAlinea(api(), () => opdracht.execute(args as never)),
  };
  return (
    <OpdrachtKeuze
      opdracht={gebonden}
      naam={naam}
      breed={breed}
      vertaal={(label) => stijlNaam({ styleId: label, name: label })}
    />
  );
}
