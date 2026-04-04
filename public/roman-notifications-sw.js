self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target =
    event.notification && event.notification.data && event.notification.data.link
      ? event.notification.data.link
      : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }

      return undefined;
    })
  );
});
