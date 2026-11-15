// Quick entry in French, like Reminders: "Appeler maman demain 18h #famille !!" gives the title "Appeler maman", due
// tomorrow at 18:00, tagged "famille", medium priority. Whatever is recognised is removed from the title.

import type { Due, Priority, Repeat } from "../shared/space";
import { addDays, addMonths, daysBetween, fromIso, toIso, weekday } from "./dates";

export interface QuickEntry {
  title: string;
  due?: Due;
  repeat?: Repeat;
  priority: Priority;
  flagged: boolean;
  tags: string[];
}

const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const MONTHS = [
  ["janvier", "janv"],
  ["février", "fevrier", "févr", "fevr", "fév", "fev"],
  ["mars"],
  ["avril", "avr"],
  ["mai"],
  ["juin"],
  ["juillet", "juil"],
  ["août", "aout"],
  ["septembre", "sept"],
  ["octobre", "oct"],
  ["novembre", "nov"],
  ["décembre", "decembre", "déc", "dec"],
];
const MONTH_PATTERN = MONTHS.flat().join("|");
const NUMBER_WORDS: Record<string, number> = {
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  dix: 10,
};
const amount = (word: string) => NUMBER_WORDS[word.toLowerCase()] ?? Number(word);

/** A whole-word, case-insensitive pattern that also works around accented letters. */
const words = (pattern: string) =>
  new RegExp(`(?<![\\p{L}\\d])(?:${pattern})(?![\\p{L}\\d])`, "iu");

/** The next date (today included) falling on a weekday, 0 for Monday. */
const nextWeekday = (today: string, day: number, strictlyAfter = false) => {
  let offset = (day - weekday(today) + 7) % 7;
  if (offset === 0 && strictlyAfter) offset = 7;
  return addDays(today, offset);
};

