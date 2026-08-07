self.addEventListener("install", (event) => {
  const cacheName = "clearpath-shell-v1";
  const shell = [
    "/",
    "/air",
    "/report",
    "/community",
    "/offline",
    "/manifest.webmanifest",
  ];
  event.waitUntil(
    caches.open(cacheName).then(async (cache) => {
      await Promise.allSettled(shell.map((url) => cache.add(url)));
      await self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  const activeCache = "clearpath-shell-v1";
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== activeCache)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/"))
    return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches
              .open("clearpath-shell-v1")
              .then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(
          async () =>
            (await caches.match(request)) ||
            (await caches.match("/offline")) ||
            Response.error(),
        ),
    );
    return;
  }

  if (["script", "style", "font", "image"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches
                .open("clearpath-shell-v1")
                .then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "ClearPath", {
      body: payload.body || "มีข้อมูลคุณภาพอากาศใหม่ในพื้นที่ของคุณ",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: payload.tag || "clearpath-alert",
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        const existing = windows.find(
          (client) => client.url === new URL(target, self.location.origin).href,
        );
        return existing ? existing.focus() : clients.openWindow(target);
      }),
  );
});
