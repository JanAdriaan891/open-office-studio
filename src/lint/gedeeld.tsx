import {
  useDocxCommand,
  type DocxCommandArgs,
  type DocxCommandId,
  type DocxSelectCommandId,
} from "@betteroffice/docx-react";
import {
  useXlsxCommand,
  type XlsxCommandArgs,
  type XlsxCommandId,
  type XlsxSelectCommandId,
} from "@betteroffice/xlsx-react";
import {
  usePptxCommand,
  type PptxCommandArgs,
  type PptxCommandId,
  type PptxSelectCommandId,
} from "@betteroffice/pptx-react";
import { Undo2, Redo2, ZoomIn, type LucideIcon } from "lucide-react";
import {
  Groep,
  OpdrachtKnop,
  OpdrachtKeuze,
  type GebondenOpdracht,
} from "../Ribbon";

export type Knop = { naam: string; icoon: LucideIcon; groot?: boolean };
export function W<K extends DocxCommandId>({
  id,
  args,
  ...props
}: Knop & { id: K; args?: DocxCommandArgs[K] }) {
  return <OpdrachtKnop {...props} opdracht={useDocxCommand(id, args)} />;
}
export function C<K extends XlsxCommandId>({
  id,
  args,
  ...props
}: Knop & { id: K; args?: XlsxCommandArgs[K] }) {
  return <OpdrachtKnop {...props} opdracht={useXlsxCommand(id, args)} />;
}
export function P<K extends PptxCommandId>({
  id,
  args,
  ...props
}: Knop & { id: K; args?: PptxCommandArgs[K] }) {
  return <OpdrachtKnop {...props} opdracht={usePptxCommand(id, args)} />;
}
export function WK({
  id,
  naam,
  breed,
}: {
  id: DocxSelectCommandId;
  naam: string;
  breed?: boolean;
}) {
  return (
    <OpdrachtKeuze opdracht={useDocxCommand(id)} naam={naam} breed={breed} />
  );
}
export function CK({
  id,
  naam,
  breed,
}: {
  id: XlsxSelectCommandId;
  naam: string;
  breed?: boolean;
}) {
  return (
    <OpdrachtKeuze opdracht={useXlsxCommand(id)} naam={naam} breed={breed} />
  );
}
export function PK({
  id,
  naam,
  breed,
}: {
  id: PptxSelectCommandId;
  naam: string;
  breed?: boolean;
}) {
  return (
    <OpdrachtKeuze opdracht={usePptxCommand(id)} naam={naam} breed={breed} />
  );
}
export function Geschiedenis({
  soort,
}: {
  soort: "tekst" | "rekenblad" | "dia";
}) {
  return (
    <Groep naam="Bewerken">
      <div className="ribbon-stapel">
        {soort === "tekst" ? (
          <>
            <W id="undo" naam="Ongedaan" icoon={Undo2} />
            <W id="redo" naam="Opnieuw" icoon={Redo2} />
          </>
        ) : soort === "rekenblad" ? (
          <>
            <C id="undo" naam="Ongedaan" icoon={Undo2} />
            <C id="redo" naam="Opnieuw" icoon={Redo2} />
          </>
        ) : (
          <>
            <P id="undo" naam="Ongedaan" icoon={Undo2} />
            <P id="redo" naam="Opnieuw" icoon={Redo2} />
          </>
        )}
      </div>
    </Groep>
  );
}
export function Zoom({ opdracht }: { opdracht: GebondenOpdracht }) {
  return (
    <Groep naam="Zoom">
      <div className="ribbon-stapel">
        <ZoomIn size={24} strokeWidth={1.5} />
        <OpdrachtKeuze opdracht={opdracht} naam="Zoomniveau" />
      </div>
    </Groep>
  );
}
export function scrollvlakVan(element: Element | null) {
  for (let vlak = element?.parentElement; vlak; vlak = vlak.parentElement)
    if (/(auto|scroll)/.test(getComputedStyle(vlak).overflow)) return vlak;
  return null;
}
