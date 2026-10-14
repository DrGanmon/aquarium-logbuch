<script setup lang="ts">
import { lazyComponent } from "../composables/lazy-component";
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { api } from "../api";
import { session, t, errorMessage, fmtDate, fmtNum, language } from "../state";
import type {
  AquariumDetail,
  AquariumPlant,
  Photo,
  Measurement,
  LogEntry,
  Id,
  Stock,
  Pump,
} from "../types";
import Modal from "../components/Modal.vue";
import LazySection from "../components/LazySection.vue";
import { useLazyResource } from "../composables/lazy-resource";
import { useProgressiveList } from "../composables/progressive-list";
import { readImage } from "../composables/media";
const AquariumForm = lazyComponent(() => import("../components/AquariumForm.vue"));
const WaterChart = lazyComponent(() => import("../components/WaterChart.vue"));
const LogForm = lazyComponent(() => import("../components/LogForm.vue"));
const PlantSection = lazyComponent(() => import("../components/PlantSection.vue"));
const StockSection = lazyComponent(() => import("../components/StockSection.vue"));
const PumpSection = lazyComponent(() => import("../components/PumpSection.vue"));
const CsvDialog = lazyComponent(() => import("../components/CsvDialog.vue"));
const ChatDialog = lazyComponent(() => import("../components/ChatDialog.vue"));
const SharingDialog = lazyComponent(() => import("../components/SharingDialog.vue"));
const props = defineProps<{ id: string }>();
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
  { name: "🧪 Messzyklus", status: aquarium.value?.measure_cycle_status },
  { name: "🌿 Düngzyklus", status: aquarium.value?.fertilize_cycle_status },
]);
const gallery = useLazyResource<Photo[]>([], (signal) => api(`/aquariums/${props.id}/images`, { signal }));
const history = useLazyResource<Measurement[]>([], (signal) => {
  const query = new URLSearchParams(range.value === "custom" ? { from: from.value, to: to.value } : { days: range.value });
  return api(`/aquariums/${props.id}/measurements?${query}`, { signal });
});
const plantsResource = useLazyResource<AquariumPlant[]>([], signal => api(`/aquariums/${props.id}/plants`, { signal }));
const residents = useLazyResource<Stock[]>([], (signal) => api(`/aquariums/${props.id}/stock`, { signal }));
const pumpsResource = useLazyResource<Pump[]>([], (signal) => api(`/aquariums/${props.id}/dosing-pumps`, { signal }));
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
const resources = [gallery, history, residents, plantsResource, pumpsResource, timeline];
let detailController: AbortController | undefined;
onBeforeUnmount(() => { detailController?.abort(); paginationController?.abort(); });
onMounted(load);
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
async function remove(path: string) {
  if (confirm(t("common.delete") + "?")) await mutate(path, "DELETE");
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
  if (!confirm("Freigabe verlassen?")) return;
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
      <div class="row between">
        <div>
          <a :href="'#/'" class="muted">‹ Alle Aquarien</a>
          <h1 style="margin-bottom: 0.2rem">{{ aquarium.name }}</h1>
          <div v-if="aquarium.motto" class="aq-motto">{{ aquarium.motto }}</div>
          <div class="muted">
            {{ session.config?.waterTypes[aquarium.water_type]
            }}{{ aquarium.volume_l ? ` · ${aquarium.volume_l} l` : ""
            }}{{
              aquarium.last_measured_at
                ? ` · zuletzt gemessen ${fmtDate(aquarium.last_measured_at)}`
                : ""
            }}
          </div>
          <span v-if="!owner" class="chip none"
            >{{ aquarium.owner_username }} ·
            {{ readonly ? "Nur Lesezugriff" : "Schreibzugriff" }}</span
          >
        </div>
        <div class="row">
          <a class="btn ghost" :href="`#/health?wizard=1&aquariumId=${encodeURIComponent(id)}`">🩺 {{ t("health.wizard") }}</a>
          <template v-if="!readonly"
            ><a class="btn ghost" :href="`#/a/${id}/messen`">{{
              t("detail.btnMeasure")
            }}</a
            ><button class="btn ghost" @click="openLog()">
              {{ t("detail.btnLog") }}</button
            ><button class="btn ghost" @click="modal = 'import'">
              📥 CSV-Import</button
            ><button v-if="owner" class="btn ghost" @click="modal = 'shares'">
              {{ t("detail.btnShare") }}</button
            ><button class="btn ghost" @click="modal = 'edit'">
              {{ t("detail.btnEdit") }}
            </button></template
          ><button class="btn ghost" @click="modal = 'export'">
            📤 CSV-Export</button
          ><button v-if="!owner" class="btn small ghost danger" @click="leave">
            Freigabe verlassen
          </button>
        </div>
      </div>
      <div v-if="aquarium.description" class="aq-desc-box stack">
        <strong>📖 Über dieses Aquarium</strong>
        <div style="white-space: pre-wrap">{{ aquarium.description }}</div>
      </div>
      <p v-if="aquarium.notes" class="muted">{{ aquarium.notes }}</p>
      <LazySection data-lazy="gallery" :label="t('detail.galleryTitle')" :loaded="gallery.loaded.value" :loading="gallery.loading.value" :error="gallery.error.value" @activate="gallery.load()">
        <section class="card stack">
          <div class="row between">
            <h2 style="margin: 0">
              📸 {{ t("detail.galleryTitle") }} ({{ photos.length }})
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
                <img
                  class="gallery-img"
                  :src="photoUrl(photo)"
                  :alt="photo.caption || aquarium.name"
                  loading="lazy"
                /><span v-if="photo.is_primary" class="gallery-primary-badge"
                  >★ Titelbild</span
                >
              </div>
              <div class="gallery-card-body">
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
                    @click="remove(`/images/${photo.id}`)"
                  >
                    {{ t("common.delete") }}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div v-else style="text-align: center; padding: 1.5rem 0">
            <p class="muted">Noch keine Fotos in der Galerie vorhanden.</p>
            <button
              v-if="!readonly"
              class="btn small ghost"
              @click="
                editingPhoto = undefined;
                caption = '';
                modal = 'photo';
              "
            >
              Erstes Foto hochladen
            </button>
          </div>
        </section>
      </LazySection>
      <section
        v-if="detail.alerts.length || detail.conflicts.length"
        class="stack"
        aria-label="Warnungen"
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
          Besatz passt nicht zusammen: {{ detail.conflicts.join(", ") }}
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
      <section class="card stack">
        <div class="row between">
          <h2 style="margin: 0">📅 Mess- & Düngzyklen</h2>
          <button
            v-if="!readonly"
            class="btn small ghost"
            @click="modal = 'edit'"
          >
            ⚙️ Zyklen einstellen
          </button>
        </div>
        <div class="grid2" style="gap: 1rem">
          <div
            v-for="(cycle, index) in cycles"
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
              Nächste Fälligkeit: {{ fmtDate(cycle.status?.next_due_at) }}
            </div>
            <div v-if="!readonly">
              <a v-if="index === 0" class="btn small" :href="`#/a/${id}/messen`"
                >🧪 Jetzt messen</a
              ><button
                v-else
                class="btn small"
                @click="openLog(undefined, 'fertilize')"
              >
                🌿 Düngung eintragen
              </button>
            </div>
          </div>
        </div>
      </section>
      <section>
        <h2 v-if="Object.keys(detail.latest).length">Aktuelle Werte</h2>
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
          <h2>Noch keine Messwerte</h2>
          <p>
            Trage deine ersten Wasserwerte ein. Danach erscheinen hier Verlauf
            und Warnungen.
          </p>
          <a v-if="!readonly" class="btn" :href="`#/a/${id}/messen`"
            >🧪 Werte eintragen</a
          >
        </div>
      </section>
      <LazySection v-if="Object.keys(detail.latest).length" data-lazy="history" :label="t('detail.historyTitle')" :loaded="history.loaded.value" :loading="history.loading.value" :error="history.error.value" @activate="history.load()">
        <section class="stack">
          <div class="row between">
            <h2 style="margin: 0">Verlauf</h2>
            <div class="range-tabs" role="group" aria-label="Zeitraum">
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
            <label>Von<input v-model="from" type="date" /></label
            ><label>Bis<input v-model="to" type="date" /></label>
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
          <p v-else class="muted">In diesem Zeitraum gibt es keine Messungen.</p>
          <p v-if="chartParameters.length" class="muted">
            Grüner Bereich = Zielbereich, rot gestrichelt = kritische Grenze.
          </p>
        </section>
      </LazySection>
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
      <LazySection data-lazy="pumpsResource" :label="t('detail.pumpsTitle')" :loaded="pumpsResource.loaded.value" :loading="pumpsResource.loading.value" :error="pumpsResource.error.value" @activate="pumpsResource.load()">
        <PumpSection
          :id="id"
          :pumps="pumps"
          :readonly="readonly"
          @changed="load"
        />
      </LazySection>
      <LazySection data-lazy="timeline" :label="t('timeline.title')" :loaded="timeline.loaded.value" :loading="timeline.loading.value" :error="timeline.error.value" @activate="timeline.load()">
        <section class="card stack">
          <div class="row between">
            <h2 style="margin: 0">📖 {{ t("timeline.title") }}</h2>
            <button v-if="!readonly" class="btn small ghost" @click="openLog()">
              {{ t("timeline.newEntryBtn") }}
            </button>
          </div>
          <div class="row">
            <select v-model="filter" aria-label="Aktivitäten filtern">
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
              <div class="log-item-icon">{{ entry.icon }}</div>
              <div class="stack">
                <div class="row between">
                  <strong>{{
                    entry.typeName ||
                    session.config?.maintenanceTypes[entry.type || ""]?.label ||
                    "Wassermessung"
                  }}</strong
                  ><span class="muted">{{ fmtDate(entry.timestamp) }}</span>
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
                    v-if="entry.kind === 'maintenance'"
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
      <LazySection data-lazy="history" :label="t('detail.measurementsTitle')" :loaded="history.loaded.value" :loading="history.loading.value" :error="history.error.value" @activate="history.load()">
        <section class="card stack">
          <h2>Messwerte-Tabelle</h2>
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
                  <td>{{ fmtDate(measurement.measured_at) }}</td>
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
      <button
        v-if="hasAI"
        class="chat-fab"
        aria-label="KI-Assistent öffnen"
        @click="modal = 'chat'"
      >
        🤖<span class="chat-fab-badge">KI</span>
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
            >Bilddatei (bis 5 MB)<input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              required
              @change="photoChanged" /></label
          ><img
            v-if="photoFile && modal === 'photo'"
            class="img-preview"
            :src="photoFile"
            alt="Vorschau"
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
        ><img
          :src="lightbox"
          :alt="aquarium.name"
          style="max-width: 100%; max-height: 80vh; object-fit: contain"
      /></Modal>
    </template>
  </div>
</template>
