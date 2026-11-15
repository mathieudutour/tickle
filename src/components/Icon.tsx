// Line icons drawn after Apple's SF Symbols, so the app reads like iOS instead of a mix of emoji and text glyphs.
// They take the text colour (`currentColor`) and size with the font.

const PATHS = {
  chevronLeft: "M15 4.5 7.5 12l7.5 7.5",
  chevronRight: "M9 4.5 16.5 12 9 19.5",
  ellipsis: "M7 12h.01M12 12h.01M17 12h.01M12 2.75a9.25 9.25 0 1 0 0 18.5 9.25 9.25 0 0 0 0-18.5Z",
  gear: "M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5ZM19.4 13.5l1.6 1.25-1.75 3.03-1.9-.75a7.6 7.6 0 0 1-1.95 1.13L15.1 20.2h-3.5l-.3-2.04a7.6 7.6 0 0 1-1.95-1.13l-1.9.75L5.7 14.75l1.6-1.25a7.7 7.7 0 0 1 0-2.25L5.7 10 7.45 6.97l1.9.75a7.6 7.6 0 0 1 1.95-1.13l.3-2.04h3.5l.3 2.04a7.6 7.6 0 0 1 1.95 1.13l1.9-.75L21 10l-1.6 1.25a7.7 7.7 0 0 1 0 2.25Z",
  calendar:
    "M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-10ZM4 9.5h16M8 3v4M16 3v4",
  clock: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 7.5V12l3 2",
  bell: "M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15L6 16.5ZM10 20.5a2 2 0 0 0 4 0",
  repeat:
    "M4.5 11V9.5A3.5 3.5 0 0 1 8 6h11.5M16.5 3l3 3-3 3M19.5 13v1.5A3.5 3.5 0 0 1 16 18H4.5M7.5 21l-3-3 3-3",
  flag: "M5.5 21V4.5M5.5 4.5h12l-3 4.25 3 4.25h-12Z",
  exclamation: "M12 4.5v10M12 19v.01",
  list: "M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01",
  tag: "M10 3.5 4.5 20.5M19.5 3.5 14 20.5M4 8.5h16.5M3.5 15.5H20",
  section: "M4 6.5h16M4 12h10M4 17.5h10M18 14v6M15 17h6",
  pencil: "M14.5 5.5l4 4M4.5 19.5l1-4.5L16 4.5l3.5 3.5L9 18.5l-4.5 1Z",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 14.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Z",
  eyeSlash:
    "M4 4l16 16M9.9 6A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.7 3.4M6.4 7.6A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4-.9M10 10a2.75 2.75 0 0 0 4 4",
  info: "M12 2.75a9.25 9.25 0 1 0 0 18.5 9.25 9.25 0 0 0 0-18.5ZM12 11v5.5M12 7.5v.01",
  grip: "M4.5 8h15M4.5 12h15M4.5 16h15",
  plus: "M12 5v14M5 12h14",
  link: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1",
} as const;

export type IconName = keyof typeof PATHS;

/** Shapes that read better solid, like the flag (an outline looks like the letter F). */
const FILLED = new Set<IconName>(["flag"]);

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} fill={FILLED.has(name) ? "currentColor" : undefined} />
    </svg>
  );
}

/** A white icon on a coloured rounded square, as at the start of an iOS settings row. */
export function RowIcon({ name, color }: { name: IconName; color: string }) {
  return (
    <span className="row-icon" style={{ background: `var(--c-${color})` }}>
      <Icon name={name} />
    </span>
  );
}
