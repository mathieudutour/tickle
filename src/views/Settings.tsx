import { Art } from "../components/Art";
import { Agents } from "../components/Agents";
import { InstallHint } from "../components/InstallHint";
import { PeopleSettings } from "../components/People";
import { Sharing } from "../components/Sharing";
import { useUi } from "../components/UiProvider";
import { timeLabel } from "../lib/dates";
import { getSummaryAt, setSummaryAt, usePush } from "../lib/push";
import { useState } from "react";
import type { Route } from "../lib/router";
import { localTimeZone } from "../store/store";
import { useStore } from "../store/StoreProvider";
import { Header } from "./Header";

const PUSH_TEXT = {
  unsupported: "Ce navigateur ne peut pas recevoir d’alertes.",
  "needs-install":
    "Sur iPhone et iPad, les alertes arrivent une fois Tickle ajouté à l’écran d’accueil.",
  denied:
    "Les notifications sont bloquées pour Tickle : autorise-les dans les réglages du navigateur.",
  off: "Reçois une alerte à l’heure de chaque rappel, sur cet appareil, même quand Tickle est fermé.",
  on: "Cet appareil reçoit une alerte à l’heure de chaque rappel.",
};

export function Settings({ navigate }: { navigate: (route: Route) => void }) {
  const { space, status, dispatch } = useStore();
  const { toast } = useUi();
  const push = usePush(status.key);
  const deviceZone = localTimeZone();

  return (
    <div className="settings">
      <Header back={() => navigate({ name: "home" })} title="Réglages" />

      <section className="card pad">
        <Art name="alerts" small />
        <h2>Alertes</h2>
        <p className="note">{PUSH_TEXT[push.state]}</p>
        {push.state === "off" && (
          <button
            className="cta slim"
            disabled={push.busy || !status.key}
            onClick={async () =>
              toast(
                (await push.enable())
                  ? "Alertes activées sur cet appareil"
                  : "Alertes non activées",
              )
            }
          >
            Activer les alertes
          </button>
        )}
        {push.state === "on" && (
          <>
            <MorningSummary />
            <button
              className="cta ghost slim"
              disabled={push.busy}
              onClick={() => void push.disable()}
            >
              Désactiver sur cet appareil
            </button>
          </>
        )}
        <p className="note spaced">
          Fuseau horaire des alertes : <b>{space.timeZone.replace(/_/g, " ")}</b>
          {space.timeZone !== deviceZone && (
            <>
              {" "}
              ·{" "}
              <button
                className="link-button"
                onClick={() => dispatch({ type: "setTimeZone", timeZone: deviceZone })}
              >
                Utiliser {deviceZone.replace(/_/g, " ")}
              </button>
            </>
          )}
        </p>
      </section>

      <section className="card pad">
        <h2>Personnes</h2>
        <PeopleSettings />
      </section>

      <section className="card pad">
        <Art name="sharing" small />
        <h2>Partage</h2>
        <Sharing />
      </section>

      <section className="card pad">
        <Art name="agents" small />
        <h2>Agents IA</h2>
        {status.key ? (
          <Agents spaceKey={status.key} />
        ) : (
          <p className="note">Disponible dès que l’appareil est en ligne.</p>
        )}
        <p className="note spaced">
          Dans un navigateur compatible WebMCP, l’agent du navigateur peut aussi utiliser Tickle
          directement sur cette page.
        </p>
      </section>

      {matchMedia("(hover: hover)").matches && (
        <section className="card pad">
          <h2>Raccourcis clavier</h2>
          <dl className="shortcuts">
            {SHORTCUTS.map(([keys, what]) => (
              <div key={keys}>
                <dt>
                  <kbd>{keys}</kbd>
                </dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <InstallHint />
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ["N", "Nouveau rappel"],
  ["↑ ↓", "Passer d’un rappel à l’autre"],
  ["Espace", "Cocher ou décocher"],
  ["⌫", "Supprimer (avec «\u00a0Annuler\u00a0»)"],
  ["⌥↑ ⌥↓", "Déplacer dans la liste"],
  ["Échap", "Fermer les détails"],
];

const SUMMARY_TIMES = [
  "06:00",
  "06:30",
  "07:00",
  "07:30",
  "08:00",
  "08:30",
  "09:00",
  "09:30",
  "10:00",
];

/** Opt-in, per device: « 3 rappels aujourd’hui, dont 1 en retard » each morning, at its time. */
function MorningSummary() {
  const [at, setAt] = useState(getSummaryAt);
  const choose = (time: string | null) => {
    setAt(time);
    void setSummaryAt(time);
  };
  return (
    <div className="group summary-setting">
      <label className="switch-row">
        <span className="label">
          <span className="label-text">
            Résumé du matin
            <span className="sublabel">Les rappels du jour et ceux en retard</span>
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={!!at}
          onChange={(e) => choose(e.target.checked ? "08:00" : null)}
        />
      </label>
      {at && (
        <label className="select-row">
          <span className="label">Heure</span>
          <select value={at} onChange={(e) => choose(e.target.value)}>
            {SUMMARY_TIMES.map((time) => (
              <option key={time} value={time}>
                {timeLabel(time)}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
