<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { api } from "../api";
import { t, errorMessage, fmtDate, toast } from "../state";
import type { Id } from "../types";
interface Invitation {
  id: Id;
  code: string;
  type: string;
  email?: string;
  usedCount: number;
  maxUses: number;
  expiresAt: string;
  status: string;
}
const props = defineProps<{ admin?: boolean }>();
const list = ref<Invitation[]>([]);
const model = reactive({
  type: "code",
  email: "",
  days: 7,
  maxUses: 1,
  note: "",
  code: "",
});
const error = ref("");
const busy = ref(false);
const endpoint = props.admin ? "/admin/invitations" : "/me/invitations";
onMounted(load);
async function load() {
  try {
    const result = await api<{ invitations: Invitation[] }>(
      props.admin ? "/admin/registration" : "/me/invitations",
    );
    list.value = result.invitations;
  } catch (e) {
    error.value = errorMessage(e);
  }
}
async function send() {
  if (busy.value) return;
  busy.value = true;
  try {
    const result = await api<{ message?: string }>(endpoint, {
      method: "POST",
      body: model,
    });
    toast(result.message || t("common.saved"));
    await load();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
async function remove(id: Id) {
  if (!confirm("Einladung widerrufen?")) return;
  try {
    await api(`${endpoint}/${id}`, { method: "DELETE" });
    await load();
  } catch (e) {
    error.value = errorMessage(e);
  }
}
async function copy(inv: Invitation) {
  const url = new URL(
    `#/register?invite=${encodeURIComponent(inv.code)}${inv.email ? "&email=" + encodeURIComponent(inv.email) : ""}`,
    document.baseURI,
  ).href;
  try {
    await navigator.clipboard.writeText(url);
    toast(t("common.copied"));
  } catch {
    prompt("Einladungslink:", url);
  }
}
</script>
<template>
  <section class="card stack">
    <h2>✉️ Einladungen</h2>
    <form class="stack" @submit.prevent="send">
      <div class="grid2">
        <label
          >Typ<select v-model="model.type">
            <option value="code">Code</option>
            <option value="mail">E-Mail</option>
          </select></label
        ><label v-if="model.type === 'mail'"
          >{{ t("auth.email")
          }}<input v-model="model.email" type="email" required /></label
        ><label
          >Gültigkeit (Tage)<input
            v-model.number="model.days"
            type="number"
            min="1"
            required /></label
        ><label v-if="admin"
          >Verwendungen<input
            v-model.number="model.maxUses"
            type="number"
            min="0" /></label
        ><label v-if="admin && model.type === 'code'"
          >Eigener Code (optional)<input v-model="model.code" /></label
        ><label
          >{{ t("common.notes") }}<input v-model="model.note" maxlength="200"
        /></label>
      </div>
      <button class="btn" :disabled="busy">
        {{
          model.type === "mail"
            ? "✉️ Einladungs-Mail senden"
            : "➕ Code generieren"
        }}
      </button>
    </form>
    <p v-if="error" class="error">{{ error }}</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Typ</th>
            <th>Verwendungen</th>
            <th>Gültig bis</th>
            <th>{{ t("common.status") }}</th>
            <th>{{ t("common.actions") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="inv in list" :key="inv.id">
            <td>
              <strong>{{ inv.code }}</strong>
              <div>{{ inv.email }}</div>
            </td>
            <td>{{ inv.type }}</td>
            <td>{{ inv.usedCount }} / {{ inv.maxUses }}</td>
            <td>{{ fmtDate(inv.expiresAt) }}</td>
            <td>{{ inv.status }}</td>
            <td>
              <div class="row">
                <button class="btn small ghost" @click="copy(inv)">
                  📋 Link kopieren</button
                ><button class="btn small ghost danger" @click="remove(inv.id)">
                  {{ t("common.delete") }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
