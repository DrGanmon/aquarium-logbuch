<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { api } from "../api";
import { session, t, errorMessage, toast, language } from "../state";
import { resolveTests } from "../composables/test-selection";
import { parseNumber } from "../composables/values";
import {
  evaluateTapWaterValue,
  getTapWaterWarning,
  getTapWaterWarnings,
  type TapWaterData,
} from "../../../src/shared/tap-water";
import type { Parameter } from "../types";

const emit = defineEmits<{
  (e: "switch-tab", tabId: string): void;
}>();

const busy = ref(false);
const error = ref("");
const note = ref("");
const measuredAt = ref("");
const values = reactive<Record<string, string>>({});

const selectedSuiteId = computed(() =>
  session.config?.userPreferences.selectedSuite || session.config?.currentSuite.id || "jbl-pro"
);

const currentSuite = computed(() =>
  session.config?.suites.find((s) => s.id === selectedSuiteId.value) || session.config?.currentSuite
);

const userTests = computed(() => {
  const selection = session.config?.userPreferences.selectedTests;
  if (selection && selection.length > 0) {
    return resolveTests(session.config?.suites || [], selection);
  }
  return currentSuite.value?.tests || [];
});

const visibleTests = computed<Parameter[]>(() => {
  const list: Parameter[] = [...userTests.value];
  const keys = new Set(list.map((item) => item.key));

  // Falls in der Suite weitere Tests definiert sind, die nicht explizit gewählt wurden,
  // aber für Leitungswasser relevant sind oder Werte haben:
  if (currentSuite.value?.tests) {
    for (const test of currentSuite.value.tests) {
      if (!keys.has(test.key)) {
        list.push(test);
        keys.add(test.key);
      }
    }
  }

  // Falls bereits Werte für Parameter gespeichert sind, die in der Suite fehlen:
  for (const key of Object.keys(values)) {
    if (values[key] && !keys.has(key)) {
      const known = session.config?.allParameters?.find((p) => p.key === key) ||
        session.config?.parameters?.find((p) => p.key === key);
      if (known) {
        list.push(known);
        keys.add(key);
      } else {
        list.push({
          key,
          name: key.toUpperCase(),
          unit: "",
          decimals: 1,
          step: 0.1,
          min: 0,
          max: 999,
          wait: 0,
        });
        keys.add(key);
      }
    }
  }

  return list;
});

const numericValues = computed(() => {
  const result: Record<string, number> = {};
  for (const [key, val] of Object.entries(values)) {
    if (!val || !val.trim()) continue;
    const parsed = parseNumber(val);
    if (parsed !== null && Number.isFinite(parsed)) {
      result[key] = parsed;
    }
  }
  return result;
});

const activeWarnings = computed(() =>
  getTapWaterWarnings(numericValues.value, language.value)
);

const hasEnteredValues = computed(() =>
  Object.keys(numericValues.value).length > 0
);

function populateFromData(data: TapWaterData | null | undefined) {
  for (const key of Object.keys(values)) {
    delete values[key];
  }
  note.value = data?.note || "";
  measuredAt.value = data?.measuredAt || data?.measured_at || "";
  if (data?.values && typeof data.values === "object") {
    for (const [k, v] of Object.entries(data.values)) {
      if (v != null && Number.isFinite(v)) {
        values[k] = String(v);
      }
    }
  }
}

onMounted(() => {
  if (session.user?.tapWater) {
    populateFromData(session.user.tapWater);
  } else {
    void loadTapWater();
  }
});

watch(
  () => session.user?.tapWater,
  (val) => {
    if (val !== undefined) {
      populateFromData(val);
    }
  }
);

async function loadTapWater() {
  try {
    const res = await api<{ tapWater: TapWaterData | null }>("/me/tap-water");
    if (res.tapWater !== undefined) {
      populateFromData(res.tapWater);
      if (session.user) {
        session.user.tapWater = res.tapWater;
      }
    }
  } catch {
    // Stilles Ignorieren beim Laden
  }
}

