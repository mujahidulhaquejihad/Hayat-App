self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open("hayat-v2").then((c) => c.addAll(["/", "/icon.svg"])));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== "hayat-v2").map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request).then((r) => r || caches.match("/")))
  );
});

self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type === "notify") {
    self.registration.showNotification(d.title, {
      body: d.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: d.tag || "hayat",
      renotify: true,
      silent: false,
      requireInteraction: Boolean(d.sticky || d.alarm),
      vibrate: d.alarm || d.sticky
        ? [900, 80, 900, 80, 900, 80, 1400, 120, 900, 80, 900, 200]
        : [180, 80, 180],
      data: { url: d.url || "/", alarm: Boolean(d.alarm || d.sticky) },
      actions: d.alarm || d.sticky
        ? [
            { action: "stop", title: "Stop alarm" },
            { action: "open", title: "Pray now" },
          ]
        : [],
    });
  }
});

self.addEventListener("notificationclick", (e) => {
  const action = e.action;
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        c.postMessage({ type: action === "stop" ? "stop-alarm" : "open-alarm" });
        if (action !== "stop" && "focus" in c) return c.focus();
      }
      if (action === "stop") return;
      return self.clients.openWindow(url);
    })
  );
});
