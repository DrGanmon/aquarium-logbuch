import { measurementDrafts } from "./measurement-drafts";
import { route } from "../router";
import { session } from "../state";

export function openMeasurementTest(id: string) {
  if (!measurementDrafts[id] || route.value.path === `/a/${encodeURIComponent(id)}/messen`) return;
  location.hash = `#/a/${encodeURIComponent(id)}/messen?resume=1`;
}

export async function stopMeasurementTimer(id: string, key: string, end: number) {
  const draft = measurementDrafts[id];
  if (!draft || draft.timers[key] !== end) return;
  delete draft.timers[key];
  delete draft.completed[key];
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  registration?.active?.postMessage({ type: "CANCEL_TIMER", timerId: `${id}:${key}` });
}

export function handleMeasurementTimerMessage(event: MessageEvent) {
  const data = event.data;
  if (!data || data.userId !== session.user?.id || !session.user) return;
  const { aquariumId, testKey, endTime } = data;
  if (typeof aquariumId !== "string" || typeof testKey !== "string" || typeof endTime !== "number") return;
  if (measurementDrafts[aquariumId]?.timers[testKey] !== endTime) return;
  if (data.type === "STOP_MEASUREMENT_TIMER") void stopMeasurementTimer(aquariumId, testKey, endTime);
  if (data.type === "OPEN_MEASUREMENT_TIMER") openMeasurementTest(aquariumId);
}
