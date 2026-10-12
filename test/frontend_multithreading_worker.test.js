"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
let tasks;
test.before(async () => {
  const { build } = await import("vite");
  const result = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      lib: {
        entry: require("node:path").resolve("public/frontend/worker-tasks.ts"),
        formats: ["es"],
      },
    },
  });
  const code = (Array.isArray(result) ? result[0] : result).output.find(
    (item) => item.type === "chunk",
  ).code;
  tasks = await import(
    "data:text/javascript;base64," + Buffer.from(code).toString("base64")
  );
});
test("TypeScript worker parses quoted CSV cells, decimal commas and automatic mapping", () => {
  const parsed = tasks.handleParseCsv({
    csvText:
      '\uFEFFMessdatum;pH-Wert;Temperatur;Nitrit (NO2);Notiz\n10.10.2026;7,2;25,5;0,02;"Text; mit Trennzeichen"',
  });
  assert.equal(parsed.delimiter, ";");
  assert.equal(parsed.totalDataRows, 1);
  assert.deepEqual(parsed.autoMapping, {
    0: "date",
    1: "ph",
    2: "temp",
    3: "no2",
    4: "note",
  });
  assert.equal(parsed.sampleRows[0][4], "Text; mit Trennzeichen");
  assert.deepEqual(tasks.parseRows('name,note\n"a","line 1\nline 2"', ","), [
    ["name", "note"],
    ["a", "line 1\nline 2"],
  ]);
});
test("TypeScript worker filters species and ranks name matches", () => {
  const species = [
    { id: "neon", name: "Roter Neon", category: "Salmler", waterType: "fresh" },
    {
      id: "clown",
      name: "Clownfisch",
      category: "Meerwasser",
      waterType: "salt",
    },
  ];
  assert.deepEqual(
    tasks
      .handleSearchSpecies({
        species,
        query: "Neon",
        waterType: "all",
        category: "all",
      })
      .filtered.map((s) => s.id),
    ["neon"],
  );
  assert.deepEqual(
    tasks
      .handleSearchSpecies({
        species,
        query: "",
        waterType: "salt",
        category: "all",
      })
      .filtered.map((s) => s.id),
    ["clown"],
  );
});
test("TypeScript worker statistics sort timestamps and evaluate the latest measurement", async () => {
  const result = await tasks.executeTask("COMPUTE_STATS", {
    measurements: [
      { measured_at: "2026-10-12", values: { ph: 8 } },
      { measured_at: "2026-10-10", values: { ph: 6 } },
    ],
    parameters: [{ key: "ph" }],
    thresholds: { ph: { okMin: 6.5, okMax: 7.5, critMax: 8.5 } },
  });
  assert.deepEqual(result.ph, {
    count: 2,
    min: 6,
    max: 8,
    avg: 7,
    latest: 8,
    trend: 2,
    status: "warn",
  });
  await assert.rejects(tasks.executeTask("UNKNOWN", {}), /Unbekannter/);
});

test('TypeScript worker computes large histories in one pass without argument overflow', () => {
  const result = tasks.handleComputeStats({ measurements: Array(150000).fill({ measured_at: '2026-10-12', values: { ph: 7 } }), parameters: [{ key: 'ph' }], thresholds: {} });
  assert.equal(result.ph.count, 150000);
  assert.equal(result.ph.min, 7);
  assert.equal(result.ph.max, 7);
  assert.equal(result.ph.latest, 7);
});
