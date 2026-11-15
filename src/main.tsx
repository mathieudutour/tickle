import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
// Registered first: browsers offer installation once, early in the page's life.
import "./lib/install";
import { App } from "./App";
import { UiProvider } from "./components/UiProvider";
import { StoreProvider } from "./store/StoreProvider";
import { getAppStore } from "./store/store";
import { registerWebMcp } from "./webmcp/register";
import "./styles.css";

// Offline support, and the service worker that shows the space's alerts (public/push-sw.js).
registerSW({ immediate: true });

// Lets AI agents in the browser use Tickle where WebMCP is supported.
registerWebMcp(getAppStore());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <UiProvider>
        <App />
      </UiProvider>
    </StoreProvider>
  </StrictMode>,
);
