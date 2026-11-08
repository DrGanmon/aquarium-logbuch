<script setup lang="ts">
import { computed, ref } from "vue";
import { runWorkerTask } from "../worker-client";
import { generateCsv } from "../../../src/shared/measurement-csv";
import Modal from "./Modal.vue";
import { api } from "../api";
import { registerMessages, session, t, errorMessage } from "../state";
import featuresDe from "../../locales/features.de.json";
import featuresEn from "../../locales/features.en.json";
registerMessages({ de: featuresDe, en: featuresEn });
const props = defineProps<{ id: string; mode: "import" | "export" }>();
const emit = defineEmits<{ close: []; saved: [] }>();
interface Header {
  headers: string[];
  sampleRows: string[][];
  autoMapping: Record<string, string>;
  delimiter: string;
  totalDataRows: number;
}
const parsed = ref<Header>();
const fileInput = ref<HTMLInputElement>();
const dragging = ref(false);
const mapping = ref<Record<string, string>>({});
const csvText = ref("");
const delimiter = ref(";");
const from = ref("");
const to = ref("");
const hasHeader = ref(true);
const error = ref("");
const busy = ref(false);
const message = ref("");
const options = computed(() => ({
  "": t("csvDialog.ignore"),
  date: t("common.date"),
  time: t("common.time"),
  measured_at: t("common.datetime"),
  note: t("common.notes"),
  ...Object.fromEntries(
    (session.config?.allParameters || []).map((p) => [p.key, p.name]),
  ),
}));
async function parse() {
  busy.value = true;
  try {
    parsed.value = await runWorkerTask("PARSE_CSV", {
      csvText: csvText.value,
      explicitDelimiter: delimiter.value || undefined,
    });
    mapping.value = { ...parsed.value.autoMapping };
    delimiter.value = parsed.value.delimiter;
    error.value = "";
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
async function selectFile(file?: File) {
  if (!file) return;
  try {
    csvText.value = await file.text();
    delimiter.value = "";
    message.value = "";
    await parse();
  } catch (e) {
    error.value = errorMessage(e);
  }
}
async function fileChanged(event: Event) {
  await selectFile((event.target as HTMLInputElement).files?.[0]);
}
async function drop(event: DragEvent) {
  dragging.value = false;
  await selectFile(event.dataTransfer?.files[0]);
}

async function submit() {
  busy.value = true;
  try {
    const result = await api<{
      imported: number;
      skipped: number;
      errors?: string[];
    }>(`/aquariums/${props.id}/measurements/import-csv`, {
      method: "POST",
      body: {
        csvText: csvText.value,
        mapping: mapping.value,
        delimiter: delimiter.value,
        hasHeader: hasHeader.value,
      },
    });
    message.value = t("csvDialog.importResult", { imported: result.imported, skipped: result.skipped || 0 });
    error.value = (result.errors || []).join("\n");
    emit("saved");
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
async function downloadCsv() {
  busy.value = true;error.value = '';
  try {
    const query = new URLSearchParams({ all: "true", from: from.value, to: to.value });
    const measurements = await api(`/aquariums/${props.id}/measurements?${query}`);
    const csv = generateCsv(measurements, { delimiter: delimiter.value || ';', includeBOM: true, parameters: session.config?.allParameters || [] });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');link.href = url;link.download = `messwerte_${props.id}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (caught) { error.value = errorMessage(caught); }
  finally { busy.value = false; }
}

</script>
<template>
  <Modal
    :title="mode === 'import' ? `📥 ${t('csvDialog.titleImport')}` : `📤 ${t('csvDialog.titleExport')}`"
    wide
    @close="emit('close')"
    ><div class="stack">
      <div class="row">
        <label
          >{{ t("exportImport.delimiterLabel") }}
          <select
            v-model="delimiter"
            @change="mode === 'import' && csvText && parse()"
          >
            <option value="">{{ t("csvDialog.automatic") }}</option>
            <option value=";">Excel (;)</option>
            <option value=",">CSV (,)</option>
            <option value="&#9;">Tab</option>
          </select></label
        >
      </div>
      <template v-if="mode === 'export'"
        ><div class="grid2">
          <label>{{ t("csvDialog.from") }}<input v-model="from" type="date" /></label
          ><label>{{ t("csvDialog.to") }}<input v-model="to" type="date" /></label>
        </div>
        <button type="button" class="btn" :disabled="busy" @click="downloadCsv">📤 {{ t("csvDialog.download") }}</button></template
      ><template v-else
        ><div
          class="csv-drop-zone stack"
          :class="{ dragover: dragging }"
          role="button"
          tabindex="0"
          @click="fileInput?.click()"
          @keydown.enter="fileInput?.click()"
          @dragover.prevent="dragging = true"
          @dragleave="dragging = false"
          @drop.prevent="drop"
        >
          <strong>📄 {{ t("csvDialog.dropTitle") }}</strong
          ><span class="muted" style="font-size: 0.85rem"
            >{{ t("csvDialog.dropHint") }}</span
          >
        </div>
        <input
          ref="fileInput"
          type="file"
          accept=".csv,text/csv,text/plain"
          style="display: none"
          @change="fileChanged"
        /><label class="row"
          ><input v-model="hasHeader" type="checkbox" />{{ t("csvDialog.hasHeader") }}</label
        >
        <div v-if="parsed" class="table-wrap">
          <p>{{ t("csvDialog.rows", { count: parsed.totalDataRows }) }}</p>
          <table class="csv-mapping-table">
            <thead>
              <tr>
                <th>{{ t("csvDialog.column") }}</th>
                <th>{{ t("csvDialog.sample") }}</th>
                <th>{{ t("csvDialog.mapping") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(header, index) in parsed.headers" :key="index">
                <td>{{ header }}</td>
                <td>{{ parsed.sampleRows[0]?.[index] }}</td>
                <td>
                  <select v-model="mapping[index]">
                    <option
                      v-for="(label, key) in options"
                      :key="key"
                      :value="key"
                    >
                      {{ label }}
                    </option>
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <button
          v-if="parsed"
          class="btn"
          :disabled="busy || !!message"
          @click="submit"
        >
          📥 {{ t("csvDialog.import") }}
        </button></template
      >
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-if="message" class="compat-box ok">{{ message }}</p>
    </div></Modal
  >
</template>
