/// <reference lib="webworker" />
export {};
const scope = self as unknown as ServiceWorkerGlobalScope;
interface Timer {
  type: string;
  timerId: string;
  testKey?: string;
  testName?: string;
  aquariumName?: string;
  waitSec?: number;
  endTime: number;
  url: string;
}
const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();
scope.addEventListener("install", () => {
  void scope.skipWaiting();
});
scope.addEventListener("activate", (event) => {
  event.waitUntil(scope.clients.claim());
});
scope.addEventListener("message", (event: ExtendableMessageEvent) => {
  const data = event.data as Timer;
  if (!data?.type) return;
  if (data.type === "SCHEDULE_TIMER") {
    clearTimeout(activeTimers.get(data.timerId));
    const timeout = setTimeout(
      () => {
        activeTimers.delete(data.timerId);
        const base = new URL("./", scope.location.href);
        void scope.registration
          .showNotification(
            `⏱️ ${data.testName || "Wassertest"}: Wartezeit abgelaufen!`,
            {
              body: `Die Wartezeit für „${data.aquariumName || "Aquarium"}“ ist vorbei. Bitte jetzt ablesen.`,
              icon: new URL("icon-192.png", base).href,
              badge: new URL("favicon-32x32.png", base).href,
              tag: `aquarium-timer-${data.timerId}`,
              requireInteraction: true,
              data: { url: data.url || base.href },
            },
          )
          .catch(() => {});
      },
      Math.max(0, data.endTime - Date.now()),
    );
    activeTimers.set(data.timerId, timeout);
  } else if (data.type === "CANCEL_TIMER") {
    clearTimeout(activeTimers.get(data.timerId));
    activeTimers.delete(data.timerId);
  } else if (data.type === "CLEAR_ALL_TIMERS") {
    for (const timer of activeTimers.values()) clearTimeout(timer);
    activeTimers.clear();
  }
});
scope.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url as string | undefined;
  event.waitUntil(
    (async () => {
      const clients = await scope.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const client = clients.find((client) => client.url === url);
      if (client) {
        await (client as WindowClient).focus();
      } else if (url) {
        await scope.clients.openWindow(url);
      }
    })(),
  );
});
