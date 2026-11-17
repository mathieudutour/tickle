import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { WIDE } from "./useWide";

// The screen lives in the URL hash, so screens can be linked, bookmarked and left with Back.
export type Route =
  | { name: "home" }
  | { name: "list"; id: string }
  | { name: "today" }
  | { name: "tag"; tag: string }
  | { name: "settings" };

export function hrefOf(route: Route): string {
  switch (route.name) {
    case "home":
      return "#";
    case "list":
      return `#liste=${encodeURIComponent(route.id)}`;
    case "today":
      return "#aujourdhui";
    case "tag":
      return `#tag=${encodeURIComponent(route.tag)}`;
    case "settings":
      return "#reglages";
  }
}

export function parseRoute(hash: string): Route {
  const [name, value = ""] = hash.replace(/^#/, "").split("=", 2) as [string, string?];
  const decoded = decodeURIComponent(value);
  if (name === "liste" && decoded) return { name: "list", id: decoded };
  if (name === "tag" && decoded) return { name: "tag", tag: decoded };
  if (name === "reglages") return { name: "settings" };
  if (name === "aujourdhui") return { name: "today" };
  return { name: "home" };
}

// Screens are one level deep: home, and what opens from it.
const depth = (hash: string) => (parseRoute(hash).name === "home" ? 0 : 1);

// iOS animates its own swipe-back in a home-screen app; ours would play on top of it.
let systemAnimated = false;
addEventListener("popstate", (event) => {
  systemAnimated =
    (event as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition === true;
});

/**
 * The current screen. Going into a screen slides it in from the right and going back slides it away, as in a navigation
 * stack (with the View Transitions API, where the browser has it; see `::view-transition` in styles.css).
 */
export function useRoute(): [Route, (route: Route) => void] {
  const [hash, setHash] = useState(location.hash);
  const current = useRef(hash);

  useEffect(() => {
    const onChange = () => {
      const next = location.hash;
      const from = depth(current.current);
      const to = depth(next);
      current.current = next;
      // Side by side on a wide screen, nothing slides: the sidebar stays and the middle changes.
      const skip =
        systemAnimated ||
        from === to ||
        matchMedia(WIDE).matches ||
        matchMedia("(prefers-reduced-motion: reduce)").matches;
      systemAnimated = false;
      if (skip || !document.startViewTransition) return setHash(next);
      document.documentElement.dataset.navigation = to > from ? "push" : "pop";
      const transition = document.startViewTransition(() => flushSync(() => setHash(next)));
      void transition.finished.finally(() => delete document.documentElement.dataset.navigation);
    };
    addEventListener("hashchange", onChange);
    return () => removeEventListener("hashchange", onChange);
  }, []);

  // A new screen starts at the top (before it's painted, so the transition captures it there).
  // In braces: newer Chrome makes scrollTo return a promise, which React would take for a cleanup function.
  useLayoutEffect(() => {
    scrollTo(0, 0);
  }, [hash]);
  const navigate = useCallback((route: Route) => {
    location.hash = hrefOf(route);
  }, []);
  return [parseRoute(hash), navigate];
}

/** Reads a one-time hash like `#rejoindre=…` or `#rappel=…`, and removes it from the URL. */
export function takeHashParam(name: string): string | undefined {
  const match = location.hash.match(new RegExp(`^#${name}=(.+)$`));
  if (!match) return undefined;
  history.replaceState(null, "", location.pathname + location.search);
  return decodeURIComponent(match[1]!);
}
