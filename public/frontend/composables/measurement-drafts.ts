import { reactive, watch } from "vue";
import { session } from "../state";

export interface MeasurementDraft {
  aquariumId: string;
  aquariumName: string;
  when: string;
  note: string;
  values: Record<string, string>;
  suite: string;
  selected: string[];
  timers: Record<string, number>;
  completed: Record<string, number>;
}

// Deliberately scoped to this open app: no private measurement data in web storage.
export const measurementDrafts = reactive<Record<string, MeasurementDraft>>({});
watch(() => session.user?.id, () => {
  for (const id of Object.keys(measurementDrafts)) delete measurementDrafts[id];
}, { flush: "sync" });
