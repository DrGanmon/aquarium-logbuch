<script setup lang="ts">
import { ref } from "vue";
import Modal from "./Modal.vue";
import StockForm from "./StockForm.vue";
import { api } from "../api";
import { session, t, errorMessage } from "../state";
import type { Stock } from "../types";
const props = defineProps<{ id: string; stock: Stock[]; readonly: boolean }>();
const emit = defineEmits<{ changed: []; image: [url: string] }>();
const editing = ref<Stock>();
const error = ref("");
async function remove(stock: Stock) {
  if (!confirm(t("common.delete") + "?")) return;
  try {
    await api(`/aquariums/${props.id}/stock/${stock.id}`, { method: "DELETE" });
    emit("changed");
  } catch (e) {
    error.value = errorMessage(e);
  }
}
</script>
<template>
  <section class="card stack">
    <div class="row between">
      <h2 style="margin: 0">Besatz & Tierwohl</h2>
      <a class="btn small ghost" href="#/species">📖 {{ t("nav.species") }}</a>
    </div>
    <p class="muted">
      Die Fisch- und Wirbellosenarten bestimmen die optimalen Grenzwerte und
      werden auf Verträglichkeit, Gruppengröße sowie Territorialverhalten
      geprüft.
    </p>
    <p v-if="!stock.length">
      Noch kein Besatz eingetragen. Es gelten die allgemeinen Grenzwerte.
    </p>
    <div v-if="stock.length" class="stock-list">
      <div v-for="item in stock" :key="item.id" class="stock-item">
        <div class="stock-item-main">
          <img
            v-if="item.has_image || item.image_file"
            class="stock-avatar"
            :src="`api/aquariums/${id}/stock/${item.id}/image`"
            :alt="item.name || item.species"
            @click="emit('image', `api/aquariums/${id}/stock/${item.id}/image`)"
          />
          <div v-else class="stock-avatar-placeholder">🐠</div>
          <div>
            <strong class="stock-name-title"
              >{{ item.name || item.species }}
              <span class="tag">{{ item.count }} ×</span></strong
            >
            <div class="stock-species-sub">
              {{ item.species }} · {{ session.config?.profiles[item.profile] }}
            </div>
          </div>
        </div>
        <div v-if="!readonly" class="row">
          <button class="btn small ghost" @click="editing = item">
            {{ t("common.edit") }}</button
          ><button class="btn small ghost danger" @click="remove(item)">
            {{ t("common.delete") }}
          </button>
        </div>
      </div>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <StockForm v-if="!readonly" :id="id" @saved="emit('changed')" /><Modal
      v-if="editing"
      title="Bewohner bearbeiten"
      @close="editing = undefined"
      ><StockForm
        :id="id"
        :stock="editing"
        @saved="
          editing = undefined;
          emit('changed');
        "
    /></Modal>
  </section>
</template>
