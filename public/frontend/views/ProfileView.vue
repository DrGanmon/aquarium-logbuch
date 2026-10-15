<script setup lang="ts">
import { lazyComponent } from "../composables/lazy-component";
import { computed, reactive, ref, onMounted, watch } from "vue";
import Fields from "../components/Fields.vue";
import TestSelection from "../components/TestSelection.vue";
import { initialTestSelection, resolveTests } from "../composables/test-selection";
import { api, refreshSession } from "../api";
import { session, t, errorMessage, toast, theme, language } from "../state";
import { readImage, enableNotifications } from "../composables/media";
import type { Field, FormData, User } from "../types";
const ProviderSettings = lazyComponent(() => import("../components/ProviderSettings.vue"));
const Invitations = lazyComponent(() => import("../components/Invitations.vue"));
const TestInventory = lazyComponent(() => import("../components/TestInventory.vue"));
const activeTab = ref("profile");
const visitedTabs = ref(new Set([activeTab.value]));
watch(activeTab, value => { visitedTabs.value.add(value); });
const canShowInvites = computed(() =>
  ["open", "invite_open"].includes(session.user?.registrationMode || ""),
);
const tabs = computed(() => [
  { id: "profile", label: "profile.tabs.profile" },
  { id: "ui", label: "profile.tabs.ui" },
  { id: "ai", label: "profile.tabs.ai" },
  { id: "tests", label: "profile.tabs.tests" },
  ...(canShowInvites.value ? [{ id: "invites", label: "profile.tabs.invites" }] : []),
]);
watch(canShowInvites, (visible) => {
  if (!visible && activeTab.value === "invites") activeTab.value = "profile";
});
function navigateTabs(event: KeyboardEvent, index: number) {
  let next: number;
  switch (event.key) {
    case "ArrowRight": next = (index + 1) % tabs.value.length; break;
    case "ArrowLeft": next = (index + tabs.value.length - 1) % tabs.value.length; break;
    case "Home": next = 0; break;
    case "End": next = tabs.value.length - 1; break;
    default: return;
  }
  event.preventDefault();
  activeTab.value = tabs.value[next]!.id;
  (event.currentTarget as HTMLElement).parentElement
    ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
}
const model = reactive<FormData>({
  username: "",
  email: "",
  firstName: "",
  lastName: "",
  bio: "",
  defaultGraphRange: session.user?.defaultGraphRange || "90",
});
for (const key of Object.keys(model)) {
  const value = (session.user as unknown as Record<string, unknown> | null)?.[
    key
  ];
  if (typeof value === "string") model[key] = value;
}
const error = ref("");
const busy = ref(false);
const current = ref("");
const next = ref("");
const repeat = ref("");
const provider = ref(session.user?.aiProvider || "openai");
const deletePassword = ref("");
const deleteConfirm = ref(false);
const suite = ref(session.config?.userPreferences.selectedSuite || "");
const tests = ref(initialTestSelection(session.config));
if (model.defaultGraphRange === "3650") model.defaultGraphRange = "all";
const avatarInput = ref<HTMLInputElement>();
const avatarVersion = ref(Date.now());
const fields = computed<Field[]>(() => [
  { key: "firstName", label: t("profile.firstName") },
  { key: "lastName", label: t("profile.lastName") },
  { key: "username", label: t("auth.username"), required: true },
  { key: "email", label: t("auth.email"), type: "email" },
  { key: "bio", label: t("profile.bio"), type: "textarea" },
]);
const inventorySuites = computed(() => (session.config?.suites || []).map(item => ({
  id: item.id,
  keys: resolveTests(session.config?.suites || [], tests.value).filter(test => test.suiteId === item.id).map(test => test.key),
})).filter(item => item.keys.length));
onMounted(async () => {
  try {
    await refreshSession();
    for (const key of Object.keys(model)) {
      const value = (
        session.user as unknown as Record<string, unknown> | null
      )?.[key];
      if (typeof value === "string") model[key] = value;
    }
    if (model.defaultGraphRange === "3650") model.defaultGraphRange = "all";
  } catch (e) {
    error.value = errorMessage(e);
  }
});
async function action(path: string, method: string, body?: unknown) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const result = await api<{ user?: User; message?: string }>(path, {
      method,
      body,
    });
    if (result.user) session.user = result.user;
    toast(result.message || t("common.saved"));
    return result;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
