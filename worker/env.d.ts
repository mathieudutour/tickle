interface Env {
  SPACE: DurableObjectNamespace<import("./space").Space>;
  KEYS: DurableObjectNamespace<import("./space").Keys>;
  ASSETS: Fetcher;
}
