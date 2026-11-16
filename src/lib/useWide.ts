import { useSyncExternalStore } from "react";

/** From this width, the app shows lists, the selected list and a reminder's details side by side (see `.split`). */
export const WIDE = "(min-width: 1024px)";

const query = matchMedia(WIDE);
const subscribe = (onChange: () => void) => {
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

export const useWide = () => useSyncExternalStore(subscribe, () => query.matches);
