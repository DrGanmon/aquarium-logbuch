<script setup lang="ts">
import {
  computed,
  onMounted,
  onBeforeUnmount,
  reactive,
  ref,
  watch,
  toRefs,
} from "vue";
import Modal from "../components/Modal.vue";
import { measurementDrafts } from "../composables/measurement-drafts";
import { route } from "../router";
import TestSelection from "../components/TestSelection.vue";
import { initialTestSelection, resolveTests } from "../composables/test-selection";
import { enqueueMeasurement } from "../offline-sync";
import { api } from "../api";
import { session, t, errorMessage, localDateTime, toast } from "../state";
import type { AquariumDetail } from "../types";
import { evaluate, parseNumber, mmss } from "../composables/values";
import { enableNotifications, beep } from "../composables/media";
const props = defineProps<{ id: string }>();
const detail = ref<AquariumDetail>();
const error = ref("");
const busy = ref(false);
const existing = measurementDrafts[props.id];
const resumePrompt = ref(Boolean(existing) && route.value.query.get("resume") !== "1");
watch(() => route.value.query.get("resume"), value => {
  if (value === "1") resumePrompt.value = false;
});
const draft = existing || reactive({
  aquariumId: props.id,
  aquariumName: "",
  when: localDateTime(),
  note: "",
  values: {} as Record<string, string>,
  suite: session.config?.userPreferences.selectedSuite || session.config?.currentSuite.id || "",
  selected: initialTestSelection(session.config),
  timers: {} as Record<string, number>,
  completed: {} as Record<string, number>,
});
const { when, note, values, suite, selected, timers } = toRefs(draft);
const tests = computed(() => resolveTests(session.config?.suites || [], selected.value));
const visibleTests = tests;
const now = ref(Date.now());
const completed = draft.completed;
const lifecycle = new AbortController();
let disposed = false;
let wakePending = false;
let interval: ReturnType<typeof setInterval> | undefined;
let wake: WakeLockSentinel | null = null;
const activeTimers = computed(() =>
  Object.keys(timers.value).map((key) => ({
    key,
    test: tests.value.find((p) => p.key === key),
    remaining: Math.max(0, Math.ceil((timers.value[key]! - now.value) / 1000)),
  })),
);
const running = computed(() =>
  activeTimers.value.some((timer) => timer.remaining > 0),
);
watch(selected, (next, previous) => {
  for (const reference of previous) {
    if (next.includes(reference)) continue;
    const key = reference.slice(reference.indexOf(":") + 1);
    reset(key);
    delete values.value[key];
  }
}, { flush: "sync" });
let preferenceSave = Promise.resolve<unknown>(undefined);
watch(
  [selected, suite],
  async () => {
    localStorage.setItem(
      `tests:${session.user?.id}`,
      JSON.stringify(selected.value),
    );
    if (session.config)
      session.config.userPreferences = {
        selectedSuite: suite.value,
        selectedTests: [...selected.value],
      };
    try {
      const body = { selectedSuite: suite.value, selectedTests: [...selected.value] };
      preferenceSave = preferenceSave.catch(() => {}).then(() => api("/me/tests", { method: "PUT", body }));
      await preferenceSave;
    } catch (e) {
      error.value = errorMessage(e);
    }
  },
  { deep: true },
);
watch(running, updateWake);
async function updateWake() {
  try {
    if (disposed) return;
    if (running.value && !wake && !wakePending && navigator.wakeLock) {
      wakePending = true;
      const acquired = await navigator.wakeLock.request("screen");
      if (disposed || !running.value) { await acquired.release(); return; }
      wake = acquired;
      acquired.addEventListener("release", () => {
        if (wake === acquired) wake = null;
      });
    } else if (!running.value && wake) {
      await wake.release();
      wake = null;
    }
  } catch {
    /* Wake lock may be unavailable or denied. */
  } finally { wakePending = false; }
}
function visibility() {
  if (document.visibilityState === "visible") void updateWake();
}
onMounted(async () => {
  try {
    detail.value = await api(`/aquariums/${props.id}?summary=true`, { signal: lifecycle.signal });
    if (disposed) return;
    if (detail.value?.role === "view") {
      location.hash = `#/a/${props.id}`;
      return;
    }
    draft.aquariumName = detail.value!.aquarium.name;
    measurementDrafts[props.id] = draft;
    await updateWake();
  } catch (e) {
    error.value = errorMessage(e);
  }
  if (disposed) return;
  interval = setInterval(() => {
    now.value = Date.now();
    for (const timer of activeTimers.value)
      if (timer.remaining === 0 && completed[timer.key] !== timers.value[timer.key]) {
        completed[timer.key] = timers.value[timer.key]!;
        try {
          beep();
        } catch {
          /* Audio may require user interaction. */
        }
        toast(`${timer.test?.name}: ${t("measure.timerDone")}`);
      }
  }, 250);
  document.addEventListener("visibilitychange", visibility);
});
onBeforeUnmount(() => {
  disposed = true;
  lifecycle.abort();
  clearInterval(interval);
  document.removeEventListener("visibilitychange", visibility);
  void wake?.release().catch(() => {});
});
function focusTest(key: string) {
  document.getElementById("in-" + key)?.focus();
}
async function timerMessage(type: string, key: string, end?: number) {
  const test = tests.value.find((p) => p.key === key);
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker
    .getRegistration()
    .catch(() => undefined);
  registration?.active?.postMessage({
    type,
    timerId: `${props.id}:${key}`,
    testKey: key,
    testName: test?.name,
    aquariumId: props.id,
    aquariumName: detail.value?.aquarium.name,
    waitSec: test?.wait,
    endTime: end,
    url: new URL(`#/a/${props.id}/messen`, document.baseURI).href,
  });
}
function start(key: string, wait: number) {
  const end = Date.now() + wait * 1000;
  timers.value[key] = end;
  delete completed[key];
  timerMessage("SCHEDULE_TIMER", key, end);
}
function reset(key: string) {
  delete timers.value[key];
  delete completed[key];
  timerMessage("CANCEL_TIMER", key);
}

