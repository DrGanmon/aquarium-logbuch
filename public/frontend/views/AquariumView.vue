<script setup lang="ts">
import { lazyComponent } from "../composables/lazy-component";
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { api } from "../api";
import { session, t, errorMessage, fmtDate, fmtNum, fmtRelative, language, registerMessages, undoable } from "../state";
import { askConfirm } from "../dialog";
import { route } from "../router";
import { isUnsynced } from "../composables/sync-status";
import featuresDe from "../../locales/features.de.json";
import featuresEn from "../../locales/features.en.json";
import type {
  AquariumDetail,
  AquariumPlant,
  Photo,
  Measurement,
  LogEntry,
  Id,
  Stock,
  Pump,
  CareTask,
  Lighting,
} from "../types";
import Modal from "../components/Modal.vue";
import LazySection from "../components/LazySection.vue";
import Icon from "../components/Icon.vue";
import SyncBadge from "../components/SyncBadge.vue";
import { useLazyResource } from "../composables/lazy-resource";
import { useProgressiveList } from "../composables/progressive-list";
import { readImage } from "../composables/media";
const AquariumForm = lazyComponent(() => import("../components/AquariumForm.vue"));
const WaterChart = lazyComponent(() => import("../components/WaterChart.vue"));
const LogForm = lazyComponent(() => import("../components/LogForm.vue"));
const PlantSection = lazyComponent(() => import("../components/PlantSection.vue"));
const StockSection = lazyComponent(() => import("../components/StockSection.vue"));
const FertilizerSection = lazyComponent(() => import("../components/FertilizerSection.vue"));
const CareTaskSection = lazyComponent(() => import("../components/CareTaskSection.vue"));
const LightingSection = lazyComponent(() => import("../components/LightingSection.vue"));
const CsvDialog = lazyComponent(() => import("../components/CsvDialog.vue"));
const ChatDialog = lazyComponent(() => import("../components/ChatDialog.vue"));
const SharingDialog = lazyComponent(() => import("../components/SharingDialog.vue"));
registerMessages({ de: featuresDe, en: featuresEn });
const props = defineProps<{ id: string }>();
// The long detail page is split into tabs; the active tab is kept in the address (#/a/1?tab=log).
const TABS = [
  { id: "overview", icon: "overview", label: "aquariumView.tabOverview" },
  { id: "values", icon: "chart", label: "aquariumView.tabValues" },
  { id: "stock", icon: "fish", label: "aquariumView.tabStock" },
  { id: "tech", icon: "tool", label: "aquariumView.tabTech" },
  { id: "tasks", icon: "tasks", label: "aquariumView.tabTasks" },
  { id: "log", icon: "book", label: "aquariumView.tabLog" },
  { id: "gallery", icon: "camera", label: "aquariumView.tabGallery" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const validTab = (value: string | null | undefined): Tab => (TABS.some((tab) => tab.id === value) ? value as Tab : "overview");
const tab = ref<Tab>(validTab(route.value.query.get("tab")));
watch(() => route.value.query.get("tab"), (value) => { tab.value = validTab(value); });
function selectTab(next: Tab, focus = false) {
  tab.value = next;
  const query = new URLSearchParams(route.value.query);
  if (next === "overview") query.delete("tab"); else query.set("tab", next);
  const suffix = query.toString();
  window.history.replaceState(window.history.state, "", `#/a/${encodeURIComponent(props.id)}${suffix ? `?${suffix}` : ""}`);
  requestAnimationFrame(() => {
    const button = document.getElementById(`aq-tab-${next}`);
    button?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    if (focus) button?.focus();
  });
}
// The tab row scrolls horizontally on small screens: fades and arrow buttons show that more tabs follow.
const tabList = ref<HTMLElement>();
const tabOverflow = ref({ left: false, right: false });
function updateTabOverflow() {
  const element = tabList.value;
  if (!element) return;
  tabOverflow.value = { left: element.scrollLeft > 2, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 2 };
}
function scrollTabs(direction: number) {
  tabList.value?.scrollBy({ left: direction * Math.max(120, tabList.value.clientWidth * 0.6), behavior: "smooth" });
}
let tabResize: ResizeObserver | undefined;
watch(tabList, (element) => {
  tabResize?.disconnect();
  if (!element) return;
  if (typeof ResizeObserver !== "undefined") { tabResize = new ResizeObserver(updateTabOverflow);tabResize.observe(element); }
  document.getElementById(`aq-tab-${tab.value}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  updateTabOverflow();
}, { flush: "post" });
onBeforeUnmount(() => tabResize?.disconnect());
function tabKey(event: KeyboardEvent) {
  const index = TABS.findIndex((item) => item.id === tab.value);
  const target = event.key === "ArrowRight" ? (index + 1) % TABS.length : event.key === "ArrowLeft" ? (index - 1 + TABS.length) % TABS.length
    : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : -1;
  if (target < 0) return;
  event.preventDefault();
  selectTab(TABS[target]!.id, true);
}
const alertCount = computed(() => (detail.value?.alerts.length || 0) + (detail.value?.conflicts.length || 0));
const detail = ref<AquariumDetail>();

const error = ref("");
const loading = ref(true);
const modal = ref("");
const lightbox = ref("");
const logEntry = ref<LogEntry>();
const deleteEntry = ref<{ kind: LogEntry["kind"]; id: Id }>();
const deleteError = ref("");
const deletingEntry = ref(false);
const logType = ref("water_change");
const filter = ref("all");
const more = ref(true);
const moreLoading = ref(false);
const busy = ref(false);
const range = ref(
  localStorage.getItem("aquarium_graph_range") ||
    session.user?.defaultGraphRange ||
    "90",
);
if (range.value === "3650") range.value = "all";
const from = ref(localStorage.getItem("aquarium_graph_custom_from") || "");
const to = ref(localStorage.getItem("aquarium_graph_custom_to") || "");
const photoFile = ref("");
const caption = ref("");
const primary = ref(false);
const editingPhoto = ref<Photo>();
const aquarium = computed(() => detail.value?.aquarium);
const editingAquarium = computed(() => detail.value ? { ...detail.value.aquarium, role: detail.value.role } : undefined);
const readonly = computed(() => detail.value?.role === "view");
const owner = computed(() => detail.value?.role === "owner");
const parameters = computed(() => session.config?.allParameters || []);
const chartParameters = computed(() =>
  parameters.value.filter((p) =>
    measurements.value.some((m) => m.values[p.key] != null),
  ),
);
const hasAI = computed(
  () =>
    session.user?.hasOpenaiKey ||
    session.user?.hasGeminiKey ||
    session.user?.hasClaudeKey,
);
const cycles = computed(() => [
  { name: t("fertilizers.measureCycle"), status: aquarium.value?.measure_cycle_status },
]);
const gallery = useLazyResource<Photo[]>([], (signal) => api(`/aquariums/${props.id}/images`, { signal }));
const history = useLazyResource<Measurement[]>([], (signal) => {
  const query = new URLSearchParams(range.value === "custom" ? { from: from.value, to: to.value } : { days: range.value });
  return api(`/aquariums/${props.id}/measurements?${query}`, { signal });
});
const plantsResource = useLazyResource<AquariumPlant[]>([], signal => api(`/aquariums/${props.id}/plants`, { signal }));
const residents = useLazyResource<Stock[]>([], (signal) => api(`/aquariums/${props.id}/stock`, { signal }));
const pumpsResource = useLazyResource<Pump[]>([], (signal) => api(`/aquariums/${props.id}/fertilizers`, { signal }));
const tasksResource = useLazyResource<CareTask[]>([], (signal) => api(`/aquariums/${props.id}/tasks`, { signal }));
const lightingResource = useLazyResource<Lighting | null>(null, (signal) => api(`/aquariums/${props.id}/lighting`, { signal }));
let paginationController: AbortController | undefined;
const timeline = useLazyResource<LogEntry[]>([], async (signal) => {
  paginationController?.abort();
  const rows = await api<LogEntry[]>(`/aquariums/${props.id}/logs?kind=${filter.value}&limit=25&offset=0`, { signal });
  if (!signal.aborted) more.value = rows.length === 25;
  return rows;
});
const photos = gallery.data;
const measurements = history.data;
const { visible: tableMeasurements, hasMore: hasMoreMeasurements, sentinel: tableSentinel, more: moreMeasurements } =
  useProgressiveList(computed(() => [...measurements.value].reverse()), 50);
const stock = residents.data;
const pumps = pumpsResource.data;
const logs = timeline.data;
const logBusy = computed(() => timeline.loading.value || moreLoading.value);
// The care overview also lists the measuring cycle and manual fertilizers of this aquarium.
const measureCycle = computed(() => aquarium.value?.measure_cycle_interval ? { interval: aquarium.value.measure_cycle_interval, cycle_label: aquarium.value.measure_cycle_status?.cycle_label,
  next_due_at: aquarium.value.measure_cycle_status?.next_due_at, last_action_at: aquarium.value.measure_cycle_status?.last_action_at } : null);
function showFertilizers() {
  selectTab("tech");
  requestAnimationFrame(() => document.querySelector('[data-lazy="pumpsResource"]')?.scrollIntoView({ behavior: "smooth", block: "start" }));
}
const resources = [gallery, history, residents, plantsResource, lightingResource, pumpsResource, tasksResource, timeline];
let detailController: AbortController | undefined;
onBeforeUnmount(() => { detailController?.abort(); paginationController?.abort(); });
onMounted(() => {
  void load();
  window.addEventListener('aquarium-synchronized', load);
  window.addEventListener('online', load);
  document.addEventListener('visibilitychange', refreshVisible);
});
function refreshVisible() { if (document.visibilityState === 'visible') void load(); }
onBeforeUnmount(() => {
  window.removeEventListener('aquarium-synchronized', load);
  window.removeEventListener('online', load);
  document.removeEventListener('visibilitychange', refreshVisible);
});
watch(language, load);
watch([range, from, to], () => {
  localStorage.setItem("aquarium_graph_range", range.value);
  localStorage.setItem("aquarium_graph_custom_from", from.value);
  localStorage.setItem("aquarium_graph_custom_to", to.value);
  if (history.active.value) void history.load(true);
});
watch(filter, () => { if (timeline.active.value) void timeline.load(true); });
async function load() {
  detailController?.abort();
  const request = new AbortController();
  detailController = request;
  try {
    const result = await api<AquariumDetail>(`/aquariums/${props.id}?summary=true`, { signal: request.signal });
    if (request.signal.aborted) return;
    detail.value = result;
    error.value = "";
    await Promise.all(resources.filter((resource) => resource.active.value).map((resource) => resource.load(true)));
  } catch (e) {
    if (!request.signal.aborted) error.value = errorMessage(e);
  } finally {
    if (detailController === request) loading.value = false;
  }
}
async function loadLogs(reset = false) {
  if (reset) return timeline.load(true);
  if (logBusy.value || !more.value) return;
  const request = new AbortController();
  paginationController?.abort();
  paginationController = request;
  moreLoading.value = true;
  try {
    const rows = await api<LogEntry[]>(`/aquariums/${props.id}/logs?kind=${filter.value}&limit=25&offset=${logs.value.length}`, { signal: request.signal });
    if (request.signal.aborted) return;
    logs.value = [...logs.value, ...rows];
    more.value = rows.length === 25;
    timeline.error.value = "";
  } catch (e) {
    if (!request.signal.aborted) timeline.error.value = errorMessage(e);
  } finally {
    if (paginationController === request) moreLoading.value = false;
  }
}
function openLog(entry?: LogEntry, type = "water_change") {
  logEntry.value = entry;
  logType.value = type;
  modal.value = "log";
}
function photoUrl(photo: Photo) {
  return photo.image_url || `api/aquariums/${props.id}/images/${photo.id}`;
}
async function mutate(path: string, method = "POST", body?: unknown) {
  try {
    await api(`/aquariums/${props.id}${path}`, { method, body });
    await load();
  } catch (e) {
    error.value = errorMessage(e);
  }
}
function deletePhoto(photo: Photo) {
  const index = photos.value.findIndex((item) => item.id === photo.id);
  undoable(t("aquariumView.photoDeleted"), {
    hide: () => { photos.value = photos.value.filter((item) => item.id !== photo.id); },
    restore: () => { if (!photos.value.some((item) => item.id === photo.id)) { const next = [...photos.value];next.splice(Math.max(0, index), 0, photo);photos.value = next; } },
    commit: async () => { await api(`/aquariums/${props.id}/images/${photo.id}`, { method: "DELETE" });await load(); },
  });
}
function requestEntryDeletion(entry: { kind: LogEntry["kind"]; id: Id }) {
  if (readonly.value || deletingEntry.value) return;
  deleteEntry.value = { kind: entry.kind, id: entry.id };
  deleteError.value = "";
}
function cancelEntryDeletion() {
  if (!deletingEntry.value) deleteEntry.value = undefined;
}
async function confirmEntryDeletion() {
  const entry = deleteEntry.value;
  if (!entry || readonly.value || deletingEntry.value) return;
  deletingEntry.value = true;
  deleteError.value = "";
  try {
    const collection = entry.kind === "measurement" ? "measurements" : "maintenance";
    await api(`/aquariums/${props.id}/${collection}/${entry.id}`, { method: "DELETE" });
    logs.value = logs.value.filter((row) => row.kind !== entry.kind || row.id !== entry.id);
    if (entry.kind === "measurement") measurements.value = measurements.value.filter((row) => row.id !== entry.id);
    deleteEntry.value = undefined;
    await load();
  } catch (e) {
    deleteError.value = errorMessage(e);
  } finally {
    deletingEntry.value = false;
  }
}
async function photoChanged(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    photoFile.value = await readImage(file);
  } catch (e) {
    error.value = errorMessage(e);
  }
}
function editCaption(photo: Photo) {
  editingPhoto.value = photo;
  caption.value = photo.caption || "";
  modal.value = "caption";
}
async function savePhoto() {
  if (busy.value) return;
  busy.value = true;
  try {
    await api(
      `/aquariums/${props.id}/images${editingPhoto.value && modal.value === "caption" ? "/" + editingPhoto.value.id : ""}`,
      {
        method: modal.value === "caption" ? "PUT" : "POST",
        body:
          modal.value === "caption"
            ? { caption: caption.value }
            : {
                image: photoFile.value,
                caption: caption.value,
                is_primary: primary.value,
              },
      },
    );
    modal.value = "";
    photoFile.value = "";
    caption.value = "";
    editingPhoto.value = undefined;
    await load();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
async function saved(_id?: Id) {
  modal.value = "";
  await load();
}
async function leave() {
  if (!await askConfirm({ title: t("aquariumView.leaveShareTitle"), message: t("aquariumView.leaveShareText", { name: aquarium.value?.name || "" }), confirmLabel: t("aquariumView.leaveShare") })) return;
  try {
    await api(`/aquariums/${props.id}/shares/${session.user?.id}`, {
      method: "DELETE",
    });
    location.hash = "#/";
  } catch (e) {
    error.value = errorMessage(e);
  }
}
</script>
<template>
  <div class="stack">
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="loading" class="muted">{{ t("common.loading") }}</p>
    <template v-if="detail && aquarium">
      <div class="row between aq-header-actions">
        <div>
          <a href="#/" class="back-link">‹ {{ t("aquariumView.backAll") }}</a>
          <h1 style="margin-bottom: 0.2rem">{{ aquarium.name }}</h1>
          <div v-if="aquarium.motto" class="aq-motto">{{ aquarium.motto }}</div>
          <div class="muted">
            {{ session.config?.waterTypes[aquarium.water_type]
            }}{{ aquarium.volume_l ? ` · ${aquarium.volume_l} l` : ""
            }}{{
              aquarium.last_measured_at
                ? ` · ${t("aquariumView.lastMeasured", { date: fmtDate(aquarium.last_measured_at) })}`
                : ""
            }}
          </div>
          <span v-if="!owner" class="chip none"
            >{{ aquarium.owner_username }} ·
            {{ readonly ? t("aquariumView.readOnly") : t("aquariumView.writeAccess") }}</span
          >
        </div>
        <div class="row">
          <a v-if="!readonly" class="btn" :href="`#/a/${id}/messen`"><Icon name="measure" :size="18" />{{ t("detail.btnMeasure") }}</a>
          <button v-if="!readonly" class="btn ghost" @click="openLog()"><Icon name="book" :size="18" />{{ t("detail.btnLog") }}</button>
          <a class="btn ghost" :href="`#/health?wizard=1&aquariumId=${encodeURIComponent(id)}`"><Icon name="health" :size="18" />{{ t("health.wizard") }}</a>
          <details class="action-menu" data-action-menu>
            <summary class="btn ghost" :aria-label="t('aquariumView.moreActions')"><Icon name="more" :size="18" />{{ t("nav.more") }}</summary>
            <div class="action-menu-items card" @click="($event.currentTarget as HTMLElement).closest('details')?.removeAttribute('open')">
              <button v-if="!readonly" type="button" @click="modal = 'edit'">{{ t("detail.btnEdit") }}</button>
              <button v-if="owner" type="button" @click="modal = 'shares'">{{ t("detail.btnShare") }}</button>
              <button v-if="!readonly" type="button" @click="modal = 'import'">{{ t("aquariumView.csvImport") }}</button>
              <button type="button" @click="modal = 'export'">{{ t("aquariumView.csvExport") }}</button>
              <button v-if="!owner" type="button" class="danger" @click="leave">{{ t("aquariumView.leaveShare") }}</button>
            </div>
          </details>
        </div>
      </div>
      <div class="aq-tabs-wrap" :class="{ 'more-left': tabOverflow.left, 'more-right': tabOverflow.right }">
      <button v-show="tabOverflow.left" type="button" class="aq-tabs-scroll left" tabindex="-1" :aria-label="t('aquariumView.tabsScrollLeft')" @click="scrollTabs(-1)">‹</button>
      <div ref="tabList" class="aq-tabs" role="tablist" :aria-label="t('aquariumView.tabsLabel')" data-aquarium-tabs @keydown="tabKey" @scroll.passive="updateTabOverflow">
        <button
          v-for="item in TABS"
          :id="`aq-tab-${item.id}`"
          :key="item.id"
          type="button"
          role="tab"
          :aria-selected="tab === item.id"
          :aria-controls="`aq-panel-${item.id}`"
          :tabindex="tab === item.id ? 0 : -1"
          @click="selectTab(item.id)"
        >
          <Icon :name="item.icon" :size="18" />{{ t(item.label) }}<span v-if="item.id === 'overview' && alertCount" class="aq-tab-count crit">{{ alertCount }}</span>
        </button>
      </div>
      <button v-show="tabOverflow.right" type="button" class="aq-tabs-scroll right" tabindex="-1" :aria-label="t('aquariumView.tabsScrollRight')" @click="scrollTabs(1)">›</button>
      </div>
      <div :id="`aq-panel-${tab}`" class="stack" role="tabpanel" :aria-labelledby="`aq-tab-${tab}`" tabindex="-1">
      <template v-if="tab === 'overview'">
      <div class="aq-summary" data-aquarium-summary>
        <div><span class="muted">{{ t("aquariumView.summaryLastMeasurement") }}</span><strong :title="aquarium.last_measured_at ? fmtDate(aquarium.last_measured_at) : undefined">{{ aquarium.last_measured_at ? fmtRelative(aquarium.last_measured_at) : t("aquariumView.summaryNever") }}</strong></div>
        <div><span class="muted">{{ t("aquariumView.summaryAlerts") }}</span><strong>{{ alertCount || t("aquariumView.summaryNoAlerts") }}</strong></div>
        <div><span class="muted">{{ t("aquariumView.summaryNextMeasurement") }}</span><strong :title="aquarium.measure_cycle_status?.next_due_at ? fmtDate(aquarium.measure_cycle_status.next_due_at) : undefined">{{ aquarium.measure_cycle_status?.next_due_at ? fmtRelative(aquarium.measure_cycle_status.next_due_at) : t("aquariumView.summaryNotPlanned") }}</strong></div>
      </div>
      <section
        v-if="detail.alerts.length || detail.conflicts.length"
        class="stack"
        :aria-label="t('aquariumView.alertsLabel')"
      >
        <div
          v-for="alert in detail.alerts"
          :key="alert.id"
          class="notice"
          :class="alert.level || alert.severity"
        >
          <div>{{ alert.message }}</div>
          <button
            v-if="!readonly"
            class="btn small ghost"
            @click="mutate('/alerts/ack', 'POST', { ids: [alert.id] })"
          >
            ✓ {{ t("common.confirm") }}
          </button>
        </div>
        <div v-if="detail.conflicts.length" class="compat-box warn">
          {{ t("aquariumView.stockMismatch", { list: detail.conflicts.join(", ") }) }}
        </div>
      </section>
      <div
        v-for="(issue, index) in [
          ...(detail.stockCompatibility?.issues || []),
          ...(detail.stockCompatibility?.conflicts || []),
          ...(detail.stockCompatibility?.warnings || []),
        ]"
        :key="index"
        class="compat-box"
        :class="issue.severity || issue.level || 'warn'"
      >
        {{ issue.message }}
      </div>
      <section>
        <h2 v-if="Object.keys(detail.latest).length">{{ t("aquariumView.currentValues") }}</h2>
        <div v-if="Object.keys(detail.latest).length" class="values">
          <template v-for="parameter in parameters" :key="parameter.key"
            ><div
              v-if="detail.latest[parameter.key]"
              class="value"
              :class="detail.latest[parameter.key]?.status"
            >
              <div class="muted">{{ parameter.name }}</div>
              <div>
                <span class="num">{{
                  fmtNum(
                    detail.latest[parameter.key]?.value,
                    parameter.decimals,
                  )
                }}</span
                ><span class="unit">{{ parameter.unit }}</span>
              </div>
              <span
                class="chip"
                :class="detail.latest[parameter.key]?.status"
                >{{
                  t(
                    "common.status" +
                      (detail.latest[parameter.key]?.status ||
                        "ok")[0]!.toUpperCase() +
                      (detail.latest[parameter.key]?.status || "ok").slice(1),
                  )
                }}</span
              >
              <div class="muted" style="font-size: 0.8rem; margin-top: 0.2rem">
                {{ fmtDate(detail.latest[parameter.key]?.measured_at) }}
              </div>
            </div></template
          >
        </div>
        <div v-else class="card stack">
          <h2>{{ t("aquariumView.noValuesTitle") }}</h2>
          <p>{{ t("aquariumView.noValuesText") }}</p>
          <a v-if="!readonly" class="btn" :href="`#/a/${id}/messen`"
            ><Icon name="measure" :size="18" />{{ t("aquariumView.enterValues") }}</a
          >
        </div>
      </section>
      <section class="card stack">
        <div class="row between">
          <h2 style="margin: 0">{{ t("fertilizers.measureCycle") }}</h2>
          <button
            v-if="!readonly"
            class="btn small ghost"
            @click="modal = 'edit'"
          >
            {{ t("aquariumView.cycleSettings") }}
          </button>
        </div>
        <div class="grid2" style="gap: 1rem">
          <div
            v-for="cycle in cycles"
            :key="cycle.name"
            class="cycle-card stack"
          >
            <div class="row between">
              <strong>{{ cycle.name }}</strong
              ><span
                class="chip"
                :class="
                  !cycle.status?.configured
                    ? 'none'
                    : cycle.status?.is_overdue
                      ? 'crit'
                      : cycle.status?.is_due
                        ? 'warn'
                        : 'ok'
                "
                >{{
                  cycle.status?.status_label || t("detail.cycleDisabled")
                }}</span
              >
            </div>
            <div class="muted">{{ cycle.status?.cycle_label }}</div>
            <div class="muted">
              {{ t("aquariumView.nextDue") }}: {{ fmtDate(cycle.status?.next_due_at) }}
            </div>
            <div v-if="!readonly">
              <a class="btn small" :href="`#/a/${id}/messen`">{{ t('fertilizers.measureNow') }}</a>
            </div>
          </div>
        </div>
      </section>
      <div v-if="aquarium.description" class="aq-desc-box stack">
        <strong>{{ t("aquariumView.about") }}</strong>
        <div style="white-space: pre-wrap">{{ aquarium.description }}</div>
      </div>
      <p v-if="aquarium.notes" class="muted">{{ aquarium.notes }}</p>
      </template>
      <template v-else-if="tab === 'values'">
      <LazySection v-if="Object.keys(detail.latest).length" data-lazy="history" :label="t('detail.historyTitle')" :loaded="history.loaded.value" :loading="history.loading.value" :error="history.error.value" @activate="history.load()">
        <section class="stack">
          <div class="row between">
            <h2 style="margin: 0">{{ t("detail.historyTitle") }}</h2>
            <div class="range-tabs" role="group" :aria-label="t('aquariumView.rangeLabel')">
              <button
                v-for="value in [
                  '7',
                  '14',
                  '30',
                  '90',
                  '180',
                  '365',
                  'all',
                  'custom',
                ]"
                :key="value"
                type="button"
                :aria-pressed="range === value"
                @click="range = value"
              >
                {{
                  t(
                    "common.range" +
                      (value === "all"
                        ? "All"
                        : value === "custom"
                          ? "Custom"
                          : value),
                  )
                }}
              </button>
            </div>
          </div>
          <div v-if="range === 'custom'" class="custom-range-bar">
            <label>{{ t("aquariumView.from") }}<input v-model="from" type="date" /></label
            ><label>{{ t("aquariumView.to") }}<input v-model="to" type="date" /></label>
          </div>
          <div v-if="chartParameters.length" class="charts">
            <WaterChart
              v-for="parameter in chartParameters"
              :key="parameter.key"
              :parameter="parameter"
              :measurements="measurements"
              :range="detail.thresholds[parameter.key]"
            />
          </div>
          <p v-else class="muted">{{ t("aquariumView.noMeasurementsInRange") }}</p>
          <p v-if="chartParameters.length" class="muted">
            {{ t("aquariumView.chartLegend") }}
          </p>
        </section>
      </LazySection>
      <div v-else class="card stack">
        <h2>{{ t("aquariumView.noValuesTitle") }}</h2>
        <p>{{ t("aquariumView.noValuesText") }}</p>
        <a v-if="!readonly" class="btn" :href="`#/a/${id}/messen`"><Icon name="measure" :size="18" />{{ t("aquariumView.enterValues") }}</a>
      </div>
      <LazySection v-if="Object.keys(detail.latest).length" data-lazy="history" :label="t('detail.measurementsTitle')" :loaded="history.loaded.value" :loading="history.loading.value" :error="history.error.value" @activate="history.load()">
        <section class="card stack">
          <h2>{{ t("detail.measurementsTitle") }}</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{{ t("common.date") }}</th>
                  <th v-for="parameter in chartParameters" :key="parameter.key">
                    {{ parameter.name }} ({{ parameter.unit }})
                  </th>
                  <th>{{ t("common.notes") }}</th>
                  <th v-if="!readonly">{{ t("common.actions") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="measurement in tableMeasurements"
                  :key="measurement.id"
                >
                  <td>{{ fmtDate(measurement.measured_at) }} <SyncBadge :show="isUnsynced(measurement.id, `/aquariums/${id}/measurements/${measurement.id}`)" /></td>
                  <td v-for="parameter in chartParameters" :key="parameter.key">
                    {{
                      fmtNum(
                        measurement.values[parameter.key],
                        parameter.decimals,
                      )
                    }}
                  </td>
                  <td>{{ measurement.note }}</td>
                  <td v-if="!readonly">
                    <button
                      type="button"
                      class="btn small ghost danger"
                      :disabled="deletingEntry"
                      @click="requestEntryDeletion({ kind: 'measurement', id: measurement.id })"
                    >
                      {{ t("common.delete") }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="hasMoreMeasurements" ref="tableSentinel" class="row" style="justify-content: center">
            <button class="btn ghost" type="button" @click="moreMeasurements">{{ t('common.loadMore') }}</button>
          </div>
        </section>
      </LazySection>
      </template>
      <template v-else-if="tab === 'stock'">
      <LazySection data-lazy="residents" :label="t('detail.residentsTitle')" :loaded="residents.loaded.value" :loading="residents.loading.value" :error="residents.error.value" @activate="residents.load()">
        <StockSection
          :id="id"
          :stock="stock"
          :readonly="readonly"
          @changed="load"
          @image="(url) => (lightbox = url)"
        />
      </LazySection>
      <LazySection data-lazy="plants" :label="t('nav.plants')" :loaded="plantsResource.loaded.value" :loading="plantsResource.loading.value" :error="plantsResource.error.value" @activate="plantsResource.load()">
        <PlantSection :id="id" :plants="plantsResource.data.value" :readonly="readonly" @changed="plantsResource.load(true)" />
      </LazySection>
      </template>
      <template v-else-if="tab === 'tech'">
      <LazySection data-lazy="lightingResource" :label="t('lighting.title')" :loaded="lightingResource.loaded.value" :loading="lightingResource.loading.value" :error="lightingResource.error.value" @activate="lightingResource.load()">
        <LightingSection :id="id" :lighting="lightingResource.data.value" :readonly="readonly" @changed="lightingResource.load(true)" />
      </LazySection>
      <LazySection data-lazy="pumpsResource" :label="t('detail.pumpsTitle')" :loaded="pumpsResource.loaded.value" :loading="pumpsResource.loading.value" :error="pumpsResource.error.value" @activate="pumpsResource.load()">
        <FertilizerSection
          :id="id"
          :fertilizers="pumps"
          :readonly="readonly"
          @changed="load"
        />
      </LazySection>
      </template>
      <template v-else-if="tab === 'tasks'">
      <LazySection data-lazy="tasksResource" :label="t('careTasks.title')" :loaded="tasksResource.loaded.value" :loading="tasksResource.loading.value" :error="tasksResource.error.value" @activate="tasksResource.load(); pumpsResource.load()">
        <CareTaskSection :id="id" :tasks="tasksResource.data.value" :fertilizers="pumpsResource.data.value" :measure="measureCycle" :readonly="readonly"
          @changed="load" @edit-cycle="modal = 'edit'" @edit-fertilizers="showFertilizers" />
      </LazySection>
      </template>
      <template v-else-if="tab === 'log'">
      <LazySection data-lazy="timeline" :label="t('timeline.title')" :loaded="timeline.loaded.value" :loading="timeline.loading.value" :error="timeline.error.value" @activate="timeline.load()">
        <section class="card stack">
          <div class="row between">
            <h2 style="margin: 0">{{ t("timeline.title") }}</h2>
            <button v-if="!readonly" class="btn small ghost" @click="openLog()">
              {{ t("timeline.newEntryBtn") }}
            </button>
          </div>
          <div class="row">
            <select v-model="filter" :aria-label="t('aquariumView.filterLabel')">
              <option value="all">{{ t("timeline.filterAll") }}</option>
              <option value="measurement">
                {{ t("timeline.filterMeasurements") }}
              </option>
              <option
                v-for="(type, key) in session.config?.maintenanceTypes"
                :key="key"
                :value="key"
              >
                {{ type.icon }} {{ type.label }}
              </option>
            </select>
          </div>
          <div class="timeline">
            <article
              v-for="entry in logs"
              :key="`${entry.kind}-${entry.id}`"
              class="log-item"
              :class="`t-${entry.type}`"
            >
              <div class="log-item-icon" aria-hidden="true">{{ entry.icon }}</div>
              <div class="stack">
                <div class="row between">
                  <strong>{{
                    entry.typeName ||
                    session.config?.maintenanceTypes[entry.type || ""]?.label ||
                    t("aquariumView.waterMeasurement")
                  }}</strong
                  ><span class="muted"><SyncBadge :show="isUnsynced(entry.id, `/aquariums/${id}/${entry.kind === 'measurement' ? 'measurements' : 'maintenance'}/${entry.id}`)" /> {{ fmtDate(entry.timestamp) }}</span>
                </div>
                <div v-if="entry.percentage">💧 {{ entry.percentage }} %</div>
                <p v-if="entry.details">{{ entry.details }}</p>
                <p v-if="entry.note" class="muted">{{ entry.note }}</p>
                <div v-if="entry.values" class="row">
                  <span
                    v-for="(value, key) in entry.values"
                    :key="key"
                    class="chip none"
                    >{{ key }}: {{ fmtNum(value) }}</span
                  >
                </div>
                <div v-if="!readonly" class="row">
                  <button
                    v-if="entry.kind === 'maintenance' && entry.type !== 'dosing_pump'"
                    class="btn small ghost"
                    @click="openLog(entry)"
                  >
                    {{ t("common.edit") }}</button
                  ><button
                    type="button"
                    class="btn small ghost danger"
                    :disabled="deletingEntry"
                    @click="requestEntryDeletion(entry)"
                  >
                    {{ t("common.delete") }}
                  </button>
                </div>
              </div>
            </article>
          </div>
          <button
            v-if="more"
            class="btn ghost"
            :disabled="logBusy"
            @click="loadLogs()"
          >
            {{ t("timeline.loadMore") }}
          </button>
          <p v-if="!logs.length" class="muted">
            {{ t("detail.noMaintenanceYet") }}
          </p>
        </section>
      </LazySection>
      </template>
      <template v-else-if="tab === 'gallery'">
      <LazySection data-lazy="gallery" :label="t('detail.galleryTitle')" :loaded="gallery.loaded.value" :loading="gallery.loading.value" :error="gallery.error.value" @activate="gallery.load()">
        <section class="card stack">
          <div class="row between">
            <h2 style="margin: 0">
              {{ t("detail.galleryTitle") }} ({{ photos.length }})
            </h2>
            <button
              v-if="!readonly"
              class="btn small"
              @click="
                editingPhoto = undefined;
                caption = '';
                modal = 'photo';
              "
            >
              {{ t("detail.uploadPhoto") }}
            </button>
          </div>
          <div v-if="photos.length" class="gallery-grid">
            <div v-for="photo in photos" :key="photo.id" class="gallery-card">
              <div
                class="gallery-img-wrap"
                tabindex="0"
                role="button"
                :aria-label="photo.caption || t('common.imageLightboxTitle')"
                @click="lightbox = photoUrl(photo)"
                @keydown.enter="lightbox = photoUrl(photo)"
              >
                <img v-server-image
                  class="gallery-img"
                  :src="photoUrl(photo)"
                  :alt="photo.caption || aquarium.name"
                  loading="lazy"
                /><span v-if="photo.is_primary" class="gallery-primary-badge"
                  >★ {{ t("aquariumView.coverBadge") }}</span
                >
              </div>
              <div class="gallery-card-body">
                <SyncBadge :show="isUnsynced(photo.id, `/aquariums/${id}/images/${photo.id}`)" />
                <div v-if="photo.caption" class="gallery-caption">
                  {{ photo.caption }}
                </div>
                <div v-if="!readonly" class="gallery-actions">
                  <button
                    v-if="!photo.is_primary"
                    class="btn small ghost"
                    @click="mutate(`/images/${photo.id}/primary`, 'PUT')"
                  >
                    {{ t("detail.setCover") }}</button
                  ><button class="btn small ghost" @click="editCaption(photo)">
                    {{ t("common.edit") }}</button
                  ><button
                    class="btn small ghost danger"
                    @click="deletePhoto(photo)"
                  >
                    {{ t("common.delete") }}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div v-else style="text-align: center; padding: 1.5rem 0">
            <p class="muted">{{ t("aquariumView.noPhotos") }}</p>
            <button
              v-if="!readonly"
              class="btn small ghost"
              @click="
                editingPhoto = undefined;
                caption = '';
                modal = 'photo';
              "
            >
              {{ t("aquariumView.firstPhoto") }}
            </button>
          </div>
        </section>
      </LazySection>
      </template>
      </div>
      <button
        v-if="hasAI"
        class="chat-fab"
        :aria-label="t('aquariumView.openAssistant')"
        @click="modal = 'chat'"
      >
        🤖<span class="chat-fab-badge">{{ t("aquariumView.aiBadge") }}</span>
      </button>
      <AquariumForm
        v-if="modal === 'edit'"
        :aquarium="editingAquarium"
        @close="modal = ''"
        @saved="saved"
      />
      <LogForm
        v-if="modal === 'log'"
        :id="id"
        :entry="logEntry"
        :initial-type="logType"
        @close="modal = ''"
        @saved="saved"
      />
      <CsvDialog
        v-if="modal === 'import' || modal === 'export'"
        :id="id"
        :mode="modal"
        @close="modal = ''"
        @saved="load"
      />
      <SharingDialog v-if="modal === 'shares'" :id="id" @close="modal = ''" />
      <ChatDialog
        v-if="modal === 'chat'"
        :id="id"
        :name="aquarium.name"
        :readonly="readonly"
        @close="modal = ''"
      />
      <Modal
        v-if="modal === 'photo' || modal === 'caption'"
        :title="t('detail.uploadPhoto')"
        @close="modal = ''"
        ><form class="stack" @submit.prevent="savePhoto">
          <label v-if="modal === 'photo'"
            >{{ t("aquariumView.photoFile") }}<input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              required
              @change="photoChanged" /></label
          ><img v-server-image
            v-if="photoFile && modal === 'photo'"
            class="img-preview"
            :src="photoFile"
            :alt="t('aquariumView.preview')"
          /><label
            >{{ t("detail.caption")
            }}<input v-model="caption" maxlength="200" /></label
          ><label v-if="modal === 'photo'" class="row"
            ><input v-model="primary" type="checkbox" />{{
              t("detail.setCover")
            }}</label
          >
          <p v-if="error" class="error">{{ error }}</p>
          <button class="btn" :disabled="busy">{{ t("common.save") }}</button>
        </form></Modal
      >
      <Modal v-if="deleteEntry" :title="t('common.delete')" @close="cancelEntryDeletion">
        <form class="stack" @submit.prevent="confirmEntryDeletion">
          <p>{{ t('timeline.deleteConfirm') }}</p>
          <p v-if="deleteError" class="error" role="alert">{{ deleteError }}</p>
          <div class="row">
            <button type="button" class="btn ghost" :disabled="deletingEntry" @click="cancelEntryDeletion">{{ t('common.cancel') }}</button>
            <button type="submit" class="btn danger" :disabled="deletingEntry">{{ deletingEntry ? t('common.loading') : t('common.delete') }}</button>
          </div>
        </form>
      </Modal>
      <Modal
        v-if="lightbox"
        :title="t('common.imageLightboxTitle')"
        wide
        @close="lightbox = ''"
        ><img v-server-image
          :src="lightbox"
          :alt="aquarium.name"
          style="max-width: 100%; max-height: 80vh; object-fit: contain"
      /></Modal>
    </template>
  </div>
</template>
