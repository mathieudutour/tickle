import type { Repeat } from "../shared/space";

// Choices shared by a reminder's details (ReminderSheet) and its inline editor (InlineEditor).

export const REPEATS: [string, string][] = [
  ["", "Jamais"],
  ["daily:1", "Tous les jours"],
  ["weekdays:1", "En semaine"],
  ["weekends:1", "Le week-end"],
  ["weekly:1", "Toutes les semaines"],
  ["weekly:2", "Toutes les 2 semaines"],
  ["monthly:1", "Tous les mois"],
  ["monthly:3", "Tous les 3 mois"],
  ["monthly:6", "Tous les 6 mois"],
  ["yearly:1", "Tous les ans"],
];

/** The repeat select's value for a repeat: frequency and interval. */
export const repeatValue = (repeat?: Repeat) => (repeat ? `${repeat.freq}:${repeat.interval}` : "");

/** A repeat from the select's value; none for « Jamais ». Keeps the end date of the one it replaces. */
export const repeatFrom = (value: string, previous?: Repeat): Repeat | null => {
  const [freq, interval] = value.split(":");
  return freq
    ? ({
        freq,
        interval: Number(interval),
        ...(previous?.until ? { until: previous.until } : {}),
      } as Repeat)
    : null;
};

export const EARLY: [number, string][] = [
  [0, "À l’heure"],
  [5, "5 min avant"],
  [15, "15 min avant"],
  [30, "30 min avant"],
  [60, "1 h avant"],
  [120, "2 h avant"],
  [1440, "La veille"],
  [2880, "2 jours avant"],
  [10080, "1 semaine avant"],
];

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Opens the browser's own picker; a tap on the transparent input over a value does the same on iOS. */
export const showPicker = (event: React.MouseEvent<HTMLInputElement>) => {
  try {
    event.currentTarget.showPicker();
  } catch {
    // Not supported, or already open: the tap itself opens it.
  }
};
