import { detectDelimiter, parseCsv, parseDate, parseNumber, autoDetectMapping as mapCsv, generateCsv as csvText } from '../shared/measurement-csv';

import cfg = require('../config/app-config');
import alert_serviceModule = require('./alert-service');
const { thresholdsOfAquarium, buildMessage } = alert_serviceModule;

/**
 * Erkennt automatisch das Trennzeichen einer CSV-Datei (;, ,, \t, |).
 */
const autoDetectMapping = (headers: any = [], allParameters: any = null) => mapCsv(headers, allParameters || cfg.PARAMETERS);
const generateCsv = (measurements: any = [], options: any = {}) => csvText(measurements, { ...options, parameters: options.parameters || cfg.PARAMETERS });

async function importMeasurementsFromRows({
  aquarium,
  userId,
  rows = [],
  mapping = {},
  hasHeader = true,
  db,
}: any) {
  if (!aquarium || !aquarium.id) {
    throw new Error('Aquarium nicht gefunden.');
  }

  const allParams = cfg.suiteService.getAllKnownParameters();
  const paramMap = new Map(allParams.map((p: any) => [p.key, p]));
  const { thresholds } = await thresholdsOfAquarium(aquarium, db);

  const startIdx = hasHeader ? 1 : 0;
  const dataRows = rows.slice(startIdx);

  if (dataRows.length === 0) {
    return { ok: true, imported: 0, skipped: 0, alerts: 0, errors: [] };
  }

  // Finde Spalten-Indizes für Datum, Uhrzeit, Notiz und Parameter
  let dateColIdx = null;
  let timeColIdx = null;
  let noteColIdx = null;
  const paramColMap = new Map(); // colIdx -> paramKey

  for (const [colIdxStr, targetKey] of Object.entries(mapping)) {
    const colIdx = parseInt(colIdxStr, 10);
    if (Number.isNaN(colIdx) || targetKey === 'ignore' || !targetKey) continue;

    if (targetKey === 'measured_at' || targetKey === 'date') {
      dateColIdx = colIdx;
    } else if (targetKey === 'time') {
      timeColIdx = colIdx;
    } else if (targetKey === 'note') {
      noteColIdx = colIdx;
    } else if (paramMap.has(targetKey)) {
      paramColMap.set(colIdx, targetKey);
    }
  }

  if (dateColIdx === null) {
    throw new Error('Bitte ordne mindestens eine Spalte dem Datum / Messzeitpunkt zu.');
  }

  let importedCount = 0;
  let skippedCount = 0;
  let totalAlertsCount = 0;
  const errors = [];
  const now = Date.now();

  for (let rIndex = 0; rIndex < dataRows.length; rIndex++) {
    const row = dataRows[rIndex];
    const rowNum = startIdx + rIndex + 1;

    if (!row || !row.length || row.every((c: any) => !c || c.trim() === '')) {
      skippedCount++;
      continue;
    }

    const rawDate = row[dateColIdx];
    const rawTime = timeColIdx !== null ? row[timeColIdx] : null;

    const parsedDate = parseDate(rawDate, rawTime);
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
      errors.push(`Zeile ${rowNum}: Ungültiges Datum („${rawDate || ''}“).`);
      skippedCount++;
      continue;
    }

    if (parsedDate.getTime() > now + 5 * 60000) {
      errors.push(`Zeile ${rowNum}: Messdatum liegt in der Zukunft.`);
      skippedCount++;
      continue;
    }

    const cleanValues: Record<string, any> = {};
    for (const [colIdx, paramKey] of paramColMap.entries()) {
      const rawVal = row[colIdx];
      if (rawVal === '' || rawVal == null) continue;

      const pDef = paramMap.get(paramKey);
      const parsedNum = parseNumber(rawVal);
      if (parsedNum == null) continue;

      if (pDef && (parsedNum < pDef.min || parsedNum > pDef.max)) {
        errors.push(`Zeile ${rowNum}: Wert ${parsedNum} für ${pDef.name} liegt außerhalb des gültigen Bereichs (${pDef.min} - ${pDef.max}).`);
        continue;
      }

      cleanValues[paramKey] = parsedNum;
    }

    let note = null;
    if (noteColIdx !== null && row[noteColIdx]) {
      note = String(row[noteColIdx]).trim().slice(0, 500);
    }

    // Mindestens ein Messwert oder eine Notiz
    if (Object.keys(cleanValues).length === 0 && !note) {
      skippedCount++;
      continue;
    }

    // Alarme für Grenzwerte berechnen
    const alertsToCreate = [];
    for (const [key, v] of Object.entries(cleanValues)) {
      const pDef = paramMap.get(key);
      const range = thresholds[key];
      const level = cfg.evaluate(range, v);
      if (level === 'warn' || level === 'crit') {
        const message = buildMessage(pDef, range, level, v);
        alertsToCreate.push({ param: key, level, value: v, message });
      }
    }

    await db.measurements.create({
      aquarium_id: aquarium.id,
      measured_at: parsedDate.toISOString(),
      note,
      created_by: userId || null,
      values: cleanValues,
      alerts: alertsToCreate,
    });

    importedCount++;
    totalAlertsCount += alertsToCreate.length;
  }

  return {
    ok: true,
    imported: importedCount,
    skipped: skippedCount,
    alerts: totalAlertsCount,
    errors,
  };
}

export = {
  detectDelimiter,
  parseCsv,
  parseDate,
  parseNumber,
  autoDetectMapping,
  generateCsv,
  importMeasurementsFromRows,
};
