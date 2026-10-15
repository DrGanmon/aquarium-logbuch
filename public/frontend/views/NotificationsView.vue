<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../api";
import { errorMessage, fmtDate, t, toast } from "../state";

interface SocialNotification {
  id: number; type: "like" | "comment"; post_id: number; actor_username: string;
  post_text: string; created_at: string; read_at: string | null;
}
interface WaterNotification {
  id: number; aquariumId: number; aquariumName: string; message: string; level: "warn" | "crit"; created_at: string;
}
const social = ref<SocialNotification[]>([]);
const water = ref<WaterNotification[]>([]);
const loading = ref(true);
const busy = ref(false);

async function load() {
  loading.value = true;
  try {
    const result = await api<{ social: SocialNotification[]; water: WaterNotification[] }>("/notifications");
    social.value = result.social; water.value = result.water;
  } catch (error) { toast(errorMessage(error)); }
  finally { loading.value = false; }
}
async function markRead(ids?: number[]) {
  busy.value = true;
  try {
    await api("/notifications/read", { method: "POST", body: ids ? { ids } : {} });
    const selected = ids ? new Set(ids) : null;
    social.value = social.value.map(item => !selected || selected.has(item.id) ? { ...item, read_at: new Date().toISOString() } : item);
    window.dispatchEvent(new Event("notifications-updated"));
  } catch (error) { toast(errorMessage(error)); }
  finally { busy.value = false; }
}
async function acknowledge(item: WaterNotification) {
  busy.value = true;
  try {
    await api(`/aquariums/${item.aquariumId}/alerts/ack`, { method: "POST", body: { ids: [item.id] } });
    water.value = water.value.filter(alert => !(alert.aquariumId === item.aquariumId && alert.id === item.id));
    window.dispatchEvent(new Event("notifications-updated"));
  } catch (error) { toast(errorMessage(error)); }
  finally { busy.value = false; }
}
function socialText(item: SocialNotification) {
  return t(item.type === "comment" ? "notifications.commented" : "notifications.liked", { username: item.actor_username });
}
onMounted(load);
</script>

<template>
  <section class="page-shell">
    <div class="section-heading">
      <div><h1>🔔 {{ t("notifications.title") }}</h1><p class="muted">{{ t("notifications.intro") }}</p></div>
      <a class="btn ghost" href="#/">{{ t("common.back") }}</a>
    </div>
    <p v-if="loading" class="muted" role="status">{{ t("common.loading") }}</p>
    <template v-else>
      <section class="card">
        <div class="section-heading">
          <h2>{{ t("notifications.socialTitle") }}</h2>
          <button v-if="social.some(item => !item.read_at)" class="btn small ghost" type="button" :disabled="busy" @click="markRead()">{{ t("notifications.markAllRead") }}</button>
        </div>
        <p v-if="!social.length" class="muted">{{ t("notifications.noSocial") }}</p>
        <article v-for="item in social" :key="item.id" class="notification-item" :class="{ unread: !item.read_at }">
          <div><strong>{{ socialText(item) }}</strong><p v-if="item.post_text" class="muted">{{ item.post_text }}</p><small>{{ fmtDate(item.created_at) }}</small></div>
          <div class="button-row"><a class="btn small ghost" :href="`#/social/${item.post_id}`" @click="!item.read_at && markRead([item.id])">{{ t("notifications.openPost") }}</a><button v-if="!item.read_at" class="btn small ghost" type="button" :disabled="busy" @click="markRead([item.id])">{{ t("notifications.markRead") }}</button></div>
        </article>
      </section>
      <section class="card">
        <h2>{{ t("notifications.waterTitle") }}</h2>
        <p v-if="!water.length" class="muted">{{ t("notifications.noWater") }}</p>
        <article v-for="item in water" :key="`${item.aquariumId}-${item.id}`" class="notification-item" :class="item.level">
          <div><strong>{{ item.aquariumName }}</strong><p>{{ item.message }}</p><small>{{ fmtDate(item.created_at) }}</small></div>
          <div class="button-row"><a class="btn small ghost" :href="`#/a/${item.aquariumId}`">{{ t("notifications.openAquarium") }}</a><button class="btn small ghost" type="button" :disabled="busy" @click="acknowledge(item)">{{ t("notifications.acknowledge") }}</button></div>
        </article>
      </section>
    </template>
  </section>
</template>

<style scoped>
.notification-item { display: flex; justify-content: space-between; gap: 1rem; padding: 1rem 0; border-top: 1px solid var(--border); }
.notification-item.unread { border-left: .3rem solid var(--accent); padding-left: .75rem; }
.notification-item.crit { border-left: .3rem solid var(--danger); padding-left: .75rem; }
.notification-item.warn { border-left: .3rem solid var(--warning); padding-left: .75rem; }
.notification-item p { margin: .35rem 0; }
@media (max-width: 640px) { .notification-item { flex-direction: column; } }
</style>
