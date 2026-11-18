import { useMemo, useState } from "react";
import { renderSVG } from "uqr";
import { useStore } from "../store/StoreProvider";
import type { SyncStatus } from "../store/store";
import { Art } from "./Art";
import { useSuggestInstall } from "./InstallHint";
import { Sheet, SheetHeader } from "./Sheet";
import { useUi } from "./UiProvider";

export function statusLabel(status: SyncStatus): string {
  if (!status.key) return "Sur cet appareil seulement · connexion…";
  if (!status.joined) return "Connexion à l’espace partagé…";
  if (status.connection === "online") return status.pending ? "Envoi…" : "Synchronisé";
  if (status.connection === "connecting") return "Connexion…";
  return status.pending
    ? `Hors ligne · ${status.pending} changement${status.pending > 1 ? "s" : ""} en attente`
    : "Hors ligne";
}

/** Invite someone to the space (a link or a QR code), or leave it. */
export function Sharing() {
  const { status, sync } = useStore();
  const { toast, copy, openSheet } = useUi();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const link = sync.inviteLink();
  const qr = useMemo(
    () =>
      link ? renderSVG(link, { border: 1, blackColor: "#1c1c1e", whiteColor: "#ffffff" }) : "",
    [link],
  );

  const share = async () => {
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Tickle",
          text: "Rejoins mes listes sur Tickle :",
          url: link,
        });
        return;
      } catch {
        // Cancelled, or not allowed: fall back to copying.
      }
    }
    await copy(link);
  };

  return (
    <>
      <p
        className={`sync-status ${status.connection}${status.joined ? "" : " joining"}`}
        role="status"
      >
        <i aria-hidden="true" /> {statusLabel(status)}
      </p>
      {link ? (
        <div className="invite">
          <div
            className="qr"
            role="img"
            aria-label="QR code du lien d’invitation"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <div className="invite-text">
            <p className="note">
              Pour partager toutes tes listes avec quelqu’un, fais-lui scanner ce code ou envoie-lui
              le lien. Vous verrez et cocherez les mêmes rappels, en direct.
            </p>
            <button className="cta slim" onClick={share}>
              Envoyer le lien
            </button>
          </div>
        </div>
      ) : (
        <p className="note">Le lien de partage apparaît dès que l’appareil est en ligne.</p>
      )}
      <p className="note spaced">
        Toute personne qui a ce lien voit et modifie tes listes : ne l’envoie qu’à qui tu veux.
      </p>
      <button
        className="cta ghost"
        onClick={() => openSheet((close) => <JoinWithLinkSheet onClose={close} />)}
      >
        Rejoindre avec un lien
      </button>
      {status.key && (
        <button
          className={`cta ghost${confirmLeave ? " danger" : ""}`}
          onClick={() => {
            if (!confirmLeave) return setConfirmLeave(true);
            sync.leave();
            setConfirmLeave(false);
            toast("Tu as quitté l’espace partagé. Cet appareil garde une copie de tes listes.");
          }}
          onBlur={() => setConfirmLeave(false)}
        >
          {confirmLeave
            ? "Sûr ? Les autres ne verront plus tes changements"
            : "Arrêter de partager sur cet appareil"}
        </button>
      )}
    </>
  );
}

/** Asked when opening an invitation link. */
export function JoinSheet({
  joinKey,
  onDone,
}: {
  joinKey: string;
  onDone: (joined: boolean) => void;
}) {
  const { space, sync } = useStore();
  const suggestInstall = useSuggestInstall();
  const count = Object.values(space.reminders).filter((r) => !r.completed).length;
  return (
    <Sheet onClose={() => onDone(false)} labelledBy="join-title">
      <div className="in">
        <SheetHeader
          id="join-title"
          title="Rejoindre des listes partagées"
          onClose={() => onDone(false)}
          closeLabel="Annuler"
        />
        <Art name="sharing" />
        <p>Tu vas partager les listes et les rappels de la personne qui t’a invité·e, en direct.</p>
        <p className="note spaced">
          {count
            ? `Les ${count} rappel${count > 1 ? "s" : ""} enregistré${count > 1 ? "s" : ""} sur cet appareil seront remplacés par les listes partagées.`
            : "Ce qui est enregistré sur cet appareil sera remplacé par les listes partagées."}
        </p>
        <button
          className="cta"
          onClick={() => {
            sync.join(joinKey);
            onDone(true);
            suggestInstall();
          }}
        >
          Rejoindre
        </button>
        <button className="cta ghost" onClick={() => onDone(false)}>
          Pas maintenant
        </button>
      </div>
    </Sheet>
  );
}

/** The space key in an invitation link (…/#rejoindre=KEY), or a key on its own. */
export function keyFromLink(text: string): string | undefined {
  const value = text.trim();
  const key = value.match(/rejoindre=([\w-]+)/)?.[1] ?? value;
  return /^[\w-]{20,}$/.test(key) ? key : undefined;
}

/**
 * Joins from a pasted invitation link. Links open in Safari, never in the app on the home screen, which on iPhone
 * keeps its own storage: this is how that app joins the lists Safari already has.
 */
function JoinWithLinkSheet({ onClose }: { onClose: () => void }) {
  const { space, sync, status } = useStore();
  const { toast } = useUi();
  const [link, setLink] = useState("");
  const key = keyFromLink(link);
  const count = Object.values(space.reminders).filter((r) => !r.completed).length;
  return (
    <Sheet onClose={onClose} labelledBy="join-link-title">
      <form
        className="in"
        onSubmit={(e) => {
          e.preventDefault();
          if (!key) return;
          onClose();
          if (key === status.key) return toast("Tu partages déjà ces listes");
          sync.join(key);
          toast("Bienvenue ! Les listes partagées arrivent…");
        }}
      >
        <SheetHeader
          id="join-link-title"
          title="Rejoindre avec un lien"
          onClose={onClose}
          closeLabel="Annuler"
        />
        <input
          className="field title-field"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Colle le lien d’invitation"
          aria-label="Lien d’invitation"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          data-autofocus
        />
        <p className="note">
          {count
            ? `Les ${count} rappel${count > 1 ? "s" : ""} enregistré${count > 1 ? "s" : ""} sur cet appareil seront remplacés par les listes partagées.`
            : "Ce qui est enregistré sur cet appareil sera remplacé par les listes partagées."}
        </p>
        <button className="cta" disabled={!key}>
          Rejoindre
        </button>
      </form>
    </Sheet>
  );
}
