import { useCallback, useEffect, useSyncExternalStore } from "react";

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

const subscribe = (onChange: () => void) => {
  addEventListener("hashchange", onChange);
  return () => removeEventListener("hashchange", onChange);
};

export function useRoute(): [Route, (route: Route) => void] {
  const hash = useSyncExternalStore(subscribe, () => location.hash);
  useEffect(() => scrollTo(0, 0), [hash]);
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
