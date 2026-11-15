import { useState } from "react";
import { newId } from "../lib/views";
import { COLORS, type Color } from "../shared/space";
import { useStore } from "../store/StoreProvider";
import { Sheet, SheetHeader } from "./Sheet";
import { useUi } from "./UiProvider";

const ICONS =
  "📋 ✅ 🛒 🏠 💼 🎓 💊 🏃 🍽️ 🎁 ✈️ 🚗 💡 📚 🎵 🎮 🐶 🌱 🧹 🔧 💰 ❤️ ⭐ 🎉 👶 📞 🖥️ 📦 🧺 🏖️".split(
    " ",
  );

export const COLOR_NAMES: Record<Color, string> = {
  red: "Rouge",
  orange: "Orange",
  yellow: "Jaune",
  green: "Vert",
  teal: "Turquoise",
  blue: "Bleu",
  indigo: "Indigo",
  purple: "Violet",
  pink: "Rose",
  brown: "Marron",
  gray: "Gris",
};

/** Creates a list (no `listId`) or edits one: name, colour, icon, sections; deleting it from here too. */
export function ListEditor({
  listId,
  onClose,
  onCreated,
  onDeleted,
}: {
  listId?: string;
  onClose: () => void;
  onCreated?: (id: string) => void;
  onDeleted?: () => void;
}) {
  const { space, dispatch } = useStore();
  const { toast } = useUi();
  const existing = listId ? space.lists.find((l) => l.id === listId) : undefined;
  const [name, setName] = useState(existing?.name ?? "");
  const [color, setColor] = useState<Color>(existing?.color ?? "blue");
  const [icon, setIcon] = useState(existing?.icon ?? "📋");
  const [section, setSection] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const count = existing
    ? Object.values(space.reminders).filter((r) => r.listId === existing.id).length
    : 0;

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (existing) dispatch({ type: "updateList", id: existing.id, name: trimmed, color, icon });
    else {
      const id = newId();
      dispatch({
        type: "addList",
        list: {
          id,
          name: trimmed,
          color,
          icon,
          order: Math.max(-1, ...space.lists.map((l) => l.order)) + 1,
          sections: [],
        },
      });
      onCreated?.(id);
    }
    onClose();
  };

  return (
    <Sheet onClose={onClose} labelledBy="list-title">
      <form
        className="in list-editor"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        style={{ "--accent": `var(--c-${color})` } as React.CSSProperties}
      >
        <SheetHeader
          id="list-title"
          title={existing ? "Modifier la liste" : "Nouvelle liste"}
          onClose={onClose}
          closeLabel="Annuler"
        />
        <div className="list-badge big" aria-hidden="true">
          {icon}
        </div>
        <input
          className="field title-field center"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom de la liste"
          aria-label="Nom de la liste"
          autoFocus={!existing}
          maxLength={60}
        />

        <div className="swatches" role="radiogroup" aria-label="Couleur">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === color}
              aria-label={COLOR_NAMES[c]}
              className={`swatch${c === color ? " on" : ""}`}
              style={{ background: `var(--c-${c})` }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <div className="icons" role="radiogroup" aria-label="Icône">
          {ICONS.map((i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={i === icon}
              className={`icon-pick${i === icon ? " on" : ""}`}
              onClick={() => setIcon(i)}
            >
              {i}
            </button>
          ))}
        </div>

        {existing && (
          <div className="group">
            <h3 className="group-title">Sections</h3>
            {existing.sections.map((s) => (
              <div className="section-edit" key={s.id}>
                <input
                  className="field"
                  defaultValue={s.name}
                  onBlur={(e) =>
                    e.target.value.trim() &&
                    e.target.value.trim() !== s.name &&
                    dispatch({
                      type: "renameSection",
                      listId: existing.id,
                      id: s.id,
                      name: e.target.value.trim(),
                    })
                  }
                  aria-label={`Nom de la section ${s.name}`}
                />
                <button
                  type="button"
                  className="x"
                  aria-label={`Supprimer la section ${s.name}`}
                  onClick={() => dispatch({ type: "deleteSection", listId: existing.id, id: s.id })}
                >
                  ✕
                </button>
              </div>
            ))}
            <div className="section-edit">
              <input
                className="field"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                placeholder="Nouvelle section"
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (!section.trim()) return;
                  dispatch({
                    type: "addSection",
                    listId: existing.id,
                    section: { id: newId(), name: section.trim(), order: existing.sections.length },
                  });
                  setSection("");
                }}
              />
            </div>
            <p className="note">Les rappels d’une section supprimée restent dans la liste.</p>
          </div>
        )}

        <button className="cta" disabled={!name.trim()}>
          {existing ? "Enregistrer" : "Créer la liste"}
        </button>
        {existing && space.lists.length > 1 && (
          <button
            type="button"
            className={`cta ghost danger-text${confirmDelete ? " danger" : ""}`}
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              dispatch({ type: "deleteList", id: existing.id });
              onClose();
              onDeleted?.();
              toast(`Liste supprimée : ${existing.name}`);
            }}
            onBlur={() => setConfirmDelete(false)}
          >
            {confirmDelete
              ? count
                ? `Supprimer la liste et ses ${count} rappel${count > 1 ? "s" : ""} ?`
                : "Sûr ?"
              : "Supprimer la liste"}
          </button>
        )}
      </form>
    </Sheet>
  );
}
