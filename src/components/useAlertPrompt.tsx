import { useCallback } from "react";
import { timeLabel } from "../lib/dates";
import { enablePush, pushState } from "../lib/push";
import { useStore } from "../store/StoreProvider";
import { InstallSheet } from "./InstallHint";
import { useUi } from "./UiProvider";

const ASKED_KEY = "tickle/alerts-asked";

/**
 * The first time a reminder gets a time on a device without alerts, offers to turn them on, right when they make sense
 * (« Être prévenu à 18 h ? »), instead of only in Réglages. Asked once; on an iPhone that hasn't added Tickle to its home
 * screen, explains how to instead.
 */
export function useAlertPrompt() {
  const { status } = useStore();
  const { toast, afterSheet, openSheet } = useUi();
  return useCallback(
    (time: string | undefined) => {
      const key = status.key;
      if (!time || !key || localStorage.getItem(ASKED_KEY)) return;
      const state = pushState();
      if (state !== "off" && state !== "needs-install") return;
      localStorage.setItem(ASKED_KEY, "1");
      afterSheet(() => {
        if (state === "needs-install")
          toast(`Pour être prévenu à ${timeLabel(time)}, ajoute Tickle à l’écran d’accueil`, {
            label: "Comment ?",
            run: () => openSheet((close) => <InstallSheet onClose={close} />),
          });
        else
          toast(`Être prévenu à ${timeLabel(time)} ?`, {
            label: "Activer",
            run: async () =>
              toast(
                (await enablePush(key))
                  ? "Alertes activées sur cet appareil"
                  : "Alertes non activées",
              ),
          });
      });
    },
    [status.key, toast, afterSheet, openSheet],
  );
}