async function notify() {
  try {
    await enableNotifications();
  } catch (e) {
    error.value = errorMessage(e);
  }
}
async function save() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const parsed: Record<string, number> = {};
    for (const test of visibleTests.value) {
      const input = values.value[test.key] || "";
      if (!input.trim()) continue;
      const value = parseNumber(input);
      if (value === null || value < test.min || value > test.max)
        throw new Error(
          `${test.name}: Bitte einen gültigen Wert zwischen ${test.min} und ${test.max} eingeben.`,
        );
      parsed[test.key] = value;
    }
    if (!Object.keys(parsed).length)
      throw new Error("Bitte mindestens einen Messwert eingeben.");
    await enqueueMeasurement(props.id, {
        values: parsed,
        selectedTests: [...selected.value],
        measured_at: new Date(when.value).toISOString(),
        note: note.value,
    });
    Object.keys(timers.value).forEach(reset);
    delete measurementDrafts[props.id];
    toast(t("offline.saved"));
    location.hash = `#/a/${props.id}`;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}

function pause() {
  location.hash = "#/";
}
function discard() {
  if (!window.confirm(t("measure.discardConfirm"))) return;
  Object.keys(timers.value).forEach(reset);
  delete measurementDrafts[props.id];
  location.hash = `#/a/${props.id}`;
}
</script>
<template>
  <div class="stack">
    <Modal v-if="resumePrompt" :title="t('measure.alreadyOpen')" @close="pause">
      <p>{{ t('measure.resumeQuestion', { name: draft.aquariumName }) }}</p>
      <div class="row">
        <button class="btn" @click="resumePrompt = false">{{ t('measure.resume') }}</button>
        <button class="btn ghost" @click="pause">{{ t('common.cancel') }}</button>
      </div>
    </Modal>
    <div>
      <a class="muted" :href="`#/a/${id}`"
        >‹ {{ detail?.aquarium.name || t("common.back") }}</a
      >
      <h1>{{ t("measure.title") }}</h1>
      <p class="muted">{{ t("measure.subtitle") }}</p>
    </div>
    <p v-if="error && !detail" class="error" role="alert">{{ error }}</p>
    <template v-if="detail && detail.role !== 'view' && !resumePrompt">
      <div class="notification-banner info">
        <div>
          <strong>🔔 Timer-Benachrichtigungen</strong>
          <div class="muted">
            Benachrichtigungen bei Ablauf der Reaktionszeit
          </div>
        </div>
        <button class="btn small ghost" @click="notify">Aktivieren</button>
      </div>
      <div
        v-if="activeTimers.length"
        class="multi-timer-dock"
        :class="{
          'has-finished': activeTimers.some((timer) => !timer.remaining),
        }"
      >
        <div class="multi-timer-header">
          <div class="multi-timer-title">
            {{ t("measure.activeTimersTitle", { count: activeTimers.length }) }}
          </div>
          <div class="multi-timer-actions">
            <button
              v-if="activeTimers.some((timer) => !timer.remaining)"
              class="btn small ghost"
              @click="
                activeTimers
                  .filter((timer) => !timer.remaining)
                  .forEach((timer) => reset(timer.key))
              "
            >
              {{ t("measure.clearFinishedTimers") }}</button
            ><button
              class="btn small ghost"
              @click="Object.keys(timers).forEach(reset)"
            >
              {{ t("measure.cancelAllTimers") }}
            </button>
          </div>
        </div>
        <div class="multi-timer-chips">
          <button
            v-for="timer in activeTimers"
            :key="timer.key"
            class="multi-timer-chip"
            :class="timer.remaining ? 'running' : 'done'"
            @click="focusTest(timer.key)"
          >
            <strong>{{ timer.test?.name }}</strong>
            {{
              timer.remaining ? mmss(timer.remaining) : t("measure.timerDone")
            }}
          </button>
        </div>
      </div>
      <form class="stack" @submit.prevent="save">
        <div class="field">
          <label for="when">{{ t("measure.dateTimeLabel") }}</label
          ><input id="when" v-model="when" type="datetime-local" required />
        </div>
        <details>
          <summary style="cursor: pointer; font-weight: 600">
            {{ t("testSelection.title") }}
          </summary>
          <div style="margin-top: 0.8rem">
            <TestSelection v-model="selected" />
          </div>
        </details>
        <div class="tests">
          <div
            v-for="test in visibleTests"
            :key="test.key"
            class="test"
            :class="{ done: timers[test.key] && timers[test.key]! <= now }"
          >
            <div class="tube" :class="{ idle: !test.wait }">
              <div
                class="fill"
                :style="{
                  height: timers[test.key]
                    ? `${Math.min(100, Math.max(0, 100 - ((timers[test.key]! - now) / Math.max(1, test.wait * 1000)) * 100))}%`
                    : '0%',
                }"
              />
            </div>
            <div class="test-head">
              <h3>
                <label
                  :for="`in-${test.key}`"
                  style="margin: 0; font-size: 1rem"
                  >{{ test.name }}</label
                >
              </h3>
              <span
                v-if="values[test.key]"
                class="chip"
                :class="
                  evaluate(
                    detail.thresholds[test.key],
                    parseNumber(values[test.key] || ''),
                  )
                "
                >{{
                  t(
                    "common.status" +
                      ({ ok: "Ok", warn: "Warn", crit: "Crit", none: "Ok" }[
                        evaluate(
                          detail.thresholds[test.key],
                          parseNumber(values[test.key] || ""),
                        )
                      ] || "Ok"),
                  )
                }}</span
              >
            </div>
            <div class="test-body">
              <div v-if="test.wait" class="timer-line">
                <button
                  class="btn small ghost"
                  type="button"
                  @click="start(test.key, test.wait)"
                >
                  {{
                    timers[test.key]
                      ? t("measure.timerRestart")
                      : t("measure.timerStart", { time: mmss(test.wait) })
                  }}</button
                ><button
                  v-if="timers[test.key]"
                  class="btn small ghost"
                  type="button"
                  @click="reset(test.key)"
                >
                  {{ t("measure.timerReset") }}</button
                ><span class="clock">{{
                  timers[test.key]
                    ? mmss(Math.ceil((timers[test.key]! - now) / 1000))
                    : mmss(test.wait)
                }}</span>
              </div>
              <span v-else class="muted">Kein Warten nötig</span>
              <div>
                <input
                  :id="`in-${test.key}`"
                  v-model="values[test.key]"
                  type="text"
                  inputmode="decimal"
                  autocomplete="off"
                  :aria-label="test.name"
                /><span class="muted"> {{ test.unit }}</span>
              </div>
            </div>
            <p v-if="test.hint" class="test-hint muted">{{ test.hint }}</p>
          </div>
        </div>
        <div class="field">
          <label for="measure-note">{{ t("common.notesOptional") }}</label
          ><input
            id="measure-note"
            v-model="note"
            maxlength="500"
            placeholder="z. B. nach Wasserwechsel"
          />
        </div>
        <div class="sticky-save">
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <div class="row">
            <button class="btn" :disabled="busy">
              {{ t("measure.saveBtn") }}</button
            ><button class="btn ghost" type="button" :disabled="busy" @click="pause">{{ t('measure.pause') }}</button>
            <button class="btn ghost" type="button" :disabled="busy" @click="discard">{{ t('measure.discard') }}</button>
          </div>
        </div>
      </form></template
    >
  </div>
</template>