async function save() {
  const body: FormData = { ...model, language: language.value };
  if (body.email === session.user?.email) delete body.email;
  await action("/me", "PUT", body);
}
async function avatar(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    await action("/me/avatar", "POST", { image: await readImage(file) });
    await refreshSession();
    avatarVersion.value = Date.now();
  } catch (e) {
    error.value = errorMessage(e);
  }
}
async function removeAvatar() {
  await action("/me/avatar", "DELETE");
  await refreshSession();
}
async function password() {
  if (next.value !== repeat.value) {
    error.value = "Die Passwörter stimmen nicht überein.";
    return;
  }
  const result = await action("/password", "POST", {
    current: current.value,
    next: next.value,
  });
  if (result) {
    current.value = "";
    next.value = "";
    repeat.value = "";
  }
}
async function saveTests() {
  await action("/me/tests", "PUT", {
    selectedSuite: suite.value,
    selectedTests: tests.value,
  });
  session.config = await api("/config");
}
async function notify(test = false) {
  try {
    const permission = await enableNotifications();
    if (permission === "granted" && test) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration)
        registration.active?.postMessage({
          type: "SCHEDULE_TIMER",
          timerId: "notification-test",
          testName: "Test",
          waitSec: 3,
          endTime: Date.now() + 3000,
          url: location.href,
        });
      else
        new Notification("Aquarium-Logbuch", {
          body: "Benachrichtigungen sind aktiviert.",
        });
    }
  } catch (e) {
    error.value = errorMessage(e);
  }
}
async function deleteRequest() {
  if (!deleteConfirm.value) return;
  await action("/me/delete-request", "POST", {
    password: deletePassword.value,
    confirm: true,
  });
}
async function chooseLanguage(value: "de" | "en") {
  language.value = value;
  await action("/me", "PUT", { language: value });
  session.config = await api("/config");
}
async function saveRange() {
  await action("/me", "PUT", { defaultGraphRange: model.defaultGraphRange });
  localStorage.setItem("aquarium_graph_range", String(model.defaultGraphRange));
}
</script>
<template>
  <div class="stack">
    <div>
      <a class="muted" :href="'#/'">‹ Zurück zur Übersicht</a>
      <h1 style="margin-top: 0.3rem">{{ t("nav.profile") }}</h1>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="profile-tabs" role="tablist" :aria-label="t('nav.profile')">
      <button
        v-for="(tab, index) in tabs"
        :id="`profile-tab-${tab.id}`"
        :key="tab.id"
        class="btn ghost"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.id"
        :aria-controls="`profile-panel-${tab.id}`"
        :tabindex="activeTab === tab.id ? 0 : -1"
        @click="activeTab = tab.id"
        @keydown="navigateTabs($event, index)"
      >{{ t(tab.label) }}</button>
    </div>
    <div

      v-if="visitedTabs.has('profile')"
      v-show="activeTab === 'profile'"
      id="profile-panel-profile"
      class="stack"
      role="tabpanel"
      aria-labelledby="profile-tab-profile"
      tabindex="0"
    >
      <section class="card stack">
        <h2>Profilbild</h2>
        <div class="profile-avatar-row">
          <img
            v-if="session.user?.hasAvatar"
            class="avatar-large"
            :src="'api/me/avatar?t=' + avatarVersion"
            alt="Avatar"
          />
          <div v-else class="avatar-placeholder">
            {{
              (session.user?.firstName ||
                session.user?.username ||
                "?")[0]?.toUpperCase()
            }}
          </div>
          <div class="stack">
            <div class="row">
              <button class="btn small" @click="avatarInput?.click()">
                Neues Bild hochladen</button
              ><button
                v-if="session.user?.hasAvatar"
                class="btn small ghost danger"
                @click="removeAvatar"
              >
                Bild entfernen
              </button>
            </div>
            <p class="muted" style="margin: 0">
              Erlaubt sind JPG, PNG, WebP und GIF bis max. 5 MB.
            </p>
          </div>
          <input
            ref="avatarInput"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            style="display: none"
            @change="avatar"
          />
        </div>
      </section>
      <form class="card stack" @submit.prevent="save">
        <h2>Persönliche Daten</h2>
        <Fields
          :fields="fields.filter((field) => field.key === 'username')"
          :model="model"
        />
        <div class="grid2">
          <Fields
            :fields="
              fields.filter((field) =>
                ['firstName', 'lastName'].includes(field.key),
              )
            "
            :model="model"
          />
        </div>
        <Fields
          :fields="
            ['bio', 'email'].flatMap((key) =>
              fields.filter((field) => field.key === key),
            )
          "
          :model="model"
        />
        <div><button class="btn" :disabled="busy">Profil speichern</button></div>
      </form>
      <section class="card stack">
        <h2>🔑 Passwort & Anmeldung</h2>
        <form class="stack" @submit.prevent="password">
          <label v-if="session.user?.hasPassword"
            >Aktuelles Passwort<input
              v-model="current"
              type="password"
              autocomplete="current-password"
              required /></label
          ><label
            >Neues Passwort<input
              v-model="next"
              type="password"
              autocomplete="new-password"
              minlength="8"
              required /></label
          ><label
            >{{ t("auth.passwordRepeat")
            }}<input
              v-model="repeat"
              type="password"
              autocomplete="new-password"
              minlength="8"
              required /></label
          ><button class="btn" :disabled="busy">Passwort ändern</button>
        </form>
      </section>
      <section v-if="session.user?.oidcEnabled" class="card stack">
        <h2>OIDC-Verknüpfung</h2>
        <template v-if="session.user?.oidcEnabled"
          ><p>
            OIDC: {{ session.user.hasOidc ? "Verknüpft" : "Nicht verknüpft" }} ·
            {{ session.user.oidcProviderName }}
          </p>
          <button
            v-if="session.user.hasOidc"
            class="btn ghost"
            @click="action('/me/unlink-oidc', 'POST')"
          >
            Verknüpfung aufheben</button
          ><a v-else class="btn ghost" href="auth/link"
            >OIDC verknüpfen</a
          ></template
        >
      </section>
      <section class="card stack danger-zone">
        <h2>🗑️ Konto löschen</h2>
        <p>{{ t("auth.deleteAccountConfirm") }}</p>
        <form class="stack" @submit.prevent="deleteRequest">
          <label v-if="session.user?.hasPassword"
            >Passwort<input
              v-model="deletePassword"
              type="password"
              autocomplete="current-password"
              required /></label
          ><label class="row"
            ><input v-model="deleteConfirm" type="checkbox" required />Ich möchte
            mein Konto löschen.</label
          ><button class="btn danger" :disabled="busy || !deleteConfirm">
            Bestätigungs-E-Mail anfordern
          </button>
        </form>
      </section>
    </div>
    <div

      v-if="visitedTabs.has('ui')"
      v-show="activeTab === 'ui'"
      id="profile-panel-ui"
      class="stack"
      role="tabpanel"
      aria-labelledby="profile-tab-ui"
      tabindex="0"
    >
      <section class="card stack">
        <h2>🌐 Sprache / Language</h2>
        <div class="theme-options">
          <button
            v-for="option in [
              {
                key: 'de',
                flag: '🇩🇪',
                title: 'Deutsch',
                description: 'Deutsche Benutzeroberfläche und Formatierung.',
              },
              {
                key: 'en',
                flag: '🇬🇧',
                title: 'English',
                description: 'English user interface and formatting.',
              },
            ] as const"
            :key="option.key"
            class="theme-option"
            style="font: inherit; text-align: left; color: var(--ink)"
            :class="{ active: language === option.key }"
            @click="chooseLanguage(option.key)"
          >
            <span class="theme-option-head"
              ><span class="theme-option-icon">{{ option.flag }}</span
              >{{ option.title }}</span
            >
            <span class="theme-option-desc">{{ option.description }}</span>
          </button>
        </div>
      </section>
      <section class="card stack">
        <h2>Erscheinungsbild / Farbschema</h2>
        <div class="theme-options">
          <button
            v-for="option in [
              {
                key: 'system',
                icon: '🌓',
                title: t('common.themeSystem'),
                description: 'Automatisch den Systemeinstellungen folgen.',
              },
              {
                key: 'light',
                icon: '☀️',
                title: 'Heller Modus',
                description: 'Helles, klares Farbschema für den Tag.',
              },
              {
                key: 'dark',
                icon: '🌙',
                title: 'Dunkler Modus',
                description:
                  'Augenschonendes, kontrastreiches dunkles Farbschema.',
              },
            ] as const"
            :key="option.key"
            class="theme-option"
            style="font: inherit; text-align: left; color: var(--ink)"
            :class="{ active: theme === option.key }"
            @click="theme = option.key"
          >
            <span class="theme-option-head"
              ><span class="theme-option-icon">{{ option.icon }}</span
              >{{ option.title }}</span
            >
            <span class="theme-option-desc">{{ option.description }}</span>
          </button>
        </div>
      </section>
      <form class="card stack" @submit.prevent="saveRange">
        <h2>Standard-Zeitraum für Graphen & Messverlauf</h2>
        <p class="muted" style="margin: 0">
          Lege fest, welcher Zeitraum beim Öffnen eines Aquariums standardmäßig in
          den Verlaufsgraphen und Messwert-Tabellen angezeigt werden soll
          (Standard: 3 Monate).
        </p>
        <div class="field">
          <label
            >Bevorzugter Standard-Zeitraum<select
              v-model="model.defaultGraphRange"
            >
              <option
                v-for="range in ['7', '14', '30', '90', '180', '365', 'all']"
                :key="range"
                :value="range"
              >
                {{ t("common.range" + (range === "all" ? "All" : range)) }}
              </option>
            </select></label
          >
        </div>
        <div>
          <button class="btn" :disabled="busy">
            Standard-Zeitraum speichern
          </button>
        </div>
      </form>
      <section class="card stack">
        <h2>🔔 Timer-Benachrichtigungen</h2>
        <div class="row">
          <button class="btn ghost" @click="notify()">Aktivieren</button
          ><button class="btn ghost" @click="notify(true)">
            3-Sekunden-Test
          </button>
        </div>
      </section>
    </div>
    <div

      v-if="visitedTabs.has('ai')"
      v-show="activeTab === 'ai'"
      id="profile-panel-ai"
      class="stack"
      role="tabpanel"
      aria-labelledby="profile-tab-ai"
      tabindex="0"
    >
      <section class="card stack">
        <h2>🤖 KI-Assistent</h2>
        <label
          >Bevorzugter Anbieter<select
            v-model="provider"
            @change="action('/me/ai', 'PUT', { provider })"
          >
            <option value="openai">OpenAI</option>
            <option value="gemini">Google Gemini</option>
            <option value="claude">Anthropic Claude</option>
          </select></label
        ><ProviderSettings
          provider="openai"
          title="OpenAI"
          :model="session.user?.openaiModel"
          :masked="session.user?.openaiKeyMasked"
          :key-set="session.user?.openaiKeySet"
        /><ProviderSettings
          provider="gemini"
          title="Google Gemini"
          :model="session.user?.geminiModel"
          :masked="session.user?.geminiKeyMasked"
          :key-set="session.user?.geminiKeySet"
        /><ProviderSettings
          provider="claude"
          title="Anthropic Claude"
          :model="session.user?.claudeModel"
          :masked="session.user?.claudeKeyMasked"
          :key-set="session.user?.claudeKeySet"
        />
      </section>
    </div>
    <div

      v-if="visitedTabs.has('tests')"
      v-show="activeTab === 'tests'"
      id="profile-panel-tests"
      class="stack"
      role="tabpanel"
      aria-labelledby="profile-tab-tests"
      tabindex="0"
    >
      <section class="card stack">
        <h2>🧪 Wassertests</h2>
        <TestSelection v-model="tests" />
        <button class="btn" :disabled="busy" @click="saveTests">
          {{ t("common.save") }}
        </button>
      </section>
      <TestInventory v-for="item in inventorySuites" :key="item.id" :suite-id="item.id" :selected-tests="item.keys" />
    </div>
    <div
      v-if="canShowInvites && visitedTabs.has('invites')"
      v-show="activeTab === 'invites'"
      id="profile-panel-invites"
      class="stack"
      role="tabpanel"
      aria-labelledby="profile-tab-invites"
      tabindex="0"
    >
      <Invitations />
    </div>
  </div>
</template>
