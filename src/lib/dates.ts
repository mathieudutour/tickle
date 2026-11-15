// Dates are local "YYYY-MM-DD" strings and times "HH:MM": a reminder is due on a day, at a time, where you live.

const pad = (n: number) => String(n).padStart(2, "0");

export const toIso = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function fromIso(iso: string): Date {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const date = fromIso(iso);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

/** Same day of the month, clamped to the month's last day (31 Jan + 1 month = 28 or 29 Feb). */
export function addMonths(iso: string, months: number): string {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  const first = new Date(y, m - 1 + months, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return toIso(new Date(first.getFullYear(), first.getMonth(), Math.min(d, last)));
}

export const daysBetween = (from: string, to: string) =>
  Math.round((fromIso(to).getTime() - fromIso(from).getTime()) / 86_400_000);

/** 0 for Monday … 6 for Sunday. */
export const weekday = (iso: string) => (fromIso(iso).getDay() + 6) % 7;

export const isDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
export const isTime = (value: unknown): value is string =>
  typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

// ---------- Time zones (the server alerts at the household's local time) ----------

/** Today's date and the current time where the household lives. */
export function nowIn(timeZone: string, now = new Date()): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/** The instant a local date and time happen in a time zone. */
export function zonedInstant(date: string, time: string, timeZone: string): number {
  const [y = 1970, mo = 1, d = 1] = date.split("-").map(Number);
  const [h = 0, mi = 0] = time.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // The zone's offset at that moment, measured by formatting the guess back; twice to settle around DST changes.
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const seen = nowIn(timeZone, new Date(guess));
    const [sy = 1970, sm = 1, sd = 1] = seen.date.split("-").map(Number);
    const [sh = 0, smi = 0] = seen.time.split(":").map(Number);
    guess += wall - Date.UTC(sy, sm - 1, sd, sh, smi);
  }
  return guess;
}

// ---------- French labels ----------

const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const MONTHS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

/** "Aujourd’hui", "Demain", "Hier", "jeudi" (within a week), "jeu. 4 déc.", "4 déc. 2027". */
export function dayLabel(iso: string, today: string): string {
  const diff = daysBetween(today, iso);
  if (diff === 0) return "Aujourd’hui";
  if (diff === 1) return "Demain";
  if (diff === -1) return "Hier";
  const date = fromIso(iso);
  if (diff > 1 && diff < 7) return DAYS[weekday(iso)]!;
  const short = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === fromIso(today).getFullYear()
    ? `${DAYS[weekday(iso)]!.slice(0, 3)}. ${short}`
    : `${short} ${date.getFullYear()}`;
}

export const timeLabel = (time: string) =>
  time
    .replace(/^0(?=\d)/, "")
    .replace(":", " h ")
    .replace(/ h 00$/, " h");
