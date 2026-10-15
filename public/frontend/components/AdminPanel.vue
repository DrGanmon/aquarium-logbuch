<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  reactive,
  ref,
  watch,
  onBeforeUnmount,
} from "vue";
import Fields from "./Fields.vue";
import Modal from "./Modal.vue";
import Invitations from "./Invitations.vue";
import { api } from "../api";
import { session, t, errorMessage, toast, fmtDate } from "../state";
import type { User, Field, FormData, Id } from "../types";
interface AdminUser extends User {
  emailVerified: boolean;
  oidcSub?: string | null;
  aquariumCount: number;
  createdAt: string;
}
interface Backup {
  filename: string;
  size: number;
  createdAt: string;
  created_at?: string;
}
interface AdminResponse {
  config: FormData;
  backups?: Backup[];
  queue?: Record<string, unknown>;
}
const props = defineProps<{ section: string }>();
const tab = ref(props.section);
const users = ref<AdminUser[]>([]);
const search = ref("");
const editing = ref<AdminUser | null>();
const userModel = reactive<FormData>({});
const config = reactive<FormData>({});
const backups = ref<Backup[]>([]);
const restorePassword = ref("");
const queue = ref<Record<string, unknown>>({});
const logs = computed(() => rawLogs.value.join("\n"));
const rawLogs = ref<string[]>([]);
const logLevel = ref("all");
const logSearch = ref("");
const logLines = ref(200);
const logViewer = ref<HTMLElement>();
const logNext = ref<number | null>(null);
const logFileId = ref<string | null>(null);
const logsLoading = ref(false), olderLogsLoading = ref(false);
let olderController: AbortController | undefined;
interface LogPage { logs: string[]; next: number | null; fileId: string | null; reset: boolean }
function atLogBottom() {
  const viewer = logViewer.value;
  return !viewer || viewer.scrollHeight - viewer.scrollTop - viewer.clientHeight < 48;
}
function logQuery(before?: number) {
  const query = new URLSearchParams({ lines: String(logLines.value), level: logLevel.value, search: logSearch.value });
  if (before !== undefined) { query.set('before', String(before));if (logFileId.value) query.set('fileId', logFileId.value); }
  return `/admin/logs?${query}`;
}
async function loadOlderLogs() {
  if (logsLoading.value || olderLogsLoading.value || logNext.value === null || !logViewer.value) return;
  const generation = loadGeneration;
  const viewer = logViewer.value;
  const height = viewer.scrollHeight, top = viewer.scrollTop;
  const request = new AbortController();olderController = request;
  olderLogsLoading.value = true;
  try {
    const result = await api<LogPage>(logQuery(logNext.value), { signal: request.signal });
    if (request.signal.aborted || generation !== loadGeneration) return;
    rawLogs.value = result.reset ? result.logs : [...result.logs, ...rawLogs.value];
    logNext.value = result.next;logFileId.value = result.fileId;
    await nextTick();
    if (generation !== loadGeneration) return;
    viewer.scrollTop = result.reset ? viewer.scrollHeight : top + viewer.scrollHeight - height;
  } catch (e) { if (!request.signal.aborted && generation === loadGeneration) error.value = errorMessage(e); }
  finally { if (olderController === request) olderLogsLoading.value = false; }
}
function onLogScroll() {
  if (logViewer.value && logViewer.value.scrollTop < 48) void loadOlderLogs();
}
const autoRefresh = ref(false);
const error = ref("");
const busy = ref(false);
const testEmail = ref(session.user?.email || "");
let interval: ReturnType<typeof setInterval> | undefined;
const tabs = [
  ["users", "👥 Benutzer"],
  ["registration", "✉️ Registrierung & Einladungen"],
  ["mail", "📧 E-Mail"],
  ["backups", "💾 Backups"],
  ["logs", "📋 System-Logbuch"],
  ["legal-config", "⚖️ Rechtliches"],
];
const shownUsers = computed(() =>
  users.value.filter((user) =>
    `${user.username} ${user.email || ""}`
      .toLowerCase()
      .includes(search.value.toLowerCase()),
  ),
);
const userFields = computed<Field[]>(() => [
  { key: "username", label: t("auth.username"), required: true },
  { key: "email", label: t("auth.email"), type: "email" },
  { key: "password", label: t("auth.password"), type: "password" },
  { key: "oidcSub", label: "OIDC Sub" },
  { key: "emailVerified", label: "E-Mail bestätigt", type: "checkbox" },
]);
const fields = computed<Field[]>(() =>
  tab.value === "mail"
    ? [
        { key: "enabled", label: "SMTP aktiv", type: "checkbox" },
        { key: "host", label: "SMTP Host" },
        { key: "port", label: "Port", type: "number" },
        { key: "secure", label: "SSL / TLS", type: "checkbox" },
        { key: "requireTls", label: "STARTTLS erzwingen", type: "checkbox" },
        { key: "ignoreTls", label: "STARTTLS deaktivieren", type: "checkbox" },
        {
          key: "rejectUnauthorized",
          label: "Zertifikat prüfen",
          type: "checkbox",
        },
        { key: "user", label: "Benutzer" },
        {
          key: "pass",
          label: "Passwort (leer = unverändert)",
          type: "password",
        },
        { key: "from", label: "Absender" },
        {
          key: "rateLimitMs",
          label: "Verzögerung (ms)",
          type: "number",
          min: 100,
          max: 60000,
        },
      ]
    : tab.value === "backups"
      ? [
          { key: "enabled", label: "Automatische Backups", type: "checkbox" },
          { key: "password", label: "Backup-Passwort (mind. 12 Zeichen; leer = unverändert)", type: "password" },
          {
            key: "intervalHours",
            label: "Intervall (Stunden)",
            type: "number",
            min: 1,
            max: 720,
          },
          {
            key: "retentionCount",
            label: "Anzahl aufbewahrter Backups",
            type: "number",
            min: 1,
            max: 100,
          },
          {
            key: "includeFiles",
            label: "Bilder einschließen",
            type: "checkbox",
          },
        ]
      : tab.value === "registration"
        ? [
            {
              key: "mode",
              label: "Registrierungsmodus",
              options: {
                open: "🟢 Offen",
                invite_admin: "🔒 Einladung (Admin)",
                invite_open: "👥 Einladung (Offen)",
                closed: "⛔ Geschlossen",
              },
            },
            {
              key: "userCodeMaxDays",
              label: "Gültigkeit Benutzercodes (Tage)",
              type: "number",
              min: 1,
              max: 365,
            },
            {
              key: "mailInviteMaxDays",
              label: "Gültigkeit E-Mail-Einladungen (Tage)",
              type: "number",
              min: 1,
              max: 14,
            },
          ]
        : [
            { key: "contactEmail", label: "Kontakt-E-Mail", type: "email" },
            { key: "imprintEmail", label: "Impressums-E-Mail", type: "email" },
          ],
);
onMounted(load);
watch(tab, load);
watch([logLevel, logSearch, logLines], () => {
  if (tab.value === "logs") void load();
});
watch(autoRefresh, (value) => {
  clearInterval(interval);
  if (value)
    interval = setInterval(() => {
      if (tab.value === "logs" && !logsLoading.value && !olderLogsLoading.value && atLogBottom()) void load();
    }, 5000);
});
onBeforeUnmount(() => { clearInterval(interval); loadController?.abort(); olderController?.abort(); loadGeneration++; });
let loadController: AbortController | undefined;
let loadGeneration = 0;
async function load() {
  loadController?.abort();
  olderController?.abort();
  olderLogsLoading.value = false;
  const request = new AbortController();
  loadController = request;
  const generation = ++loadGeneration;
  const section = tab.value;
  error.value = "";
  try {
    if (section === "users") {
      const result = await api<AdminUser[]>("/admin/users", { signal: request.signal });
      if (generation === loadGeneration) users.value = result;
    } else if (section === "logs") {
      logsLoading.value = true;
      const result = await api<LogPage>(logQuery(), { signal: request.signal });
      if (generation !== loadGeneration) return;
      rawLogs.value = result.logs;logNext.value = result.next;logFileId.value = result.fileId;
      await nextTick();
      if (generation === loadGeneration && logViewer.value) logViewer.value.scrollTop = logViewer.value.scrollHeight;
    } else {
      const result = await api<AdminResponse>("/admin/" + section, { signal: request.signal });
      if (generation !== loadGeneration) return;
      for (const key of Object.keys(config)) delete config[key];
      Object.assign(config, result.config);
      if (result.backups) backups.value = result.backups;
      if (result.queue) queue.value = result.queue;
    }
  } catch (e) {
    if (!request.signal.aborted && generation === loadGeneration) error.value = errorMessage(e);
  } finally { if (generation === loadGeneration) logsLoading.value = false; }
}
async function action(path: string, method: string, body?: unknown) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const result = await api<{ message?: string }>(path, { method, body });
    toast(result.message || t("common.saved"));
    return result;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
