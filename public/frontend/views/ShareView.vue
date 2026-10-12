<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../api";
import { session, t, errorMessage } from "../state";
import type { Share } from "../types";
const props = defineProps<{ token: string }>();
const info = ref<Share>();
const error = ref("");
const busy = ref(false);
onMounted(async () => {
  try {
    if (!props.token) throw new Error("Ungültiger Link.");
    info.value = await api(`/shares/invite/${encodeURIComponent(props.token)}`);
  } catch (e) {
    error.value = errorMessage(e);
  }
});
async function action(accept: boolean) {
  if (!accept && !confirm(t("aquariums.declineInvite") + "?")) return;
  busy.value = true;
  try {
    const result = await api<{ aquarium_id: string }>(
      `/shares/${accept ? "accept" : "decline"}`,
      { method: "POST", body: { token: props.token } },
    );
    location.hash = accept ? `#/a/${result.aquarium_id}` : "#/";
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="auth">
    <div class="card stack">
      <div style="text-align: center">
        <img
          src="icon-192.png"
          alt="Logo"
          style="width: 64px; height: 64px; border-radius: 14px"
        />
        <h1>🐠 Aquarium-Freigabe</h1>
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <template v-if="info"
        ><p class="muted">
          {{ info.owner_username }} hat ein Aquarium mit dir geteilt
        </p>
        <div class="compat-box info stack">
          <strong>{{ info.aquarium_name }}</strong
          ><span>{{
            info.role === "write" ? t("detail.roleWrite") : t("detail.roleView")
          }}</span>
        </div>
        <div v-if="session.user" class="row between">
          <button class="btn ghost" :disabled="busy" @click="action(false)">
            {{ t("aquariums.declineInvite") }}</button
          ><button class="btn" :disabled="busy" @click="action(true)">
            {{ t("aquariums.acceptInvite") }}
          </button>
        </div>
        <template v-else
          ><p>Bitte melde dich an, um die Freigabe anzunehmen.</p>
          <a class="btn" href="#/">{{ t("auth.loginBtn") }}</a
          ><a class="btn ghost" href="#/register">{{
            t("auth.registerBtn")
          }}</a></template
        ></template
      >
    </div>
  </div>
</template>
