// Service worker for ¿Hay Cupo?: shows the push messages the worker sends
// (see packages/notify/src/push.ts for the payload) and opens the link on click.
// No offline caching: the data is only useful live.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data;
  try {
    data = (event.data ? event.data.json() : null) ?? {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" ? data.title : "¿Hay Cupo?";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      // A new seat for the same alert replaces the old notification, but still alerts.
      renotify: typeof data.tag === "string",
      requireInteraction: true,
      icon: "/icon-192.png",
      badge: "/badge-96.png",
      lang: "es-MX",
      data: { url: typeof data.url === "string" ? data.url : "/alertas" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/alertas", self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => client.url === url.href);
      if (open) return open.focus();
      return self.clients.openWindow(url.href);
    })(),
  );
});
