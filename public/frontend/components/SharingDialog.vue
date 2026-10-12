<script setup lang="ts">
import { onMounted, ref } from "vue";
import Modal from "./Modal.vue";
import { api } from "../api";
import { t, errorMessage, toast } from "../state";
import type { Share } from "../types";
const props = defineProps<{ id: string }>();
const emit = defineEmits<{ close: [] }>();
const shares = ref<Share[]>([]);
const username = ref("");
const role = ref("view");
const error = ref("");
const busy = ref(false);
onMounted(load);
async function load() {
  try {
    shares.value = await api(`/aquariums/${props.id}/shares`);
  } catch (e) {
    error.value = errorMessage(e);
  }
}
async function send() {
  busy.value = true;
  try {
    const result = await api<{ message?: string }>(
      `/aquariums/${props.id}/shares`,
      {
        method: "POST",
        body: { usernameOrEmail: username.value, role: role.value },
      },
    );
    toast(result.message || t("common.saved"));
    username.value = "";
    await load();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
async function action(share: Share, resend = false) {
  if (!resend && !confirm(t("detail.removeShare") + "?")) return;
  try {
    await api(
      `/aquariums/${props.id}/shares/${share.user_id}${resend ? "/resend" : ""}`,
      { method: resend ? "POST" : "DELETE" },
    );
    await load();
  } catch (e) {
    error.value = errorMessage(e);
  }
}
async function updateRole(share: Share, event: Event) {
  try {
    await api(`/aquariums/${props.id}/shares`, {
      method: "POST",
      body: {
        usernameOrEmail: share.username || share.email,
        role: (event.target as HTMLSelectElement).value,
      },
    });
    await load();
  } catch (e) {
    error.value = errorMessage(e);
  }
}
</script>
<template>
  <Modal :title="t('detail.shareModalTitle')" wide @close="emit('close')"
    ><div class="stack">
      <h3>{{ t("detail.activeShares") }}</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Benutzer</th>
              <th>{{ t("detail.shareRole") }}</th>
              <th>{{ t("common.status") }}</th>
              <th>{{ t("common.actions") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="share in shares" :key="share.user_id">
              <td>{{ share.username || share.email }}</td>
              <td>
                <select
                  :value="share.role"
                  aria-label="Berechtigung ändern"
                  @change="updateRole(share, $event)"
                >
                  <option value="view">Lesen</option>
                  <option value="write">Schreiben</option>
                </select>
              </td>
              <td>{{ share.status }}</td>
              <td>
                <button
                  v-if="share.status === 'pending'"
                  class="btn small ghost"
                  @click="action(share, true)"
                >
                  Erneut senden</button
                ><button class="btn small ghost danger" @click="action(share)">
                  {{ t("detail.removeShare") }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <form class="stack" @submit.prevent="send">
        <label
          >{{ t("auth.username") }} / {{ t("auth.email")
          }}<input v-model="username" required /></label
        ><label
          >{{ t("detail.shareRole")
          }}<select v-model="role">
            <option value="view">{{ t("detail.roleView") }}</option>
            <option value="write">{{ t("detail.roleWrite") }}</option>
          </select></label
        >
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <button class="btn" :disabled="busy">{{ t("detail.shareBtn") }}</button>
      </form>
    </div></Modal
  >
</template>
