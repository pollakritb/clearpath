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
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => client.url === new URL(target, self.location.origin).href);
      return existing ? existing.focus() : clients.openWindow(target);
    }),
  );
});
