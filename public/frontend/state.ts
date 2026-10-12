import { reactive, ref, computed, watch } from "vue";
import type { AppConfig, User, Theme, Language } from "./types";
import de from "../locales/de.json";
import en from "../locales/en.json";
export const session = reactive<{
  user: User | null;
  config: AppConfig | null;
  ready: boolean;
}>({ user: null, config: null, ready: false });
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
export function t(key: string, params: Record<string, unknown> = {}): string {
  const value =
    lookup(language.value === "en" ? en : de, key) ?? lookup(de, key) ?? key;
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
let toastTimer: ReturnType<typeof setTimeout>;
export function toast(message: string) {
  notification.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    notification.value = "";
  }, 4000);
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
export function fmtDate(value?: string) {
  return value
    ? new Date(value).toLocaleString(
        language.value === "de" ? "de-DE" : "en-GB",
        {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        },
      )
    : "–";
}
export function fmtNum(value: number | undefined, decimals = 2) {
  return value == null
    ? "–"
    : value.toLocaleString(language.value === "de" ? "de-DE" : "en-GB", {
        maximumFractionDigits: decimals,
      });
}
export function localDateTime() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
