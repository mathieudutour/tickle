import { useState } from "react";
import { setMeId, useMe } from "../lib/me";
import { newId } from "../lib/views";
import { COLORS, type Member } from "../shared/space";
import { useStore } from "../store/StoreProvider";
import { Sheet, SheetHeader } from "./Sheet";
import { useUi } from "./UiProvider";

/** A member's initial on their colour, as Reminders shows who a reminder is assigned to. */
export function Avatar({ member, size = "small" }: { member: Member; size?: "small" | "large" }) {
  return (
    <span
      className={`avatar ${size}`}
      style={{ background: `var(--c-${member.color})` }}
      role="img"
      aria-label={`Assigné à ${member.name}`}
      title={member.name}
    >
      {[...member.name][0]!.toUpperCase()}
    </span>
  );
}

/** Adds someone to the space; `isMe` also makes them this device's member. */
export function PersonSheet({
  onClose,
  onAdded,
  isMe: meByDefault,
}: {
  onClose: () => void;
  onAdded?: (member: Member) => void;
  isMe?: boolean;
}) {
  const { space, dispatch } = useStore();
  const me = useMe(space);
  const [name, setName] = useState("");
  const [isMe, setIsMe] = useState(meByDefault ?? !me);

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Each person gets a colour nobody has yet, so avatars tell people apart.
    const used = new Set(space.members.map((m) => m.color));
    const color =
      COLORS.find((c) => c !== "gray" && !used.has(c)) ??
      COLORS[space.members.length % COLORS.length]!;
    const member: Member = { id: newId(), name: trimmed, color };
    dispatch({ type: "addMember", member });
    if (isMe) setMeId(member.id);
    onClose();
    onAdded?.(member);
  };

  return (
    <Sheet onClose={onClose} labelledBy="person-title">
      <form
        className="in"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <SheetHeader
          id="person-title"
          title="Ajouter une personne"
          onClose={onClose}
          closeLabel="Annuler"
        />
        <input
          className="field title-field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Prénom"
          aria-label="Prénom"
          maxLength={40}
          autoComplete="given-name"
          data-autofocus
        />
        <div className="group">
          <label className="switch-row">
            <span className="label">C’est moi, sur cet appareil</span>
            <input
              type="checkbox"
              role="switch"
              checked={isMe}
              onChange={(e) => setIsMe(e.target.checked)}
            />
          </label>
        </div>
        <p className="note">
          Les rappels assignés à quelqu’un d’autre n’apparaissent pas dans ton « Aujourd’hui », et
          leurs alertes ne sonnent que chez cette personne.
        </p>
        <button className="cta" disabled={!name.trim()}>
          Ajouter
        </button>
      </form>
    </Sheet>
  );
}

/** « Qui es-tu ? »: which member this device belongs to. */
export function WhoAmISheet({ onClose }: { onClose: () => void }) {
  const { space } = useStore();
  const me = useMe(space);
  const { openSheet } = useUi();
  return (
    <Sheet onClose={onClose} labelledBy="who-title">
      <div className="in menu">
        <SheetHeader id="who-title" title="Qui es-tu ?" onClose={onClose} />
        <p className="note">
          Sur cet appareil, « Aujourd’hui » ne montrera que tes rappels et ceux de personne.
        </p>
        {space.members.map((member) => (
          <button
            key={member.id}
            className="menu-item"
            onClick={() => {
              setMeId(member.id);
              onClose();
            }}
          >
            <Avatar member={member} size="large" />
            <span className="name">{member.name}</span>
            {me?.id === member.id && <span className="check-mark">✓</span>}
          </button>
        ))}
        <button
          className="menu-item"
          onClick={() => openSheet((close) => <PersonSheet onClose={close} isMe />)}
        >
          <span className="avatar large add" aria-hidden="true">
            +
          </span>
          Quelqu’un d’autre…
        </button>
      </div>
    </Sheet>
  );
}

/** The « Personnes » card in Réglages: who's in the space, and who this device is. */
export function PeopleSettings() {
  const { space, dispatch } = useStore();
  const me = useMe(space);
  const { openSheet, toast } = useUi();
  const [removing, setRemoving] = useState<string | null>(null);

  return (
    <>
      <p className="note spaced-bottom">
        Assigne un rappel à quelqu’un : il n’apparaît que dans son « Aujourd’hui », et seule cette
        personne reçoit l’alerte.
      </p>
      {space.members.map((member) => (
        <div className="pick" key={member.id}>
          <Avatar member={member} size="large" />
          <input
            className="field person-name"
            defaultValue={member.name}
            key={member.name}
            aria-label={`Nom de ${member.name}`}
            maxLength={40}
            onBlur={(e) =>
              e.target.value.trim() &&
              e.target.value.trim() !== member.name &&
              dispatch({ type: "renameMember", id: member.id, name: e.target.value.trim() })
            }
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          {me?.id === member.id ? (
            <span className="me-badge">Moi</span>
          ) : (
            <button className="pill" onClick={() => setMeId(member.id)}>
              C’est moi
            </button>
          )}
          <button
            className={`pill${removing === member.id ? " on" : ""}`}
            aria-label={`Retirer ${member.name}`}
            onBlur={() => setRemoving(null)}
            onClick={() => {
              if (removing !== member.id) return setRemoving(member.id);
              dispatch({ type: "removeMember", id: member.id });
              if (me?.id === member.id) setMeId(null);
              toast(`${member.name} retiré·e : ses rappels ne sont plus assignés`);
            }}
          >
            {removing === member.id ? "Sûr ?" : "✕"}
          </button>
        </div>
      ))}
      <button
        className="cta ghost"
        onClick={() => openSheet((close) => <PersonSheet onClose={close} />)}
      >
        Ajouter une personne
      </button>
    </>
  );
}

/** Asks once members exist and this device hasn't said who it is. */
export function WhoAmIBanner() {
  const { openSheet } = useUi();
  return (
    <button
      className="who-banner"
      onClick={() => openSheet((close) => <WhoAmISheet onClose={close} />)}
    >
      <span>
        <b>Qui es-tu ?</b> Choisis ton nom pour ne voir que tes rappels dans « Aujourd’hui ».
      </span>
      <span className="pill">Choisir</span>
    </button>
  );
}
