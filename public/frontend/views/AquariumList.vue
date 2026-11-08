<script setup lang="ts">
import { lazyComponent } from "../composables/lazy-component";
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { api } from "../api";
import { registerMessages, t, session, fmtDate, fmtDay, errorMessage, language } from "../state";
import { isUnsynced } from "../composables/sync-status";
import SyncBadge from "../components/SyncBadge.vue";
import { askConfirm } from "../dialog";
import featuresDe from "../../locales/features.de.json";
import featuresEn from "../../locales/features.en.json";
import type { Aquarium, Share, Id } from "../types";
registerMessages({ de: featuresDe, en: featuresEn });
const AquariumForm = lazyComponent(() => import("../components/AquariumForm.vue"));
const list = ref<Aquarium[]>([]);
const pending = ref<Share[]>([]);
const error = ref("");
const loading = ref(true);
const creating = ref(false);
const tab = ref(localStorage.getItem("aquarium_list_tab") || "own");
const own = computed(() => list.value.filter((a) => a.role === "owner"));
const shared = computed(() => list.value.filter((a) => a.role !== "owner"));
const shown = computed(() => (tab.value === "own" ? own.value : shared.value));
watch(tab, (value) => localStorage.setItem("aquarium_list_tab", value));
watch(language, load);
onMounted(() => {
  void load();
  window.addEventListener('aquarium-synchronized', load);
});
onBeforeUnmount(() => window.removeEventListener('aquarium-synchronized', load));
async function load() {
  try {
    [list.value, pending.value] = await Promise.all([
      api<Aquarium[]>("/aquariums"),
      api<Share[]>("/shares/pending"),
    ]);
    error.value = "";
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
function status(a: Aquarium) {
  return a.open_crit
    ? "crit"
    : a.open_warn ||
        a.overdue ||
        a.measure_cycle_status?.is_due
      ? "warn"
      : a.last_measured_at
        ? "ok"
        : "none";
}
async function invitation(share: Share, accept: boolean) {
  if (!accept && !await askConfirm({ title: t("confirmTexts.declineInviteTitle"), message: t("confirmTexts.declineInviteText"), confirmLabel: t("confirmTexts.decline") })) return;
  try {
    await api(`/shares/${accept ? "accept" : "decline"}`, {
      method: "POST",
      body: { aquarium_id: share.aquarium_id },
    });
    await load();
  } catch (e) {
    error.value = errorMessage(e);
  }
}
// "Getting started" checklist for new accounts; it disappears once everything is done or it was hidden.
const onboardingKey = computed(() => `aquarium_onboarding_hidden:${session.user?.id || ""}`);
const onboardingHidden = ref(false);
watch(onboardingKey, (key) => { try { onboardingHidden.value = localStorage.getItem(key) === "1"; } catch { onboardingHidden.value = false; } }, { immediate: true });
function hideOnboarding() {
  onboardingHidden.value = true;
  try { localStorage.setItem(onboardingKey.value, "1"); } catch { /* Nur für diese Sitzung ausblenden. */ }
}
const onboarding = computed(() => {
  const first = own.value[0];
  const target = (suffix: string) => (first ? `#/a/${first.id}${suffix}` : undefined);
  return [
    { id: "create", label: "aquariumList.stepCreate", done: own.value.length > 0, href: undefined },
    { id: "measure", label: "aquariumList.stepMeasure", done: own.value.some((a) => a.last_measured_at), href: target("/messen") },
    { id: "cycle", label: "aquariumList.stepCycle", done: own.value.some((a) => a.measure_cycle_status?.configured || Number(a.measure_cycle_interval) > 0), href: target("?tab=tasks") },
    { id: "care", label: "aquariumList.stepCare", done: own.value.some((a) => a.last_water_change_at || a.last_fertilized_at), href: target("?tab=log") },
  ];
});
const onboardingDone = computed(() => onboarding.value.filter((step) => step.done).length);
const showOnboarding = computed(() => !loading.value && !error.value && tab.value === "own" && !onboardingHidden.value && onboardingDone.value < onboarding.value.length);
function saved(id: Id) {
  creating.value = false;
  location.hash = `#/a/${id}`;
}
</script>
<template>
  <div class="stack">
    <div class="row between" style="align-items: center">
      <h1 style="margin: 0">{{ t("aquariums.title") }}</h1>
      <button class="btn" @click="creating = true">
        {{ t("aquariums.newAquariumBtn") }}
      </button>
    </div>
    <div class="nav-tabs" role="group" :aria-label="t('aquariums.title')">
      <button
        class="nav-tab-btn"
        :class="{ active: tab === 'own' }"
        :aria-pressed="tab === 'own'"
        @click="tab = 'own'"
      >
        {{ t("aquariums.tabMine") }}
        <span class="tab-badge">{{ own.length }}</span></button
      ><button
        class="nav-tab-btn"
        :class="{ active: tab === 'shared' }"
        :aria-pressed="tab === 'shared'"
        @click="tab = 'shared'"
      >
        {{ t("aquariums.tabShared") }}
        <span class="tab-badge"
          >{{ shared.length
          }}{{ pending.length ? ` (+${pending.length})` : "" }}</span
        >
      </button>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="loading" class="muted">{{ t("common.loading") }}</p>
    <section v-if="showOnboarding" class="card stack onboarding" data-onboarding :aria-labelledby="'onboarding-title'">
      <div class="row between">
        <h2 id="onboarding-title" style="margin: 0">{{ t("aquariumList.onboardingTitle") }}</h2>
        <button type="button" class="btn small ghost" @click="hideOnboarding">{{ t("aquariumList.onboardingHide") }}</button>
      </div>
      <p class="muted" style="margin: 0">{{ t("aquariumList.onboardingIntro") }}</p>
      <progress :value="onboardingDone" :max="onboarding.length" :aria-label="t('aquariumList.onboardingProgress', { done: onboardingDone, total: onboarding.length })"></progress>
      <ol>
        <li v-for="(step, index) in onboarding" :key="step.id" :class="{ done: step.done }">
          <span class="onboarding-check" aria-hidden="true">{{ step.done ? "✓" : index + 1 }}</span>
          <span class="onboarding-text">{{ t(step.label) }}<span class="visually-hidden"> – {{ t(step.done ? "aquariumList.stepDone" : "aquariumList.stepStart") }}</span></span>
          <template v-if="!step.done">
            <button v-if="step.id === 'create'" type="button" class="btn small" @click="creating = true">{{ t("aquariumList.stepStart") }}</button>
            <a v-else-if="step.href" class="btn small ghost" :href="step.href">{{ t("aquariumList.stepStart") }}</a>
          </template>
        </li>
      </ol>
    </section>
    <section
      v-if="tab === 'shared' && pending.length"
      class="pending-shares-box stack"
    >
      <h3>✉️ {{ t("aquariums.sharedPendingBadge") }}</h3>
      <div
        v-for="share in pending"
        :key="share.aquarium_id"
        class="pending-share-item"
      >
        <div>
          <strong>{{ share.aquarium_name }}</strong>
          <div class="muted">{{ share.owner_username }} · {{ share.role }}</div>
        </div>
        <div class="row">
          <button class="btn small" @click="invitation(share, true)">
            {{ t("aquariums.acceptInvite") }}</button
          ><button class="btn small ghost" @click="invitation(share, false)">
            {{ t("aquariums.declineInvite") }}
          </button>
        </div>
      </div>
    </section>
    <div v-if="shown.length" class="aq-list">
      <a
        v-for="a in shown"
        :key="a.id"
        class="card aq-card"
        :class="`s-${status(a)}`"
        :href="`#/a/${a.id}`"
        ><img v-server-image
          v-if="a.has_image"
          class="aq-card-img"
          :src="`api/aquariums/${a.id}/image`"
          :alt="a.name"
          loading="lazy"
        />
        <h2>{{ a.name }}</h2>
        <div v-if="a.motto" class="aq-motto">{{ a.motto }}</div>
        <div class="muted">
          {{ session.config?.waterTypes[a.water_type] || a.water_type
          }}{{ a.volume_l ? ` · ${a.volume_l} l` : "" }}
        </div>
        <div class="row" style="margin-top: 0.6rem">
          <span v-if="a.open_crit" class="chip crit"
            >{{ a.open_crit }} {{ t("common.statusCrit") }}</span
          ><span v-if="a.open_warn" class="chip warn"
            >{{ a.open_warn }} {{ t("common.statusWarn") }}</span
          ><span
            v-if="a.overdue || a.measure_cycle_status?.is_due"
            class="chip warn"
            >{{ t("aquariumList.measureDue") }}</span
          ><span v-if="status(a) === 'ok'" class="chip ok">{{
            t("common.statusOk")
          }}</span
          ><span v-if="!a.last_measured_at" class="chip none"
            >{{ t("aquariumList.noMeasurement") }}</span
          ><span v-if="a.last_fertilized_at" class="chip ok"
            >{{ t("aquariumList.fertilized", { date: fmtDay(a.last_fertilized_at) }) }}</span
          ><span v-if="a.last_water_change_at" class="chip ok"
            >{{ t("aquariumList.waterChange", { date: fmtDay(a.last_water_change_at), percent: a.last_water_change_percent ?? "–" }) }}</span
          ><span v-if="a.role !== 'owner'" class="chip none"
            >{{ a.owner_username }} ·
            {{ a.role === "write" ? t("aquariumList.roleWrite") : t("aquariumList.roleView") }}</span
          ><span v-else-if="a.shares_count" class="chip none"
            >{{ t("aquariumList.shared", { count: a.shares_count }) }}</span
          ><SyncBadge :show="isUnsynced(a.id, `/aquariums/${a.id}`)" />
        </div>
        <div v-if="a.last_measured_at" class="muted" style="margin-top: 0.4rem">
          {{ t("aquariumList.lastMeasured", { date: fmtDate(a.last_measured_at) }) }}
        </div></a
      >
    </div>
    <div v-else-if="!loading" class="card stack">
      <h2>
        {{ t(tab === "own" ? "aquariums.emptyMine" : "aquariums.emptyShared") }}
      </h2>
      <p>
        {{
          t(
            tab === "own"
              ? "aquariums.emptyMineDesc"
              : "aquariums.emptySharedDesc",
          )
        }}
      </p>
      <div v-if="tab === 'own'">
        <button class="btn" @click="creating = true">
          {{ t("aquariums.newAquariumBtn") }}
        </button>
      </div>
    </div>
    <AquariumForm v-if="creating" @close="creating = false" @saved="saved" />
  </div>
</template>
