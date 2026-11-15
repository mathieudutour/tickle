import agents from "../assets/art/agents.webp";
import alerts from "../assets/art/alerts.webp";
import allDone from "../assets/art/all-done.webp";
import emptyList from "../assets/art/empty-list.webp";
import noResults from "../assets/art/no-results.webp";
import sharing from "../assets/art/sharing.webp";

// Illustrations exported by scripts/art.sh from the originals in art-sources/.
const ART = {
  agents,
  alerts,
  "all-done": allDone,
  "empty-list": emptyList,
  "no-results": noResults,
  sharing,
};

/** A decorative illustration: empty states and the settings cards. */
export function Art({ name, small }: { name: keyof typeof ART; small?: boolean }) {
  return <img className={`art${small ? " small" : ""}`} src={ART[name]} alt="" decoding="async" />;
}

/** An empty screen: an illustration over a short message. */
export function EmptyState({
  art,
  children,
}: {
  art: keyof typeof ART;
  children: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <Art name={art} />
      <p className="empty-note">{children}</p>
    </div>
  );
}