async function save() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const payload = {
      values: numericValues.value,
      note: note.value.trim() || null,
      measuredAt: measuredAt.value || null,
    };
    const res = await api<{ ok: boolean; tapWater: TapWaterData | null; message?: string }>(
      "/me/tap-water",
      {
        method: "PUT",
        body: payload,
      }
    );
    if (session.user) {
      session.user.tapWater = res.tapWater;
    }
    toast(res.message || t("common.saved"));
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}

async function clearValues() {
  if (busy.value) return;
  if (!confirm(t("profile.tapWater.clearConfirm"))) return;
  busy.value = true;
  error.value = "";
  try {
    const res = await api<{ ok: boolean; message?: string }>("/me/tap-water", {
      method: "DELETE",
    });
    populateFromData(null);
    if (session.user) {
      session.user.tapWater = null;
    }
    toast(res.message || t("common.saved"));
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}

function getParamStatus(key: string): 'ok' | 'warn' | 'crit' | 'none' {
  const val = parseNumber(values[key] || "");
  if (val === null) return "none";
  return evaluateTapWaterValue(key, val);
}

function getParamWarning(key: string) {
  const val = parseNumber(values[key] || "");
  if (val === null) return null;
  return getTapWaterWarning(key, val, language.value);
}
</script>

<template>
  <section class="card stack tap-water-settings">
    <div class="header-row">
      <div>
        <h2>{{ t("profile.tapWater.title") }}</h2>
        <p class="muted" style="margin-top: 0.2rem">
          {{ t("profile.tapWater.desc") }}
        </p>
      </div>
    </div>

    <div class="suite-badge-row">
      <span class="chip">
        🧪 {{ t("profile.tapWater.suiteInfo", { suite: currentSuite?.name || selectedSuiteId }) }}
      </span>
      <button
        type="button"
        class="btn ghost small"
        @click="emit('switch-tab', 'tests')"
      >
        {{ t("nav.tests") }} {{ t("common.edit") }} ↗
      </button>
    </div>

    <!-- Alert / Status Summary Banner -->
    <div v-if="activeWarnings.length > 0" class="tap-water-banner crit" role="alert">
      <div class="banner-head">
        <strong>{{ t("profile.tapWater.warningBannerTitle", { count: activeWarnings.length }) }}</strong>
      </div>
      <ul class="warning-list">
        <li v-for="w in activeWarnings" :key="w.key" :class="w.level">
          <span class="chip" :class="w.level === 'crit' ? 'crit' : 'warn'">
            {{ w.level === 'crit' ? '❌' : '⚠️' }} {{ visibleTests.find(p => p.key === w.key)?.name || w.key.toUpperCase() }} ({{ w.value }} {{ visibleTests.find(p => p.key === w.key)?.unit }})
          </span>
          <span class="warning-text">{{ w.message }}</span>
        </li>
      </ul>
    </div>
    <div v-else-if="hasEnteredValues" class="tap-water-banner ok">
      <span>{{ t("profile.tapWater.safeBanner") }}</span>
    </div>
    <p v-else class="muted empty-hint">
      {{ t("profile.tapWater.emptyNotice") }}
    </p>

    <!-- Parameter Input Grid -->
    <form class="stack" @submit.prevent="save">
      <div class="tap-water-grid">
        <div
          v-for="test in visibleTests"
          :key="test.key"
          class="param-card"
          :class="{
            'is-crit': getParamStatus(test.key) === 'crit',
            'is-warn': getParamStatus(test.key) === 'warn',
            'is-ok': getParamStatus(test.key) === 'ok',
          }"
        >
          <div class="param-head">
            <label :for="`tap-${test.key}`" class="param-title">
              {{ test.name }}
            </label>
            <span
              v-if="getParamStatus(test.key) !== 'none'"
              class="chip small"
              :class="{
                crit: getParamStatus(test.key) === 'crit',
                warn: getParamStatus(test.key) === 'warn',
                ok: getParamStatus(test.key) === 'ok',
              }"
            >
              {{
                getParamStatus(test.key) === 'crit'
                  ? t('profile.tapWater.statusCrit')
                  : getParamStatus(test.key) === 'warn'
                  ? t('profile.tapWater.statusWarn')
                  : t('profile.tapWater.statusOk')
              }}
            </span>
          </div>

          <div class="param-input-row">
            <input
              :id="`tap-${test.key}`"
              v-model="values[test.key]"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              :placeholder="test.hint || '–'"
              :aria-label="test.name"
            />
            <span class="param-unit muted">{{ test.unit }}</span>
          </div>

          <!-- Parameter-spezifischer Gefahrenhinweis -->
          <p
            v-if="getParamWarning(test.key)"
            class="param-warning-msg"
            :class="getParamWarning(test.key)?.level"
          >
            {{ getParamWarning(test.key)?.level === 'crit' ? '❌' : '⚠️' }}
            {{ getParamWarning(test.key)?.message }}
          </p>
        </div>
      </div>

      <!-- Additional fields: Measured date & Note -->
      <div class="row wrap-inputs" style="margin-top: 1rem">
        <label style="flex: 1; min-width: 200px">
          {{ t("profile.tapWater.measuredAtLabel") }}
          <input v-model="measuredAt" type="date" />
        </label>
        <label style="flex: 2; min-width: 280px">
          {{ t("profile.tapWater.noteLabel") }}
          <input
            v-model="note"
            type="text"
            maxlength="500"
            :placeholder="t('profile.tapWater.notePlaceholder')"
          />
        </label>
      </div>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <div class="row action-buttons">
        <button class="btn" type="submit" :disabled="busy">
          {{ t("profile.tapWater.saveBtn") }}
        </button>
        <button
          v-if="hasEnteredValues || note || measuredAt"
          class="btn ghost danger"
          type="button"
          :disabled="busy"
          @click="clearValues"
        >
          {{ t("profile.tapWater.clearBtn") }}
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.tap-water-settings {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

.suite-badge-row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-wrap: wrap;
}

