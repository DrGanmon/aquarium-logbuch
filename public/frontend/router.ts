import { ref, computed } from "vue";
import { session, language, toast, errorMessage } from "./state";
import { api, refreshSession } from "./api";
export const hash = ref(location.hash || "#/");
window.addEventListener("hashchange", () => {
  hash.value = location.hash || "#/";
});
export const route = computed(() => {
  const [path = "/", query = ""] = hash.value.slice(1).split("?");
  return {
    path,
    query: new URLSearchParams(query),
    aquariumId: decodeURIComponent(path.split("/")[2] || ""),
  };
});
export async function initialize() {
  try {
    await refreshSession();
  } catch {
    session.user = null;
  } finally {
    session.ready = true;
  }
  if ("serviceWorker" in navigator)
    void navigator.serviceWorker.register("sw.js").catch(() => {});
}
export async function toggleLanguage() {
  language.value = language.value === "de" ? "en" : "de";
  if (session.user) {
    try {
      await api("/me", { method: "PUT", body: { language: language.value } });
      session.config = await api("/config");
    } catch (error) {
      toast(errorMessage(error));
    }
  }
}
export async function logout() {
  try {
    await api("/logout", { method: "POST" });
    session.user = null;
    session.config = null;
    location.hash = "#/";
  } catch (error) {
    toast(errorMessage(error));
  }
}
