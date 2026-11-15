import type { ReactNode } from "react";

/** A screen's top bar: back, large title, and buttons on the right. */
export function Header({
  back,
  title,
  actions,
  accent,
}: {
  back?: () => void;
  title: string;
  actions?: ReactNode;
  accent?: boolean;
}) {
  return (
    <header className="screen-head">
      <div className="bar">
        {back ? (
          <button className="back" onClick={back}>
            ‹ Listes
          </button>
        ) : (
          <span />
        )}
        <div className="actions">{actions}</div>
      </div>
      {title && <h1 className={accent ? "accent" : undefined}>{title}</h1>}
    </header>
  );
}
