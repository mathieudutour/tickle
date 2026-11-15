// Loaded into the generated service worker (see `importScripts` in vite.config.ts): shows the space's alerts, sent by
// its Durable Object (worker/space.ts), and opens the reminder when one is tapped.

self.addEventListener("push", (event) => {
  let alert = {};
  try {
    alert = event.data ? event.data.json() : {};
  } catch {
    alert = { title: event.data ? event.data.text() : "Tickle" };
  }
  event.waitUntil(
    self.registration.showNotification(alert.title || "Rappel", {
      body: alert.body || "",
      tag: alert.tag,
      icon: "/icon-192.png",
      badge: "/badge-96.png",
      data: { reminderId: alert.reminderId },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const id = event.notification.data && event.notification.data.reminderId;
  const url = new URL(id ? `/#rappel=${encodeURIComponent(id)}` : "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        return open.navigate(url);
      }
      return self.clients.openWindow(url);
    })(),
  );
});