.tap-water-banner {
  padding: 0.8rem 1rem;
  border-radius: 8px;
  border: 1px solid var(--border-color, #333);
}

.tap-water-banner.crit {
  background: rgba(220, 53, 69, 0.12);
  border-color: rgba(220, 53, 69, 0.4);
  color: var(--text-color, #eee);
}

.tap-water-banner.ok {
  background: rgba(40, 167, 69, 0.12);
  border-color: rgba(40, 167, 69, 0.4);
  color: var(--ok-color, #28a745);
  font-weight: 500;
}

.warning-list {
  list-style: none;
  padding: 0;
  margin: 0.6rem 0 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.warning-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  font-size: 0.9rem;
  flex-wrap: wrap;
}

.warning-text {
  flex: 1;
  min-width: 200px;
}

.tap-water-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
}

.param-card {
  padding: 0.8rem;
  border-radius: 6px;
  background: var(--surface-bg, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  transition: border-color 0.2s ease;
}

.param-card.is-crit {
  border-color: rgba(220, 53, 69, 0.6);
  background: rgba(220, 53, 69, 0.05);
}

.param-card.is-warn {
  border-color: rgba(255, 193, 7, 0.6);
  background: rgba(255, 193, 7, 0.05);
}

.param-card.is-ok {
  border-color: rgba(40, 167, 69, 0.3);
}

.param-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.param-title {
  font-weight: 600;
  font-size: 0.95rem;
  margin: 0;
}

.param-input-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.param-input-row input {
  flex: 1;
  min-width: 0;
}

.param-unit {
  font-size: 0.85rem;
  white-space: nowrap;
}

.param-warning-msg {
  font-size: 0.8rem;
  line-height: 1.3;
  margin: 0.2rem 0 0 0;
}

.param-warning-msg.crit {
  color: var(--crit-color, #e63946);
}

.param-warning-msg.warn {
  color: var(--warn-color, #ffb703);
}

.wrap-inputs {
  gap: 1rem;
}

.action-buttons {
  margin-top: 0.5rem;
  gap: 0.8rem;
}

.empty-hint {
  font-style: italic;
}
</style>
