import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
}

/** Bottom sheet dialog: closes on Escape or a tap outside, takes focus while open. */
export function Sheet({ onClose, labelledBy, children }: Props) {
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialog}
        className="sheet"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        // A hairline under the header once content scrolls beneath it.
        onScroll={(e) =>
          e.currentTarget.toggleAttribute("data-scrolled", e.currentTarget.scrollTop > 4)
        }
      >
        {children}
      </div>
    </div>
  );
}

/** The sheet's title, with « OK » to close (or « Annuler » for a sheet that creates something). */
export function SheetHeader({
  id,
  title,
  onClose,
  closeLabel = "OK",
}: {
  id: string;
  title: string;
  onClose: () => void;
  closeLabel?: string;
}) {
  return (
    <div className="sheet-head">
      <h2 id={id}>{title}</h2>
      <button
        type="button"
        className={`sheet-close${closeLabel === "OK" ? " strong" : ""}`}
        onClick={onClose}
      >
        {closeLabel}
      </button>
    </div>
  );
}
