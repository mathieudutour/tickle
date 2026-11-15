import { useCallback } from "react";
import { isStandalone, useInstall, type InstallMethod } from "../lib/install";
import { Sheet, SheetHeader } from "./Sheet";
import { useUi } from "./UiProvider";

const WHY =
  "Sur iPhone, c’est indispensable pour recevoir les alertes. Et sinon, le navigateur peut effacer tes rappels sur cet appareil si tu ne l’ouvres pas pendant quelques jours.";

function Steps({ method }: { method: InstallMethod }) {
  if (method === "ios") {
    return (
      <ol className="install-steps">
        <li>
          Touche le bouton <b>Partager</b>{" "}
          <span aria-hidden="true">(le carré avec une flèche ⬆︎)</span>.
        </li>
        <li>
          Choisis <b>Sur l’écran d’accueil</b>, puis <b>Ajouter</b>.
        </li>
        <li>Ouvre ensuite Tickle depuis son icône.</li>
      </ol>
    );
  }
  return (
    <ol className="install-steps">
      <li>Ouvre le menu du navigateur (⋮ ou ⋯).</li>
      <li>
        Choisis <b>Ajouter à l’écran d’accueil</b> ou <b>Installer l’application</b>.
      </li>
      <li>Ouvre ensuite Tickle depuis son icône.</li>
    </ol>
  );
}

/** Shown right after joining a space, and from the settings. */
export function InstallSheet({ onClose }: { onClose: () => void }) {
  const install = useInstall();
  return (
    <Sheet onClose={onClose} labelledBy="install-title">
      <div className="in">
        <SheetHeader
          id="install-title"
          title="Garde Tickle sur ton écran d’accueil"
          onClose={onClose}
        />
        <p className="note">{WHY}</p>
        {install.method === "prompt" ? (
          <button
            className="cta"
            onClick={async () => {
              await install.prompt();
              onClose();
            }}
          >
            📲 Installer Tickle
          </button>
        ) : (
          <Steps method={install.method} />
        )}
        <button className="cta ghost" onClick={onClose}>
          Plus tard
        </button>
      </div>
    </Sheet>
  );
}

/** A reminder in the settings, until the app is opened from the home screen. */
export function InstallHint() {
  const install = useInstall();
  const { openSheet } = useUi();
  if (install.installed) return null;
  return (
    <div className="install-hint">
      <span aria-hidden="true">📲</span>
      <p className="note">
        Ajoute Tickle à ton écran d’accueil pour recevoir les alertes et garder tes listes.
      </p>
      <button
        className="pill"
        onClick={() =>
          install.method === "prompt"
            ? void install.prompt()
            : openSheet((close) => <InstallSheet onClose={close} />)
        }
      >
        {install.method === "prompt" ? "Installer" : "Comment ?"}
      </button>
    </div>
  );
}

/** Opens the install sheet unless Tickle already runs from the home screen. */
export function useSuggestInstall() {
  const { openSheet } = useUi();
  return useCallback(() => {
    if (!isStandalone()) openSheet((close) => <InstallSheet onClose={close} />);
  }, [openSheet]);
}
