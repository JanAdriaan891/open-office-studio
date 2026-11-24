/** Bediening van het begrensde raster (#371): de groep in Beeld en de knop in de statusbalk. */
import { useTranslation } from "react-i18next";
import { Grid2x2, Shrink } from "lucide-react";
import { Actie, Groep } from "../Ribbon";
import { useInstellingen } from "../instellingen";
import { useRasterBediening } from "./rasterWeergave";

export function RasterGroep() {
  const { t } = useTranslation("spreadsheet");
  const raster = useRasterBediening();
  return (
    <Groep naam={t("boundedGrid.group")}>
      <Actie
        naam={t("boundedGrid.bounded")}
        icoon={Grid2x2}
        groot
        disabled={!raster}
        actief={!!raster?.begrensd}
        title={t("boundedGrid.boundedHint")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => raster?.zet(!raster.begrensd)}
      />
      <Actie
        naam={t("boundedGrid.fit")}
        icoon={Shrink}
        disabled={!raster?.begrensd}
        title={t("boundedGrid.fitHint")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => raster?.pasAan()}
      />
    </Groep>
  );
}

/** Wisselknop in de statusbalk: onbeperkt of begrensd raster voor het actieve blad. */
export function RasterStatusKnop() {
  const { t } = useTranslation("spreadsheet");
  const { statusbalk } = useInstellingen();
  const raster = useRasterBediening();
  if (!raster || !statusbalk.weergave) return null;
  const titel = raster.begrensd
    ? t("boundedGrid.statusBounded", { rows: raster.omvang.rijen, columns: raster.omvang.kolommen })
    : t("boundedGrid.statusUnbounded");
  return (
    <span className="statusbalk-weergave" role="group" aria-label={t("boundedGrid.group")}>
      <button
        type="button"
        className="statusbalk-icoon"
        data-testid="raster-statusknop"
        aria-label={t("boundedGrid.bounded")}
        aria-pressed={raster.begrensd}
        title={titel}
        onClick={() => raster.zet(!raster.begrensd)}
      >
        <Grid2x2 size={13} />
      </button>
    </span>
  );
}
