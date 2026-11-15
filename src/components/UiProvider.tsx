import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { copyText } from "../lib/clipboard";

type SheetRenderer = (close: () => void) => ReactNode;

interface Ui {
  toast: (message: string, undo?: () => void) => void;
  copy: (text: string) => Promise<void>;
  /** Shows one bottom sheet at a time, replacing any open one. */
  openSheet: (render: SheetRenderer) => void;
}

const UiContext = createContext<Ui | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<{ text: string; undo?: () => void } | null>(null);
  const [visible, setVisible] = useState(false);
  const timer = useRef<number>(undefined);
  const [sheet, setSheet] = useState<SheetRenderer | null>(null);

  const toast = useCallback((text: string, undo?: () => void) => {
    setMessage({ text, undo });
    setVisible(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisible(false), undo ? 4000 : 2200);
  }, []);

  const closeSheet = useCallback(() => setSheet(null), []);

  const ui = useMemo<Ui>(
    () => ({
      toast,
      copy: async (text) => toast((await copyText(text)) ? "Copié" : "Copie impossible ici"),
      // Wrapped so React stores the renderer instead of calling it as a state updater.
      openSheet: (render) => setSheet(() => render),
    }),
    [toast],
  );

  return (
    <UiContext.Provider value={ui}>
      {children}
      {sheet?.(closeSheet)}
      <div className={`toast${visible ? " on" : ""}`} role="status" aria-live="polite">
        <span>{message?.text}</span>
        {message?.undo && (
          <button
            onClick={() => {
              message.undo?.();
              setVisible(false);
            }}
          >
            Annuler
          </button>
        )}
      </div>
    </UiContext.Provider>
  );
}

export function useUi(): Ui {
  const ui = useContext(UiContext);
  if (!ui) throw new Error("useUi must be used inside <UiProvider>");
  return ui;
}
