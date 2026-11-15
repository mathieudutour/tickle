import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { Space, SpaceAction } from "../shared/space";
import { getAppStore, type AppStore, type SyncStatus } from "./store";

interface Store {
  space: Space;
  status: SyncStatus;
  dispatch: (action: SpaceAction) => void;
  /** Sharing: join, leave, invite. */
  sync: AppStore;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const store = getAppStore();
  const space = useSyncExternalStore(store.subscribe, store.getState);
  const status = useSyncExternalStore(store.subscribe, store.getStatus);
  const value = useMemo(() => ({ space, status, dispatch: store.dispatch, sync: store }), [space, status, store]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside <StoreProvider>");
  return store;
}
