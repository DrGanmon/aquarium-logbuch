import { reactive, ref, computed, watch, shallowReactive } from "vue";
import type { AppConfig, User, Theme, Language } from "./types";
import de from "../locales/de.json";
import en from "../locales/en.json";
export const session = reactive<{
  user: User | null;
  config: AppConfig | null;
  ready: boolean;
  setupRequired: boolean;
}>({ user: null, config: null, ready: false, setupRequired: false });
export const language = ref<Language>(
  localStorage.getItem("aquarium_lang") === "en" ? "en" : "de",
);
const savedTheme = localStorage.getItem("aquarium_theme");
export const theme = ref<Theme>(
  savedTheme === "light" || savedTheme === "dark" ? savedTheme : "system",
);
const media = matchMedia("(prefers-color-scheme: dark)");
const systemDark = ref(media.matches);
media.addEventListener("change", (event) => {
  systemDark.value = event.matches;
});
export const dark = computed(
  () =>
    theme.value === "dark" || (theme.value === "system" && systemDark.value),
);
export const themeIcon = computed(
  () => ({ system: "🌓", dark: "🌙", light: "☀️" })[theme.value],
);
export function toggleTheme() {
  theme.value =
    theme.value === "system"
      ? "dark"
      : theme.value === "dark"
        ? "light"
        : "system";
}
function lookup(dict: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      dict,
    );
}
type Messages = Record<string, unknown>;
/** Texts of lazily loaded areas stay out of the startup bundle and register when their chunk loads. */
const lazyMessages = shallowReactive<{ de: Messages; en: Messages }>({ de: {}, en: {} });
export function registerMessages(messages: { de: Messages; en: Messages }) {
  lazyMessages.de = { ...lazyMessages.de, ...messages.de };
  lazyMessages.en = { ...lazyMessages.en, ...messages.en };
}
export function t(key: string, params: Record<string, unknown> = {}): string {
  const english = language.value === "en";
  const value =
    lookup(english ? en : de, key) ?? lookup(english ? lazyMessages.en : lazyMessages.de, key) ??
    lookup(de, key) ?? lookup(lazyMessages.de, key) ?? key;
  return String(value).replace(/\{\{?(\w+)\}?\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]),
  );
}
watch(
  language,
  (value) => {
    localStorage.setItem("aquarium_lang", value);
    document.documentElement.lang = value;
    document.title = t("common.appName");
  },
  { immediate: true },
);
watch(
  [theme, dark],
  () => {
    localStorage.setItem("aquarium_theme", theme.value);
    document.documentElement.dataset.theme = dark.value ? "dark" : "light";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", dark.value ? "#0f172a" : "#12343b");
  },
  { immediate: true },
);
export const notification = ref("");
/** Optional action of the current toast, e.g. "Undo" for a delayed deletion. */
export const notificationAction = ref<{ label: string; run: () => void } | null>(null);
let toastTimer: ReturnType<typeof setTimeout>;
export function toast(message: string, action?: { label: string; run: () => void }, duration = 4000) {
  notification.value = message;
  notificationAction.value = action || null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    notification.value = "";
    notificationAction.value = null;
  }, duration);
}
export function dismissToast() {
  clearTimeout(toastTimer);
  notification.value = "";
  notificationAction.value = null;
}
/**
 * Removes something immediately in the interface and only commits it after the undo period.
 * Pending deletions are committed right away when the page is hidden so nothing is lost silently.
 */
const pendingUndo = new Set<() => Promise<void>>();
export function undoable(message: string, options: { hide: () => void; restore: () => void; commit: () => Promise<void>; delay?: number }) {
  let done = false;
  const commit = async () => {
    if (done) return;
    done = true;pendingUndo.delete(commit);clearTimeout(timer);
    try { await options.commit(); }
    catch (error) { options.restore();toast(errorMessage(error)); }
  };
  const delay = options.delay ?? 8000;
  const timer = setTimeout(() => void commit(), delay);
  pendingUndo.add(commit);
  options.hide();
  toast(message, { label: t("common.undo"), run: () => {
    if (done) return;
    done = true;pendingUndo.delete(commit);clearTimeout(timer);options.restore();dismissToast();
  } }, delay);
}
function flushUndo() { for (const commit of [...pendingUndo]) void commit(); }
addEventListener("pagehide", flushUndo);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushUndo(); });
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
const locale = () => (language.value === "de" ? "de-DE" : "en-GB");
const DAY = 86400000;
function parseDate(value: string | number | Date) {
  // Pure calendar days are interpreted at noon so time zones never shift the day.
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
}
/** Single date/time format of the app: 08.11.2026, 14:30 (de) or 08/11/2026, 14:30 (en). */
export function fmtDate(value?: string | number | Date | null) {
  if (value == null || value === "") return "–";
  const date = parseDate(value);
  return Number.isNaN(date.getTime()) ? "–" : date.toLocaleString(locale(), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
/** Date without time in the same format, optionally with weekday. */
export function fmtDay(value?: string | number | Date | null, weekday = false) {
  if (value == null || value === "") return "–";
  const date = parseDate(value);
  return Number.isNaN(date.getTime()) ? "–" : date.toLocaleDateString(locale(), { ...(weekday ? { weekday: "short" as const } : {}), day: "2-digit", month: "2-digit", year: "numeric" });
}
/** Relative wording ("today", "in 3 days") for dates within a week, otherwise the regular day format. */
export function fmtRelative(value?: string | number | Date | null) {
  if (value == null || value === "") return "–";
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return "–";
  const start = (input: Date) => new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime();
  const days = Math.round((start(date) - start(new Date())) / DAY);
  if (Math.abs(days) > 7) return fmtDay(date);
  return new Intl.RelativeTimeFormat(locale(), { numeric: "auto" }).format(days, "day");
}
export function fmtNum(value: number | undefined, decimals = 2) {
  return value == null
    ? "–"
    : value.toLocaleString(locale(), {
        maximumFractionDigits: decimals,
      });
}
export function localDateTime() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
