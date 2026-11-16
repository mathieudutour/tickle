import { createContext } from "react";

/**
 * On a wide screen, the reminder whose details show in the right pane (App.tsx); on a phone, details open in a sheet
 * instead. Provided above the sheets too, so a sheet can show a reminder in the pane.
 */
export const DetailsPane = createContext<{
  selectedId: string | null;
  show: (id: string | null) => void;
}>({
  selectedId: null,
  show: () => {},
});
