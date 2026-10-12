<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import { Chart, registerables, type Plugin } from "chart.js";
import type { Parameter, Measurement, Range } from "../types";
import { dark, fmtDate, fmtNum } from "../state";
import { evaluate } from "../composables/values";
Chart.register(...registerables);
const props = defineProps<{
  parameter: Parameter;
  measurements: Measurement[];
  range?: Range;
}>();
const canvas = ref<HTMLCanvasElement>();
let chart: Chart<"line"> | undefined;
const bands: Plugin<"line"> = {
  id: "thresholds",
  beforeDatasetsDraw(c) {
    const range = props.range;
    const y = c.scales.y;
    const a = c.chartArea;
    if (!range || !y || !a) return;
    const clamp = (value: number) =>
      Math.max(a.top, Math.min(a.bottom, y.getPixelForValue(value)));
    c.ctx.save();
    c.ctx.fillStyle = dark.value
      ? "rgba(52,211,153,.16)"
      : "rgba(47,122,88,.13)";
    if (range.okMin != null || range.okMax != null) {
      const top = range.okMax != null ? clamp(range.okMax) : a.top;
      const bottom = range.okMin != null ? clamp(range.okMin) : a.bottom;
      c.ctx.fillRect(a.left, top, a.right - a.left, Math.max(0, bottom - top));
    }
    c.ctx.strokeStyle = dark.value ? "#f87171" : "#b8341f";
    c.ctx.setLineDash([5, 4]);
    for (const value of [range.critMin, range.critMax])
      if (value != null && value >= y.min && value <= y.max) {
        const py = clamp(value);
        c.ctx.beginPath();
        c.ctx.moveTo(a.left, py);
        c.ctx.lineTo(a.right, py);
        c.ctx.stroke();
      }
    c.ctx.restore();
  },
};
function render() {
  chart?.destroy();
  if (!canvas.value) return;
  const points = props.measurements
    .filter((m) => m.values[props.parameter.key] != null)
    .map((m) => ({
      x: new Date(m.measured_at).getTime(),
      y: m.values[props.parameter.key]!,
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((a, b) => a.x - b.x);
  let xMin = Infinity, xMax = -Infinity;
  let lo = props.range?.okMin ?? Infinity, hi = props.range?.okMax ?? -Infinity;
  for (const point of points) {
    xMin = Math.min(xMin, point.x); xMax = Math.max(xMax, point.x);
    lo = Math.min(lo, point.y); hi = Math.max(hi, point.y);
  }
  if (!points.length) {
    xMin = Date.now() - 86400e3; xMax = Date.now();
    lo = props.parameter.min; hi = props.parameter.max;
  }
  if (xMin === xMax) {
    xMin -= 12 * 3600e3;
    xMax += 12 * 3600e3;
  }
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.12;
  const color = dark.value ? "#38bdf8" : "#12343b";
  const text = dark.value ? "#cbd5e1" : "#52656b";
  chart = new Chart(canvas.value, {
    type: "line",
    plugins: [bands],
    data: {
      datasets: [
        {
          data: points,
          borderColor: color,
          borderWidth: 2,
          tension: 0.2,
          pointRadius: 3.5,
          pointBackgroundColor: points.map(
            (p) =>
              ({ ok: "#2f7a58", warn: "#a86a00", crit: "#b8341f" })[
                evaluate(props.range, p.y)
              ] || color,
          ),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) =>
              fmtDate(new Date(items[0]?.parsed.x || 0).toISOString()),
            label: (item) =>
              `${fmtNum(item.parsed.y ?? undefined, props.parameter.decimals)} ${props.parameter.unit}`,
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          min: xMin,
          max: xMax,
          ticks: {
            color: text,
            callback: (value) => new Date(Number(value)).toLocaleDateString(),
          },
          grid: { color: dark.value ? "#334155" : "#e2e8f0" },
        },
        y: {
          suggestedMin: Math.max(props.parameter.min, lo - pad),
          suggestedMax: Math.min(props.parameter.max, hi + pad),
          ticks: { color: text },
          grid: { color: dark.value ? "#334155" : "#e2e8f0" },
        },
      },
    },
  });
}
onMounted(render);
watch([() => props.measurements, () => props.range, dark], render, {
  deep: true,
});
onBeforeUnmount(() => chart?.destroy());
</script>
<template>
  <div class="card chart-card">
    <h3>
      <span>{{ parameter.name }}</span
      ><span class="muted">{{ parameter.unit }}</span>
    </h3>
    <div class="chart-wrap">
      <canvas
        ref="canvas"
        role="img"
        :aria-label="`Verlauf ${parameter.name}`"
      />
    </div>
  </div>
</template>
