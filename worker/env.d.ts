interface Env {
  SPACE: DurableObjectNamespace<import("./space").Space>;
  KEYS: DurableObjectNamespace<import("./space").Keys>;
  ASSETS: Fetcher;
  /**
   * Apple Push Notification service, for the iOS app (worker/apns.ts). Secrets set with `wrangler secret put`; without
   * them the iOS app still syncs while open, but gets no alerts.
   */
  APNS_KEY?: string;
  APNS_KEY_ID?: string;
  APNS_TEAM_ID?: string;
  APNS_TOPIC?: string;
}
