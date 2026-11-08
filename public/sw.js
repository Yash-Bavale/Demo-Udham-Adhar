// Udyam Ops OS — Service Worker for local notifications (Final_CRM Part E).
// Receives postMessage from the page (realtime-triggered) and shows OS-level
// notifications, plus focuses/opens the relevant CRM page on click.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "notify") return;
  const { title, body, url, tag } = data.payload || {};
  if (!title) return;
  self.registration.showNotification(title, {
    body: body || "",
    tag: tag || "udyam-notification",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    data: { url: url || "/admin/dashboard" },
    requireInteraction: false,
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/admin/dashboard";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        if (client.url.includes(targetUrl)) {
          return client.focus();
        }
      }
      // Otherwise focus any open client and navigate, or open new.
      const anyClient = allClients[0];
      if (anyClient) {
        await anyClient.focus();
        return anyClient.navigate(targetUrl).catch(() => {});
      }
      return self.clients.openWindow(targetUrl);
    })(),
  );
});