async function saveConfig() {
  const endpoint =
    tab.value === "registration"
      ? "/admin/registration/config"
      : tab.value === "backups"
        ? "/admin/backups/config"
        : "/admin/" + tab.value;
  if (await action(endpoint, "PUT", config)) {
    delete config.password;
    await load();
  }
}
function editUser(user: AdminUser | null) {
  editing.value = user;
  for (const key of Object.keys(userModel)) delete userModel[key];
  Object.assign(userModel, {
    username: "",
    email: "",
    password: "",
    oidcSub: "",
    emailVerified: true,
    ...user,
  });
}
async function saveUser() {
  const result = await action(
    "/admin/users" + (editing.value ? "/" + editing.value.id : ""),
    editing.value ? "PUT" : "POST",
    userModel,
  );
  if (result) {
    editing.value = undefined;
    await load();
  }
}
async function removeUser(id: Id) {
  if (!confirm("Benutzer und alle zugehörigen Daten löschen?")) return;
  await action(`/admin/users/${id}`, "DELETE");
  await load();
}
async function backupAction(backup: Backup, restore = false) {
  if (
    !confirm(
      restore
        ? "Backup wiederherstellen? Vorhandene Daten werden ersetzt."
        : "Backup löschen?",
    )
  )
    return;
  const result = await action(
    `/admin/backups/${encodeURIComponent(backup.filename)}${restore ? "/restore" : ""}`,
    restore ? "POST" : "DELETE",
    restore ? { password: restorePassword.value } : undefined,
  );
  if (result) { restorePassword.value = ""; await load(); }
}
async function uploadBackup(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (
    !file ||
    !confirm("Backup wiederherstellen? Vorhandene Daten werden ersetzt.")
  )
    return;
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const result = await action("/admin/backups/restore-upload", "POST", {
    backupBase64: base64,
    password: restorePassword.value,
  });
  if (result) { restorePassword.value = ""; await load(); }
}
async function clearLogs() {
  if (!confirm("System-Logbuch löschen?")) return;
  await action("/admin/logs", "DELETE");
  await load();
}
async function createBackup() {
  if (await action("/admin/backups/create", "POST")) await load();
}
</script>
<template>
  <div class="stack">
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <section v-if="tab === 'users'" class="card stack">
      <h2>Registrierte Benutzer ({{ users.length }})</h2>
      <div class="row between">
        <input
          v-model="search"
          :placeholder="t('common.search')"
          :aria-label="t('common.search')"
        /><button class="btn" @click="editUser(null)">+ Benutzer</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Benutzer</th>
              <th>E-Mail</th>
              <th>Status</th>
              <th>Aquarien</th>
              <th>Erstellt</th>
              <th>{{ t("common.actions") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in shownUsers" :key="user.id">
              <td>
                {{ user.username }}
                <span v-if="user.isAdmin" class="chip ok">Admin</span>
              </td>
              <td>{{ user.email }}</td>
              <td>
                {{ user.emailVerified ? "✓ bestätigt" : "unbestätigt" }} ·
                {{ user.hasPassword ? "Passwort" : "" }}
                {{ user.oidcSub ? "OIDC" : "" }}
              </td>
              <td>{{ user.aquariumCount }}</td>
              <td>{{ fmtDate(user.createdAt) }}</td>
              <td>
                <div class="row">
                  <button class="btn small ghost" @click="editUser(user)">
                    {{ t("common.edit") }}</button
                  ><button
                    v-if="user.id !== session.user?.id"
                    class="btn small ghost danger"
                    @click="removeUser(user.id)"
                  >
                    {{ t("common.delete") }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <section v-else-if="tab === 'logs'" class="card stack">
      <h2>System-Logbuch & Fehlerprotokoll</h2>
      <div class="row">
        <select v-model="logLevel">
          <option value="all">Alle Level</option>
          <option
            v-for="level in ['INFO', 'WARN', 'ERROR', 'DEBUG']"
            :key="level"
          >
            {{ level }}
          </option></select
        ><input v-model="logSearch" placeholder="Logs durchsuchen" /><input
          v-model.number="logLines"
          type="number"
          min="10"
          max="1000"
          aria-label="Zeilen pro Ladeabschnitt"
        /><button class="btn small ghost" @click="load">Aktualisieren</button
        ><button class="btn small ghost danger" @click="clearLogs">
          {{ t("common.delete") }}</button
        ><label class="row"
          ><input v-model="autoRefresh" type="checkbox" />Automatisch
          aktualisieren</label
        >
      </div>
      <div class="row">
        <span class="muted">{{ rawLogs.length }} Einträge geladen · Neueste unten</span>
        <button v-if="logNext !== null" type="button" class="btn small ghost" :disabled="logsLoading || olderLogsLoading" @click="loadOlderLogs">
          {{ olderLogsLoading ? 'Ältere Einträge werden geladen …' : 'Ältere Einträge laden' }}
        </button>
        <span v-if="logsLoading" class="muted" role="status">{{ t('common.loading') }}</span>
      </div>
      <pre
        ref="logViewer"
        class="log-viewer-box"
        tabindex="0"
        aria-label="Serverlogs, neueste Einträge unten"
        @scroll="onLogScroll"
        style="
          max-height: 320px;
          overflow: auto;
          overflow-anchor: none;
          background: var(--tube-bg);
          padding: 0.75rem;
          border: 1px solid var(--line);
          border-radius: 8px;
          font-size: 0.82rem;
          white-space: pre-wrap;
        "
        >{{ logs }}</pre>
    </section>
    <template v-else
      ><form class="card stack" @submit.prevent="saveConfig">
        <h2>{{ tabs.find(([key]) => key === tab)?.[1] }}</h2>
        <Fields :fields="fields" :model="config" /><button
          class="btn"
          :disabled="busy"
        >
          {{ t("common.save") }}
        </button>
      </form>
      <Invitations v-if="tab === 'registration'" admin />
      <section v-if="tab === 'mail'" class="card stack">
        <h2>Test-E-Mail & Warteschlange</h2>
        <form
          class="row"
          @submit.prevent="
            action('/admin/mail/test', 'POST', {
              to: testEmail,
              language: session.user?.language,
            })
          "
        >
          <input
            v-model="testEmail"
            type="email"
            required
            aria-label="Empfänger"
          /><button class="btn" :disabled="busy">Test-E-Mail senden</button>
        </form>
        <dl>
          <template v-for="(value, key) in queue" :key="key"
            ><dt>{{ key }}</dt>
            <dd>{{ value }}</dd></template
          >
        </dl>
      </section>
      <section v-if="tab === 'backups'" class="card stack">
        <p>{{ config.passwordConfigured ? 'Backup-Passwort ist hinterlegt. Neue Backups werden verschlüsselt.' : 'Bitte zuerst ein Backup-Passwort festlegen und speichern.' }}</p>
        <p class="muted">Ein neues Passwort gilt für neue Backups. Für ältere Downloads das damalige Passwort aufbewahren. Auf diesem Server ist die Wiederherstellung auch über den App-Schlüssel möglich.</p>
        <label>Passwort für die Wiederherstellung (optional auf diesem Server)
          <input v-model="restorePassword" type="password" autocomplete="off" />
        </label>
        <div class="row between">
          <h2>Gespeicherte Backups</h2>
          <button class="btn" :disabled="busy || !config.passwordConfigured" @click="createBackup">
            💾 Backup erstellen
          </button>
        </div>
        <label
          >Backup aus Datei wiederherstellen<input
            type="file"
            accept=".json,.gz,.gzip,.enc"
            @change="uploadBackup"
        /></label>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Datei</th>
                <th>Größe</th>
                <th>{{ t("common.date") }}</th>
                <th>{{ t("common.actions") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="backup in backups" :key="backup.filename">
                <td>{{ backup.filename }}</td>
                <td>{{ Math.round(backup.size / 1024) }} KB</td>
                <td>{{ fmtDate(backup.createdAt || backup.created_at) }}</td>
                <td>
                  <div class="row">
                    <a
                      class="btn small ghost"
                      :href="`api/admin/backups/${encodeURIComponent(backup.filename)}/download`"
                      download
                      >Herunterladen</a
                    ><button
                      class="btn small ghost"
                      :disabled="busy"
                      @click="backupAction(backup, true)"
                    >
                      Wiederherstellen</button
                    ><button
                      class="btn small ghost danger"
                      :disabled="busy"
                      @click="backupAction(backup)"
                    >
                      {{ t("common.delete") }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section></template
    >
    <Modal
      v-if="editing !== undefined"
      title="Benutzer verwalten"
      @close="editing = undefined"
      ><form class="stack" @submit.prevent="saveUser">
        <Fields :fields="userFields" :model="userModel" />
        <p v-if="error" class="error">{{ error }}</p>
        <button class="btn" :disabled="busy">{{ t("common.save") }}</button>
      </form></Modal
    >
  </div>
</template>
