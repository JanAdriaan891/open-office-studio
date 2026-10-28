import { BookOpen, FileText } from "lucide-react";
import { Actie, Groep } from "../../Ribbon";
import { useTekstExtra } from "./winkel";

/** Lintgroep ‘Weergaven’ (Beeld): afdrukweergave en leesmodus. */
export function WeergaveGroep() {
  const extra = useTekstExtra();
  return (
    <Groep naam="Weergaven">
      <Actie
        naam="Afdrukweergave"
        icoon={FileText}
        groot
        actief={extra?.weergave !== "lees"}
        onClick={() => extra?.zetWeergave("afdruk")}
      />
      <Actie
        naam="Leesmodus"
        icoon={BookOpen}
        groot
        actief={extra?.weergave === "lees"}
        title="Leesmodus · rustige, schermvullende weergave (Esc sluit)"
        onClick={() => extra?.zetWeergave("lees")}
      />
    </Groep>
  );
}
