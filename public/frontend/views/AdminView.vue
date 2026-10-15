<script setup lang="ts">
import { lazyComponent } from "../composables/lazy-component";
import { computed, ref } from "vue";
import { t } from "../state";
const AdminPanel = lazyComponent(() => import("../components/AdminPanel.vue"));
const tabs = [
  { id: "users", label: "admin.tabs.users", sections: ["users"] },
  { id: "metrics", label: "admin.tabs.metrics", sections: ["metrics"] },
  {
    id: "registration",
    label: "admin.tabs.registration",
    sections: ["registration"],
  },
  {
    id: "settings",
    label: "admin.tabs.settings",
    sections: ["legal-config", "mail"],
  },
  { id: "backups", label: "admin.tabs.backups", sections: ["backups"] },
  { id: "logs", label: "admin.tabs.logs", sections: ["logs"] },
];
const activeTab = ref("users");
const activeSections = computed(
  () => tabs.find((tab) => tab.id === activeTab.value)?.sections || [],
);
function navigateTabs(event: KeyboardEvent, index: number) {
  let next: number;
  switch (event.key) {
    case "ArrowRight":
      next = (index + 1) % tabs.length;
      break;
    case "ArrowLeft":
      next = (index + tabs.length - 1) % tabs.length;
      break;
    case "Home":
      next = 0;
      break;
    case "End":
      next = tabs.length - 1;
      break;
    default:
      return;
  }
  event.preventDefault();
  activeTab.value = tabs[next]!.id;
  const tablist = (event.currentTarget as HTMLElement).parentElement;
  tablist?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
}
</script>
<template>
  <div class="stack">
    <div>
      <a class="muted" :href="'#/'">‹ {{ t("common.back") }}</a>
      <h1 style="margin-top: 0.3rem">{{ t("admin.title") }}</h1>
    </div>
    <div class="admin-tabs" role="tablist" :aria-label="t('admin.title')">
      <button
        v-for="(tab, index) in tabs"
        :id="`admin-tab-${tab.id}`"
        :key="tab.id"
        class="btn ghost"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.id"
        :aria-controls="`admin-panel-${tab.id}`"
        :tabindex="activeTab === tab.id ? 0 : -1"
        @click="activeTab = tab.id"
        @keydown="navigateTabs($event, index)"
      >
        {{ t(tab.label) }}
      </button>
    </div>
    <div
      :id="`admin-panel-${activeTab}`"
      class="stack"
      role="tabpanel"
      :aria-labelledby="`admin-tab-${activeTab}`"
      tabindex="0"
    >
      <AdminPanel
        v-for="section in activeSections"
        :key="section"
        :section="section"
      />
    </div>
  </div>
</template>
