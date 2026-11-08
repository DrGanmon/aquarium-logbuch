<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import PlantDetail from "./PlantDetail.vue";
import Modal from "./Modal.vue";
import { api } from "../api";
import { t, errorMessage, toast, registerMessages, undoable } from "../state";
import { isUnsynced } from "../composables/sync-status";
import SyncBadge from "./SyncBadge.vue";
import featuresDe from "../../locales/features.de.json";
import featuresEn from "../../locales/features.en.json";
registerMessages({ de: featuresDe, en: featuresEn });
import { readImage } from "../composables/media";
import { MAX_PHOTOS_PER_PLANT } from "../../../src/shared/plant-images";
import type { AquariumPlant, PlantPhoto } from "../types";
const props = defineProps<{ id: string; plants: AquariumPlant[]; readonly: boolean }>();
const emit = defineEmits<{ changed: [] }>();
// Deletions can be undone from the toast; they are sent once the undo period has passed.
const hiddenPlants = ref(new Set<string>()), hiddenPhotos = ref(new Set<PlantPhoto["id"]>());
const visiblePlants = computed(() => props.plants.filter(item => !hiddenPlants.value.has(item.plant_id)));
function toggleSet<T>(set: { value: Set<T> }, key: T, hide: boolean) { const next = new Set(set.value);if (hide) next.add(key);else next.delete(key);set.value = next; }
const selected = ref(''), error = ref(''), busy = ref(false), editing = ref(''), count = ref(1);
const photos = ref<PlantPhoto[]>([]), photoError = ref(''), openPhotos = ref<Set<string>>(new Set());
const upload = ref<AquariumPlant>(), files = ref<File[]>([]), caption = ref(''), progress = ref('');
const editingPhoto = ref<PlantPhoto>(), lightbox = ref<PlantPhoto>();
let controller: AbortController | undefined;
const byPlant = computed(() => {
  const groups: Record<string, PlantPhoto[]> = {};
  for (const photo of photos.value) (groups[photo.plant_id] ||= []).push(photo);
  return groups;
});
const photosOf = (item: AquariumPlant) => (byPlant.value[item.plant_id] || []).filter(photo => !hiddenPhotos.value.has(photo.id));
const remaining = computed(() => upload.value ? MAX_PHOTOS_PER_PLANT - photosOf(upload.value).length : 0);
async function loadPhotos() {
  controller?.abort();
  const request = controller = new AbortController();
  try {
    const rows = await api<PlantPhoto[]>(`/aquariums/${props.id}/plant-images`, { signal: request.signal });
    if (controller === request) { photos.value = rows;photoError.value = ''; }
  } catch (caught) { if (controller === request && !request.signal.aborted) photoError.value = errorMessage(caught); }
}
watch(() => [props.id, props.plants], () => void loadPhotos(), { immediate: true });
onBeforeUnmount(() => controller?.abort());
function togglePhotos(item: AquariumPlant) {
  const next = new Set(openPhotos.value);
  if (next.has(item.plant_id)) next.delete(item.plant_id);else next.add(item.plant_id);
  openPhotos.value = next;
}
async function save(item: AquariumPlant) {
  if (busy.value || !Number.isInteger(count.value) || count.value < 1 || count.value > 10000) return;
  await mutate(item, 'PUT', { count: count.value });
}
function remove(item: AquariumPlant) {
  undoable(t('aquariumView.plantDeleted', { name: item.name }), {
    hide: () => toggleSet(hiddenPlants, item.plant_id, true),
    restore: () => toggleSet(hiddenPlants, item.plant_id, false),
    commit: async () => {
      await api(`/aquariums/${props.id}/plants/${encodeURIComponent(item.plant_id)}`, { method: 'DELETE' });
      emit('changed');
    },
  });
}
async function mutate(item: AquariumPlant, method: string, body?: unknown) {
  if (busy.value) return;
  busy.value = true;error.value = '';
  try {
    await api(`/aquariums/${props.id}/plants/${encodeURIComponent(item.plant_id)}`, { method, body });
    editing.value = '';emit('changed');
  } catch (caught) { error.value = errorMessage(caught); }
  finally { busy.value = false; }
}
function startUpload(item: AquariumPlant) {
  upload.value = item;files.value = [];caption.value = '';progress.value = '';photoError.value = '';
}
function filesChanged(event: Event) {
  files.value = [...((event.target as HTMLInputElement).files || [])];
  photoError.value = files.value.length > remaining.value ? t('plantStock.photoLimit', { max: MAX_PHOTOS_PER_PLANT }) : '';
}
async function savePhotos() {
  const item = upload.value;
  if (!item || busy.value || !files.value.length) return;
  if (files.value.length > remaining.value) { photoError.value = t('plantStock.photoLimit', { max: MAX_PHOTOS_PER_PLANT });return; }
  busy.value = true;photoError.value = '';
  let saved = 0;
  try {
    for (const [index, file] of files.value.entries()) {
      progress.value = t('plantStock.photoUploading', { current: index + 1, total: files.value.length });
      const image = await readImage(file);
      await api(`/aquariums/${props.id}/plant-images`, { method: 'POST', body: { plant_id: item.plant_id, image, caption: caption.value } });
      saved++;
    }
    upload.value = undefined;
    openPhotos.value = new Set([...openPhotos.value, item.plant_id]);
    toast(t('plantStock.photoSaved'));
  } catch (caught) {
    photoError.value = (saved ? t('plantStock.photoPartial', { saved, total: files.value.length }) + ' ' : '') + errorMessage(caught);
    files.value = files.value.slice(saved);
  } finally {
    progress.value = '';busy.value = false;
    if (saved) await loadPhotos();
  }
}
function startCaption(photo: PlantPhoto) {
  editingPhoto.value = photo;caption.value = photo.caption || '';photoError.value = '';
}
async function saveCaption() {
  const photo = editingPhoto.value;
  if (!photo || busy.value) return;
  busy.value = true;photoError.value = '';
  try {
    await api(`/aquariums/${props.id}/plant-images/${photo.id}`, { method: 'PUT', body: { caption: caption.value } });
    editingPhoto.value = undefined;await loadPhotos();
  } catch (caught) { photoError.value = errorMessage(caught); }
  finally { busy.value = false; }
}
function removePhoto(photo: PlantPhoto) {
  if (busy.value) return;
  if (lightbox.value?.id === photo.id) lightbox.value = undefined;
  undoable(t('aquariumView.plantPhotoDeleted'), {
    hide: () => toggleSet(hiddenPhotos, photo.id, true),
    restore: () => toggleSet(hiddenPhotos, photo.id, false),
    commit: async () => {
      await api(`/aquariums/${props.id}/plant-images/${photo.id}`, { method: 'DELETE' });
      await loadPhotos();
    },
  });
}
const plantName = (photo?: PlantPhoto) => props.plants.find(item => item.plant_id === photo?.plant_id)?.name || '';
const photoUrl = (photo: PlantPhoto) => photo.image_url || `api/aquariums/${props.id}/plant-images/${photo.id}`;
</script>
<template>
  <section class="card stack">
    <div class="row between"><h2>{{ t('nav.plants') }}</h2><a v-if="!readonly" class="btn small ghost" :href="`#/plants?aquariumId=${encodeURIComponent(id)}`">{{ t('plantStock.add') }}</a></div>
    <p v-if="!visiblePlants.length" class="muted">{{ t('plantStock.empty') }}</p>
    <div class="stock-list">
      <div v-for="item in visiblePlants" :key="item.plant_id" class="stock-item">
        <div><strong>{{ item.name }} <span class="tag">{{ item.count }} ×</span></strong> <SyncBadge :show="isUnsynced(item.plant_id, `/aquariums/${id}/plants/${item.plant_id}`)" /><div class="muted"><em>{{ item.scientificName }}</em> · {{ item.category }}</div><div v-if="item.variantName" class="muted"><strong>{{ t("variants.selected") }}</strong> {{ item.variantName }}</div></div>
        <div class="row">
          <button class="btn small ghost" @click="selected = item.plant_id">{{ t('common.details') }}</button>
          <button class="btn small ghost" :aria-expanded="openPhotos.has(item.plant_id)" :data-plant-photos="item.plant_id" @click="togglePhotos(item)">{{ t('plantStock.photos', { count: photosOf(item).length }) }}</button>
          <template v-if="!readonly">
            <button class="btn small ghost" :disabled="busy" @click="editing = item.plant_id;count = item.count">{{ t('common.edit') }}</button>
            <button class="btn small ghost danger" :disabled="busy" @click="remove(item)">{{ t('common.delete') }}</button>
          </template>
        </div>
        <form v-if="editing === item.plant_id && !readonly" class="row" @submit.prevent="save(item)">
          <label>{{ t('common.count') }}<input v-model.number="count" type="number" min="1" max="10000" step="1" required :disabled="busy" /></label>
          <button class="btn small" :disabled="busy">{{ t('common.save') }}</button><button type="button" class="btn small ghost" :disabled="busy" @click="editing = ''">{{ t('common.cancel') }}</button>
        </form>
        <div v-if="openPhotos.has(item.plant_id)" class="plant-photos stack">
          <div v-if="photosOf(item).length" class="plant-photo-grid">
            <figure v-for="photo in photosOf(item)" :key="photo.id" class="plant-photo">
              <button type="button" class="plant-photo-open" :aria-label="photo.caption || t('plantStock.photoAlt', { name: item.name })" @click="lightbox = photo">
                <img v-server-image :src="photoUrl(photo)" :alt="photo.caption || t('plantStock.photoAlt', { name: item.name })" loading="lazy" />
              </button>
              <figcaption v-if="photo.caption">{{ photo.caption }}</figcaption>
              <div v-if="!readonly" class="row plant-photo-actions">
                <button type="button" class="btn small ghost" :disabled="busy" @click="startCaption(photo)">{{ t('plantStock.editCaption') }}</button>
                <button type="button" class="btn small ghost danger" :disabled="busy" @click="removePhoto(photo)">{{ t('common.delete') }}</button>
              </div>
            </figure>
          </div>
          <p v-else class="muted">{{ t('plantStock.noPhotos') }}</p>
          <div v-if="!readonly"><button type="button" class="btn small" :disabled="busy || photosOf(item).length >= MAX_PHOTOS_PER_PLANT" @click="startUpload(item)">{{ t('plantStock.addPhotos') }}</button></div>
        </div>
      </div>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="photoError && !upload && !editingPhoto" class="error" role="alert">{{ photoError }}</p>
    <PlantDetail v-if="selected" :plant-id="selected" @close="selected = ''" />
    <Modal v-if="upload" :title="`${t('plantStock.addPhotos')}: ${upload.name}`" @close="busy || (upload = undefined)">
      <form class="stack" @submit.prevent="savePhotos">
        <p class="muted">{{ t('plantStock.photoHint') }}</p>
        <label>{{ t('plantStock.photoFiles') }}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple required :disabled="busy" @change="filesChanged" /></label>
        <p v-if="files.length" class="muted">{{ t('plantStock.photoSelected', { count: files.length }) }}</p>
        <label>{{ t('plantStock.photoCaption') }}<input v-model="caption" maxlength="200" :placeholder="t('plantStock.photoCaptionPlaceholder')" :disabled="busy" /></label>
        <p v-if="progress" class="muted" role="status">{{ progress }}</p>
        <p v-if="photoError" class="error" role="alert">{{ photoError }}</p>
        <div class="row">
          <button type="button" class="btn ghost" :disabled="busy" @click="upload = undefined">{{ t('common.cancel') }}</button>
          <button class="btn" :disabled="busy || !files.length">{{ t('common.save') }}</button>
        </div>
      </form>
    </Modal>
    <Modal v-if="editingPhoto" :title="t('plantStock.editCaption')" @close="busy || (editingPhoto = undefined)">
      <form class="stack" @submit.prevent="saveCaption">
        <label>{{ t('plantStock.photoCaption') }}<input v-model="caption" maxlength="200" :placeholder="t('plantStock.photoCaptionPlaceholder')" :disabled="busy" /></label>
        <p v-if="photoError" class="error" role="alert">{{ photoError }}</p>
        <button class="btn" :disabled="busy">{{ t('common.save') }}</button>
      </form>
    </Modal>
    <Modal v-if="lightbox" :title="plantName(lightbox) || t('common.imageLightboxTitle')" wide @close="lightbox = undefined">
      <figure class="stack plant-photo-lightbox">
        <img v-server-image :src="photoUrl(lightbox)" :alt="lightbox.caption || t('plantStock.photoAlt', { name: plantName(lightbox) })" />
        <figcaption v-if="lightbox.caption">{{ lightbox.caption }}</figcaption>
      </figure>
    </Modal>
  </section>
</template>
