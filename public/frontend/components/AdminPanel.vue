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
import { registerMessages, session, t, errorMessage, toast, fmtDate } from "../state";
import { askConfirm } from "../dialog";
import featuresDe from "../../locales/features.de.json";
import featuresEn from "../../locales/features.en.json";
import type { User, Field, FormData, Id } from "../types";
registerMessages({ de: featuresDe, en: featuresEn });
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
interface ProviderMetrics {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}
interface AdminMetrics {
  users: { total: number; verified: number };
  aquariums: { total: number; perUserAverage: number };
  measurements: { total: number; perUserAverage: number };
  logbookEntries: { total: number; perUserAverage: number };
  socialPosts: number;
  animals: number;
  activeSessions: number;
  ai: { requests: number; totalTokens: number; providers: Record<string, ProviderMetrics> };
}
const props = defineProps<{ section: string }>();
const tab = ref(props.section);
const users = ref<AdminUser[]>([]);
const search = ref("");
const editing = ref<AdminUser | null>();
const userModel = reactive<FormData>({});
const config = reactive<FormData>({});
const backups = ref<Backup[]>([]);
const metrics = ref<AdminMetrics | null>(null);
const metricsPasswordConfigured = ref(false);
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
const aiProviders = [
  { id: "openai", label: "OpenAI" },
  { id: "gemini", label: "Google Gemini" },
  { id: "claude", label: "Anthropic Claude" },
];
const formatMetric = (value: number) => new Intl.NumberFormat().format(value);
const formatAverage = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
let interval: ReturnType<typeof setInterval> | undefined;
const tabs = [
  ["users", "👥", "adminPanel.tabs.users"],
  ["registration", "✉️", "adminPanel.tabs.registration"],
  ["mail", "📧", "adminPanel.tabs.mail"],
  ["backups", "💾", "adminPanel.tabs.backups"],
  ["logs", "📋", "adminPanel.tabs.logs"],
  ["legal-config", "⚖️", "adminPanel.tabs.legal"],
];
const currentTab = computed(() => tabs.find(([key]) => key === tab.value));
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
  { key: "emailVerified", label: t("adminPanel.emailVerified"), type: "checkbox" },
  { key: "isAdmin", label: t("admin.adminBadge"), type: "checkbox" },
]);
const fields = computed<Field[]>(() =>
  tab.value === "mail"
    ? [
        { key: "enabled", label: t("adminPanel.smtpEnabled"), type: "checkbox" },
        { key: "host", label: "SMTP Host" },
        { key: "port", label: "Port", type: "number" },
        { key: "secure", label: "SSL / TLS", type: "checkbox" },
        { key: "requireTls", label: t("adminPanel.requireTls"), type: "checkbox" },
        { key: "ignoreTls", label: t("adminPanel.ignoreTls"), type: "checkbox" },
        {
          key: "rejectUnauthorized",
          label: t("adminPanel.rejectUnauthorized"),
          type: "checkbox",
        },
        { key: "user", label: t("adminPanel.user") },
        {
          key: "pass",
          label: t("adminPanel.smtpPassword"),
          type: "password",
        },
        { key: "from", label: t("adminPanel.sender") },
        {
          key: "rateLimitMs",
          label: t("adminPanel.rateLimit"),
          type: "number",
          min: 100,
          max: 60000,
        },
      ]
    : tab.value === "backups"
      ? [
          { key: "enabled", label: t("adminPanel.autoBackups"), type: "checkbox" },
          { key: "password", label: t("adminPanel.backupPassword"), type: "password" },
          {
            key: "intervalHours",
            label: t("adminPanel.intervalHours"),
            type: "number",
            min: 1,
            max: 720,
          },
          {
            key: "retentionCount",
            label: t("adminPanel.retentionCount"),
            type: "number",
            min: 1,
            max: 100,
          },
          {
            key: "includeFiles",
            label: t("adminPanel.includeFiles"),
            type: "checkbox",
          },
        ]
      : tab.value === "registration"
        ? [
            {
              key: "mode",
              label: t("admin.regModeTitle"),
              options: {
                open: `🟢 ${t("adminPanel.modeOpen")}`,
                invite_admin: `🔒 ${t("adminPanel.modeInviteAdmin")}`,
                invite_open: `👥 ${t("adminPanel.modeInviteOpen")}`,
                closed: `⛔ ${t("adminPanel.modeClosed")}`,
              },
            },
            {
              key: "userCodeMaxDays",
              label: t("adminPanel.userCodeMaxDays"),
              type: "number",
              min: 1,
              max: 365,
            },
            {
              key: "mailInviteMaxDays",
              label: t("adminPanel.mailInviteMaxDays"),
              type: "number",
              min: 1,
              max: 14,
            },
          ]
        : [
            { key: "contactEmail", label: t("adminPanel.contactEmail"), type: "email" },
            { key: "imprintEmail", label: t("adminPanel.imprintEmail"), type: "email" },
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
    if (section === "metrics") {
      const result = await api<{ metrics: AdminMetrics; passwordConfigured: boolean }>("/admin/metrics", { signal: request.signal });
      if (generation !== loadGeneration) return;
      metrics.value = result.metrics;
      metricsPasswordConfigured.value = result.passwordConfigured;
      config.password = "";
    } else if (section === "users") {
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
    tab.value === "metrics"
      ? "/admin/metrics"
      : tab.value === "registration"
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
    isAdmin: false,
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
  if (!await askConfirm({ title: t("confirmTexts.deleteUserTitle"), message: t("confirmTexts.deleteUserText"), confirmLabel: t("confirmTexts.delete") })) return;
  await action(`/admin/users/${id}`, "DELETE");
  await load();
}
async function backupAction(backup: Backup, restore = false) {
  if (
    !await askConfirm(restore
      ? { title: t("confirmTexts.restoreTitle"), message: t("confirmTexts.restoreText"), confirmLabel: t("confirmTexts.restore") }
      : { title: t("confirmTexts.deleteBackupTitle"), message: t("confirmTexts.deleteBackupText"), confirmLabel: t("confirmTexts.delete") })
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
    !await askConfirm({ title: t("confirmTexts.restoreTitle"), message: t("confirmTexts.restoreText"), confirmLabel: t("confirmTexts.restore") })
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
  if (!await askConfirm({ title: t("confirmTexts.clearLogsTitle"), message: t("confirmTexts.clearLogsText"), confirmLabel: t("confirmTexts.delete") })) return;
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
      <h2>{{ t("adminPanel.registeredUsers", { count: users.length }) }}</h2>
      <div class="row between">
        <input
          v-model="search"
          :placeholder="t('common.search')"
          :aria-label="t('common.search')"
        /><button class="btn" @click="editUser(null)">+ {{ t("adminPanel.user") }}</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ t("adminPanel.user") }}</th>
              <th>{{ t("adminPanel.email") }}</th>
              <th>{{ t("common.status") }}</th>
              <th>{{ t("admin.colAquariums") }}</th>
              <th>{{ t("adminPanel.created") }}</th>
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
                {{ user.emailVerified ? `✓ ${t("adminPanel.verified")}` : t("adminPanel.unverified") }} ·
                {{ user.hasPassword ? t("auth.password") : "" }}
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
      <h2>{{ t("adminPanel.logsTitle") }}</h2>
      <div class="row">
        <select v-model="logLevel">
          <option value="all">{{ t("adminPanel.allLevels") }}</option>
          <option
            v-for="level in ['INFO', 'WARN', 'ERROR', 'DEBUG']"
            :key="level"
          >
            {{ level }}
          </option></select
        ><input v-model="logSearch" :placeholder="t('adminPanel.searchLogs')" /><input
          v-model.number="logLines"
          type="number"
          min="10"
          max="1000"
          :aria-label="t('adminPanel.linesPerPage')"
        /><button class="btn small ghost" @click="load">{{ t("adminPanel.refresh") }}</button
        ><button class="btn small ghost danger" @click="clearLogs">
          {{ t("common.delete") }}</button
        ><label class="row"
          ><input v-model="autoRefresh" type="checkbox" />{{ t("adminPanel.autoRefresh") }}</label
        >
      </div>
      <div class="row">
        <span class="muted">{{ t("adminPanel.logsLoaded", { count: rawLogs.length }) }}</span>
        <button v-if="logNext !== null" type="button" class="btn small ghost" :disabled="logsLoading || olderLogsLoading" @click="loadOlderLogs">
          {{ olderLogsLoading ? t('adminPanel.loadingOlder') : t('adminPanel.loadOlder') }}
        </button>
        <span v-if="logsLoading" class="muted" role="status">{{ t('common.loading') }}</span>
      </div>
      <pre
        ref="logViewer"
        class="log-viewer-box"
        tabindex="0"
        :aria-label="t('adminPanel.logViewerLabel')"
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
      <section v-else-if="tab === 'metrics'" class="card stack">
        <template v-if="metrics">
          <h2>{{ t('admin.metrics.title') }}</h2>
          <p>{{ t('admin.metrics.privacy') }}</p>
          <form class="row" @submit.prevent="saveConfig">
            <label class="stack">{{ t('admin.metrics.passwordLabel') }}
              <input v-model="config.password" type="password" minlength="16" maxlength="256" autocomplete="new-password" />
            </label>
            <button class="btn" :disabled="busy || String(config.password || '').length < 16">{{ t('common.save') }}</button>
          </form>
          <p class="muted">{{ t(metricsPasswordConfigured ? 'admin.metrics.passwordSet' : 'admin.metrics.passwordMissing') }}</p>
          <p class="muted">{{ t('admin.metrics.endpointInfo') }} <code>/metrics</code></p>
          <h3>{{ t('admin.metrics.overview') }}</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>{{ t('admin.metrics.measure') }}</th><th>{{ t('admin.metrics.total') }}</th><th>{{ t('admin.metrics.perUserAverage') }}</th></tr></thead>
              <tbody>
                <tr><th>{{ t('admin.metrics.users') }}</th><td>{{ formatMetric(metrics.users.total) }}</td><td>-</td></tr>
                <tr><th>{{ t('admin.metrics.verifiedUsers') }}</th><td>{{ formatMetric(metrics.users.verified) }}</td><td>-</td></tr>
                <tr><th>{{ t('admin.metrics.aquariums') }}</th><td>{{ formatMetric(metrics.aquariums.total) }}</td><td>{{ formatAverage(metrics.aquariums.perUserAverage) }}</td></tr>
                <tr><th>{{ t('admin.metrics.measurements') }}</th><td>{{ formatMetric(metrics.measurements.total) }}</td><td>{{ formatAverage(metrics.measurements.perUserAverage) }}</td></tr>
                <tr><th>{{ t('admin.metrics.logbookEntries') }}</th><td>{{ formatMetric(metrics.logbookEntries.total) }}</td><td>{{ formatAverage(metrics.logbookEntries.perUserAverage) }}</td></tr>
                <tr><th>{{ t('admin.metrics.socialPosts') }}</th><td>{{ formatMetric(metrics.socialPosts) }}</td><td>-</td></tr>
                <tr><th>{{ t('admin.metrics.animals') }}</th><td>{{ formatMetric(metrics.animals) }}</td><td>-</td></tr>
                <tr><th>{{ t('admin.metrics.activeSessions') }}</th><td>{{ formatMetric(metrics.activeSessions) }}</td><td>-</td></tr>
              </tbody>
            </table>
          </div>
          <h3>{{ t('admin.metrics.aiUsage') }}</h3>
          <p>{{ t('admin.metrics.aiSummary', { requests: formatMetric(metrics.ai.requests), tokens: formatMetric(metrics.ai.totalTokens) }) }}</p>
          <p class="muted">{{ t('admin.metrics.aiTrackingNotice') }}</p>
          <div class="table-wrap">
            <table>
              <thead><tr><th>{{ t('admin.metrics.provider') }}</th><th>{{ t('admin.metrics.requests') }}</th><th>{{ t('admin.metrics.inputTokens') }}</th><th>{{ t('admin.metrics.outputTokens') }}</th><th>{{ t('admin.metrics.totalTokens') }}</th></tr></thead>
              <tbody>
                <tr v-for="provider in aiProviders" :key="provider.id">
                  <th>{{ provider.label }}</th>
                  <td>{{ formatMetric(metrics.ai.providers[provider.id]?.requests || 0) }}</td>
                  <td>{{ formatMetric(metrics.ai.providers[provider.id]?.inputTokens || 0) }}</td>
                  <td>{{ formatMetric(metrics.ai.providers[provider.id]?.outputTokens || 0) }}</td>
                  <td>{{ formatMetric(metrics.ai.providers[provider.id]?.totalTokens || 0) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
        <p v-else role="status">{{ t('common.loading') }}</p>
      </section>
    <template v-else
      ><form class="card stack" @submit.prevent="saveConfig">
        <h2>{{ currentTab ? `${currentTab[1]} ${t(currentTab[2] || "")}` : "" }}</h2>
        <Fields :fields="fields" :model="config" /><button
          class="btn"
          :disabled="busy"
        >
          {{ t("common.save") }}
        </button>
      </form>
      <Invitations v-if="tab === 'registration'" admin />
      <section v-if="tab === 'mail'" class="card stack">
        <h2>{{ t("adminPanel.testMailTitle") }}</h2>
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
            :aria-label="t('adminPanel.recipient')"
          /><button class="btn" :disabled="busy">{{ t("admin.sendTestMail") }}</button>
        </form>
        <dl>
          <template v-for="(value, key) in queue" :key="key"
            ><dt>{{ key }}</dt>
            <dd>{{ value }}</dd></template
          >
        </dl>
      </section>
      <section v-if="tab === 'backups'" class="card stack">
        <p>{{ config.passwordConfigured ? t('adminPanel.backupPasswordSet') : t('adminPanel.backupPasswordMissing') }}</p>
        <p class="muted">{{ t("adminPanel.backupPasswordNote") }}</p>
        <label>{{ t("adminPanel.restorePassword") }}
          <input v-model="restorePassword" type="password" autocomplete="off" />
        </label>
        <div class="row between">
          <h2>{{ t("adminPanel.storedBackups") }}</h2>
          <button class="btn" :disabled="busy || !config.passwordConfigured" @click="createBackup">
            💾 {{ t("adminPanel.createBackup") }}
          </button>
        </div>
        <label
          >{{ t("adminPanel.restoreFromFile") }}<input
            type="file"
            accept=".json,.gz,.gzip,.enc"
            @change="uploadBackup"
        /></label>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{{ t("adminPanel.file") }}</th>
                <th>{{ t("adminPanel.size") }}</th>
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
                      >{{ t("adminPanel.download") }}</a
                    ><button
                      class="btn small ghost"
                      :disabled="busy"
                      @click="backupAction(backup, true)"
                    >
                      {{ t("adminPanel.restore") }}</button
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
      :title="t('adminPanel.manageUser')"
      @close="editing = undefined"
      ><form class="stack" @submit.prevent="saveUser">
        <Fields :fields="userFields" :model="userModel" />
        <p v-if="error" class="error">{{ error }}</p>
        <button class="btn" :disabled="busy">{{ t("common.save") }}</button>
      </form></Modal
    >
  </div>
</template>
