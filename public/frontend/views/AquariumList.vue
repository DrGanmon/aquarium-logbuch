<script setup lang="ts">
import { lazyComponent } from "../composables/lazy-component";
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { api } from "../api";
import { t, session, fmtDate, errorMessage, language } from "../state";
import type { Aquarium, Share, Id } from "../types";
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
  if (!accept && !confirm(t("aquariums.declineInvite") + "?")) return;
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
    <div class="nav-tabs">
      <button
        class="nav-tab-btn"
        :class="{ active: tab === 'own' }"
        @click="tab = 'own'"
      >
        {{ t("aquariums.tabMine") }}
        <span class="tab-badge">{{ own.length }}</span></button
      ><button
        class="nav-tab-btn"
        :class="{ active: tab === 'shared' }"
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
        ><img
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
            >🧪 Messung fällig</span
          ><span v-if="status(a) === 'ok'" class="chip ok">{{
            t("common.statusOk")
          }}</span
          ><span v-if="!a.last_measured_at" class="chip none"
            >noch keine Messung</span
          ><span v-if="a.last_fertilized_at" class="chip ok"
            >🌿 {{ fmtDate(a.last_fertilized_at) }}</span
          ><span v-if="a.last_water_change_at" class="chip ok"
            >💧 WW: {{ fmtDate(a.last_water_change_at) }} ({{
              a.last_water_change_percent
            }}%)</span
          ><span v-if="a.role !== 'owner'" class="chip none"
            >{{ a.owner_username }} ·
            {{ a.role === "write" ? "Schreiben" : "Lesen" }}</span
          ><span v-else-if="a.shares_count" class="chip none"
            >Geteilt ({{ a.shares_count }})</span
          >
        </div>
        <div v-if="a.last_measured_at" class="muted" style="margin-top: 0.4rem">
          Zuletzt gemessen: {{ fmtDate(a.last_measured_at) }}
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