export function parseQuickEntry(input: string, now: { date: string; time: string }): QuickEntry {
  let rest = ` ${input} `;
  const take = (pattern: RegExp): RegExpMatchArray | null => {
    const match = rest.match(pattern);
    if (match) rest = `${rest.slice(0, match.index)} ${rest.slice(match.index! + match[0].length)}`;
    return match;
  };
  const today = now.date;
  const entry: QuickEntry = { title: "", priority: 0, flagged: false, tags: [] };

  // Tags, priority (! to !!!) and a flag.
  for (let tag = take(/(?<=\s)#([\p{L}\p{N}_-]+)/u); tag; tag = take(/(?<=\s)#([\p{L}\p{N}_-]+)/u))
    entry.tags.push(tag[1]!);
  const bangs = take(/(?<=\s)(!{1,3})(?=\s)/);
  if (bangs) entry.priority = bangs[1]!.length as Priority;
  if (take(/(?<=\s)🚩(?=\s)/u)) entry.flagged = true;

  // Repeats. A weekly repeat on a named day also sets the first date.
  let date: string | undefined;
  let repeat: Repeat | undefined;
  let match: RegExpMatchArray | null;
  if ((match = take(words(`(?:tous les|toutes les|chaque) (${DAYS.join("|")})s?`)))) {
    repeat = { freq: "weekly", interval: 1 };
    date = nextWeekday(today, DAYS.indexOf(match[1]!.toLowerCase()));
  } else if (
    (match = take(
      words(
        "(?:tous|toutes) les (\\d+|deux|trois|quatre|cinq|six) (jours|semaines|mois|ans|années)",
      ),
    ))
  ) {
    const unit = match[2]!.toLowerCase();
    repeat = {
      freq:
        unit === "jours"
          ? "daily"
          : unit === "semaines"
            ? "weekly"
            : unit === "mois"
              ? "monthly"
              : "yearly",
      interval: amount(match[1]!),
    };
  } else if (take(words("en semaine|du lundi au vendredi|les jours de semaine")))
    repeat = { freq: "weekdays", interval: 1 };
  else if (take(words("le week-end|les week-ends|chaque week-end|tous les week-ends")))
    repeat = { freq: "weekends", interval: 1 };
  else if (take(words("tous les jours|chaque jour|quotidiennement")))
    repeat = { freq: "daily", interval: 1 };
  else if (take(words("toutes les semaines|chaque semaine")))
    repeat = { freq: "weekly", interval: 1 };
  else if (take(words("tous les mois|chaque mois"))) repeat = { freq: "monthly", interval: 1 };
  else if (take(words("tous les ans|chaque année|chaque an")))
    repeat = { freq: "yearly", interval: 1 };

  // Times of day, then clock times.
  let time: string | undefined;
  if (
    (match = take(
      words(
        "(ce|demain|après-demain|apres-demain) (matin|après-midi|apres-midi|soir)|cet (après-midi|apres-midi)",
      ),
    ))
  ) {
    const when = (match[1] ?? "").toLowerCase();
    const part = (match[2] ?? match[3] ?? "").toLowerCase();
    time = part === "matin" ? "09:00" : part === "soir" ? "18:00" : "14:00";
    date =
      when === "demain" ? addDays(today, 1) : when.startsWith("apr") ? addDays(today, 2) : today;
  }
  if ((match = take(words("(?:à|a|vers)\\s+midi")))) time = "12:00";
  else if ((match = take(words("(?:(?:à|a|vers)\\s+)?(\\d{1,2})\\s*(?:h|:)\\s*(\\d{2})?")))) {
    const hours = Number(match[1]);
    if (hours < 24) time = `${String(hours).padStart(2, "0")}:${match[2] ?? "00"}`;
  }

  // Days.
  if (!date) {
    if (take(words("aujourd[’']hui|aujourdhui"))) date = today;
    else if (take(words("après-demain|apres-demain"))) date = addDays(today, 2);
    else if (take(words("demain"))) date = addDays(today, 1);
    else if (take(words("avant-hier"))) date = addDays(today, -2);
    else if (take(words("hier"))) date = addDays(today, -1);
    else if (
      (match = take(
        words(
          "dans (\\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|dix) (jours?|semaines?|mois|ans?|années?)",
        ),
      ))
    ) {
      const n = amount(match[1]!);
      const unit = match[2]!.toLowerCase();
      date = unit.startsWith("jour")
        ? addDays(today, n)
        : unit.startsWith("semaine")
          ? addDays(today, 7 * n)
          : unit === "mois"
            ? addMonths(today, n)
            : addMonths(today, 12 * n);
    } else if (take(words("la semaine prochaine"))) date = nextWeekday(today, 0, true);
    else if ((match = take(words(`(?:le |ce )?(${DAYS.join("|")})( prochain)?`)))) {
      date = nextWeekday(today, DAYS.indexOf(match[1]!.toLowerCase()), true);
      if (match[2]) date = addDays(date, daysBetween(today, date) < 7 ? 7 : 0);
    } else if (
      (match = take(words(`(?:le )?(\\d{1,2})(?:er)? (${MONTH_PATTERN})\\.?(?: (\\d{4}))?`)))
    ) {
      const month = MONTHS.findIndex((names) => names.includes(match![2]!.toLowerCase()));
      date = upcoming(today, Number(match[1]), month, match[3] ? Number(match[3]) : undefined);
    } else if ((match = take(words("(?:le )?(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?")))) {
      const year = match[3]
        ? Number(match[3].length === 2 ? `20${match[3]}` : match[3])
        : undefined;
      date = upcoming(today, Number(match[1]), Number(match[2]) - 1, year);
    } else if ((match = take(words("le (\\d{1,2})(?:er)?")))) {
      const day = Number(match[1]);
      const now = fromIso(today);
      date = upcoming(today, day, now.getMonth(), undefined, true);
    }
  }

  // A time without a day is today, or tomorrow once that time has passed; a repeat starts today.
  if (!date && time) date = time > now.time ? today : addDays(today, 1);
  if (!date && repeat)
    date =
      repeat.freq === "weekdays"
        ? nextWeekday(today, weekday(today) > 4 ? 0 : weekday(today))
        : today;
  if (date) entry.due = time ? { date, time } : { date };
  if (repeat && date) entry.repeat = repeat;

  entry.title = rest
    .replace(/\s+/g, " ")
    .replace(/\s+(?:à|a|le|la|pour|de|du|dans|vers|et)\s*$/i, "")
    .trim();
  return entry;
}

/** The next date on that day and month (from today), or in that year. `rollMonth` moves "le 3" to next month once past. */
function upcoming(
  today: string,
  day: number,
  month: number,
  year?: number,
  rollMonth = false,
): string | undefined {
  if (month < 0 || month > 11 || day < 1 || day > 31) return undefined;
  const now = fromIso(today);
  const candidate = (y: number, m: number) => {
    const date = new Date(y, m, day);
    return date.getMonth() === ((m % 12) + 12) % 12 ? toIso(date) : undefined;
  };
  if (year) return candidate(year, month);
  const thisTime = candidate(now.getFullYear(), month);
  if (thisTime && thisTime >= today) return thisTime;
  return rollMonth
    ? candidate(now.getFullYear(), month + 1)
    : candidate(now.getFullYear() + 1, month);
}
