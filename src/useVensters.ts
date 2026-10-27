import type { useTabbladen } from "./useTabbladen";
import type { MenuItem } from "./TabBalk";
import type { Tabblad } from "./tabbladen";

interface Opties {
  tabs: ReturnType<typeof useTabbladen>;
  openDocument: ReturnType<typeof useTabbladen>["openDocument"];
  openModule: ReturnType<typeof useTabbladen>["openModule"];
}

/** Vensterkoppeling: sluitbeveiliging in de desktopapp. */
export function useVensters(opties: Opties) {
  return {
    menu: undefined as ((tabblad: Tabblad) => MenuItem[]) | undefined,
    losgesleept: undefined as
      | ((id: number, x: number, y: number) => void)
      | undefined,
    meldWijzigingen(aantal: number) {
      if (!("__TAURI_INTERNALS__" in window)) return;
      void import("@tauri-apps/api/core")
        .then(({ invoke }) =>
          invoke("wijzigingsstatus", { gewijzigd: aantal > 0, aantal }),
        )
        .catch((e) =>
          opties.tabs.meld("Sluitbeveiliging niet beschikbaar: " + String(e)),
        );
    },
  };
}
