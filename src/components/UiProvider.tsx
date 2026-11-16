import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Drawer } from "@base-ui/react/drawer";
import { copyText } from "../lib/clipboard";
import { DetailsPane } from "../lib/detailsPane";
import { SheetPresence } from "./Sheet";

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
  // The sheet stays mounted while it animates out: `open` turns false first, then it's dropped once closed.
  const [sheet, setSheet] = useState<{ render: SheetRenderer; key: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pane = useMemo(() => ({ selectedId, show: setSelectedId }), [selectedId]);

  const toast = useCallback((text: string, undo?: () => void) => {
    setMessage({ text, undo });
    setVisible(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisible(false), undo ? 4000 : 2200);
  }, []);

  const closeSheet = useCallback(() => setOpen(false), []);
  const presence = useMemo(() => ({ open, onClosed: () => setSheet(null) }), [open]);

  const ui = useMemo<Ui>(
    () => ({
      toast,
      copy: async (text) => toast((await copyText(text)) ? "Copié" : "Copie impossible ici"),
      // A new key replays the opening animation when a sheet replaces another.
      openSheet: (render) => {
        // The page shrinks back around what's on screen, not around the top of the document.
        document.documentElement.style.setProperty("--page-scroll", `${scrollY}px`);
        setSheet((current) => ({ render, key: (current?.key ?? 0) + 1 }));
        setOpen(true);
      },
    }),
    [toast],
  );

  return (
    <UiContext.Provider value={ui}>
      <DetailsPane.Provider value={pane}>
        <Drawer.Provider>
          {/* While a sheet is open, the page shrinks back over a dark background, as on iOS. */}
          <Drawer.IndentBackground className="page-indent-background" />
          <Drawer.Indent className="page-indent">
            <div className="page">{children}</div>
          </Drawer.Indent>
          <SheetPresence.Provider value={presence}>
            {sheet && <Fragment key={sheet.key}>{sheet.render(closeSheet)}</Fragment>}
          </SheetPresence.Provider>
        </Drawer.Provider>
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
      </DetailsPane.Provider>
    </UiContext.Provider>
  );
}

export function useUi(): Ui {
  const ui = useContext(UiContext);
  if (!ui) throw new Error("useUi must be used inside <UiProvider>");
  return ui;
}
