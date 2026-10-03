// Service worker tối giản cho Web push (SPEC Mục 11.1, P2). Không cache gì khác.
self.addEventListener("push", (event) => {
  let data = { title: "VMG MKT OS", body: "", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* payload không phải JSON — giữ mặc định */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      data: { url: data.url },
      icon: "/next.svg",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(self.clients.openWindow(url));
});
