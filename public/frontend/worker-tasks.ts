import type { Species, Measurement, Parameter, Range } from "./types";
import { evaluate } from "./composables/values";
export interface CsvHeader {
  headers: string[];
  sampleRows: string[][];
  autoMapping: Record<string, string>;
  delimiter: string;
  totalDataRows: number;
}
export interface SearchResult {
  filtered: Species[];
  total: number;
}
export interface Stats {
  count: number;
  min: number;
  max: number;
  avg: number;
  latest: number;
  trend: number;
  status: string;
}
export interface WorkerTasks {
  PARSE_CSV: {
    input: { csvText: string; explicitDelimiter?: string };
    output: CsvHeader;
  };
  SEARCH_SPECIES: {
    input: {
      species: Species[];
      query: string;
      waterType: string;
      category: string;
    };
    output: SearchResult;
  };
  COMPUTE_STATS: {
    input: {
      measurements: Measurement[];
      parameters: Parameter[];
      thresholds: Record<string, Range>;
    };
    output: Record<string, Stats>;
  };
  PROCESS_IMAGE: {
    input: {
      file: File;
      maxWidth?: number;
      maxHeight?: number;
      quality?: number;
      mimeType?: string;
    };
    output: { dataUrl: string; width: number; height: number };
  };
}
const keywords: Record<string, string[]> = {
  date: ["datum", "date", "timestamp", "zeitpunkt"],
  time: ["uhrzeit", "time"],
  note: ["notiz", "note", "bemerkung"],
  temp: ["temperatur", "temp", "temperature"],
  ph: ["ph"],
  co2: ["co2", "kohlendioxid"],
  nh3: ["nh3", "ammoniak"],
  sio2: ["sio2", "silikat"],
  cl2: ["cl2", "chlor"],
  kh: ["kh", "karbonat"],
  gh: ["gh", "gesamt"],
  no2: ["no2", "nitrit"],
  no3: ["no3", "nitrat"],
  nh4: ["nh4", "ammonium"],
  po4: ["po4", "phosphat"],
  fe: ["fe", "eisen"],
  cu: ["cu", "kupfer"],
  o2: ["o2", "sauerstoff"],
  k: ["kalium", "potassium"],
  mg: ["mg", "magnesium"],
  ca: ["ca", "calcium"],
  salinity: ["salinität", "salinity", "salz"],
};
export function parseRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell || row.length) {
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
  }
  return rows;
}
export function handleParseCsv(
  data: WorkerTasks["PARSE_CSV"]["input"],
): CsvHeader {
  const delimiter =
    data.explicitDelimiter ||
    [";", ",", "\t", "|"]
      .map((delimiter) => ({
        delimiter,
        width: parseRows(data.csvText, delimiter)
          .slice(0, 5)
          .reduce((total, row) => total + row.length, 0),
      }))
      .sort((a, b) => b.width - a.width)[0]!.delimiter;
  const rows = parseRows(data.csvText.replace(/^\uFEFF/, ""), delimiter);
  const headers = rows[0] || [];
  const autoMapping: Record<string, string> = {};
  headers.forEach((header, index) => {
    const normalized = header
      .toLowerCase()
      .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (digit) => String("₀₁₂₃₄₅₆₇₈₉".indexOf(digit)))
      .replace(/mg\s*\/\s*l|°dh|°c|ppm/g, "");
    const symbol = normalized.match(
      /(?:^|[\s(])(ph|kh|gh|no2|no3|nh3|nh4|po4|fe|cu|o2|co2|sio2|cl2|mg|ca|k)(?:$|[\s)])/,
    )?.[1];
    if (symbol) {
      autoMapping[index] = symbol;
      return;
    }
    const clean = normalized.replace(/[^a-z0-9äöü]/g, "");
    const matches = Object.entries(keywords)
      .flatMap(([key, words]) =>
        words
          .filter((word) => clean.includes(word))
          .map((word) => ({ key, length: word.length })),
      )
      .sort((a, b) => b.length - a.length);
    autoMapping[index] = matches[0]?.key || "";
  });
  return {
    delimiter,
    headers,
    autoMapping,
    sampleRows: rows.slice(1, 4),
    totalDataRows: Math.max(0, rows.length - 1),
  };
}
export function handleSearchSpecies(
  data: WorkerTasks["SEARCH_SPECIES"]["input"],
): SearchResult {
  const words = data.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const filtered = data.species
    .filter(
      (species) =>
        (data.waterType === "all" || species.waterType === data.waterType) &&
        (data.category === "all" || species.category === data.category),
    )
    .map((species) => {
      const name = species.name.toLowerCase();
      const haystack =
        `${name} ${species.scientificName || ""} ${species.category || ""} ${species.description || ""}`.toLowerCase();
      return {
        species,
        score: words.every((word) => haystack.includes(word))
          ? words.reduce(
              (score, word) =>
                score +
                (name === word
                  ? 20
                  : name.startsWith(word)
                    ? 10
                    : name.includes(word)
                      ? 5
                      : 1),
              1,
            )
          : 0,
      };
    })
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.species.name.localeCompare(b.species.name),
    )
    .map((item) => item.species);
  return { filtered, total: filtered.length };
}
export function handleComputeStats(
  data: WorkerTasks["COMPUTE_STATS"]["input"],
): Record<string, Stats> {
  const result: Record<string, Stats> = {};
  for (const parameter of data.parameters) {
    let count = 0, sum = 0, min = Infinity, max = -Infinity;
    let latest = 0, first = 0, firstTime = Infinity, lastTime = -Infinity;
    for (const measurement of data.measurements) {
      const value = measurement.values[parameter.key];
      const time = new Date(measurement.measured_at).getTime();
      if (value == null || !Number.isFinite(value) || !Number.isFinite(time)) continue;
      count++; sum += value;
      min = Math.min(min, value); max = Math.max(max, value);
      if (time < firstTime) { firstTime = time; first = value; }
      if (time >= lastTime) { lastTime = time; latest = value; }
    }
    if (!count) continue;
    result[parameter.key] = {
      count, min, max, avg: sum / count, latest,
      trend: latest - first,
      status: evaluate(data.thresholds[parameter.key], latest),
    };
  }
  return result;
}
export async function handleProcessImage(
  data: WorkerTasks["PROCESS_IMAGE"]["input"],
): Promise<WorkerTasks["PROCESS_IMAGE"]["output"]> {
  const bitmap = await createImageBitmap(data.file);
  try {
    const factor = Math.min(
      1,
      (data.maxWidth || 1600) / bitmap.width,
      (data.maxHeight || 1200) / bitmap.height,
    );
    const width = Math.round(bitmap.width * factor);
    const height = Math.round(bitmap.height * factor);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Bildverarbeitung nicht verfügbar.");
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({
      type: data.mimeType || "image/jpeg",
      quality: data.quality ?? 0.85,
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return {
      dataUrl: `data:${blob.type};base64,${btoa(binary)}`,
      width,
      height,
    };
  } finally {
    bitmap.close();
  }
}
export async function executeTask<K extends keyof WorkerTasks>(
  type: K,
  payload: WorkerTasks[K]["input"],
): Promise<WorkerTasks[K]["output"]> {
  // The discriminated task map describes the RPC contract on both sides.
  switch (type) {
    case "PARSE_CSV":
      return handleParseCsv(
        payload as WorkerTasks["PARSE_CSV"]["input"],
      ) as WorkerTasks[K]["output"];
    case "SEARCH_SPECIES":
      return handleSearchSpecies(
        payload as WorkerTasks["SEARCH_SPECIES"]["input"],
      ) as WorkerTasks[K]["output"];
    case "COMPUTE_STATS":
      return handleComputeStats(
        payload as WorkerTasks["COMPUTE_STATS"]["input"],
      ) as WorkerTasks[K]["output"];
    case "PROCESS_IMAGE":
      return (await handleProcessImage(
        payload as WorkerTasks["PROCESS_IMAGE"]["input"],
      )) as WorkerTasks[K]["output"];
    default:
      throw new Error("Unbekannter Worker-Auftrag.");
  }
}
