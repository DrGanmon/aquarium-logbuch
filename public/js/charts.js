'use strict';

import { isEffectiveDark, activeCharts } from './theme.js';
import { evaluate, fmtNum, fmtDate } from './utils.js';

export const bandPlugin = {
  id: 'band',
  beforeDatasetsDraw(chart, args, o) {
    const {
      ctx,
      chartArea: a,
      scales: { y },
    } = chart;
    if (!o || !a) return;
    const clamp = (px) => Math.min(Math.max(px, a.top), a.bottom);
    const isDark = isEffectiveDark();
    ctx.save();
    if (o.okMin != null || o.okMax != null) {
      const yTop = o.okMax != null ? clamp(y.getPixelForValue(o.okMax)) : a.top;
      const yBot = o.okMin != null ? clamp(y.getPixelForValue(o.okMin)) : a.bottom;
      ctx.fillStyle = isDark ? 'rgba(52, 211, 153, 0.16)' : 'rgba(47, 122, 88, 0.13)';
      ctx.fillRect(a.left, yTop, a.right - a.left, Math.max(0, yBot - yTop));
    }
    ctx.strokeStyle = isDark ? 'rgba(248, 113, 113, 0.85)' : 'rgba(184, 52, 31, 0.75)';
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1;
    for (const v of [o.critMin, o.critMax]) {
      if (v == null || v < y.min || v > y.max) continue;
      const py = y.getPixelForValue(v);
      ctx.beginPath();
      ctx.moveTo(a.left, py);
      ctx.lineTo(a.right, py);
      ctx.stroke();
    }
    ctx.restore();
  },
};

export function makeChart(canvas, p, points, range) {
  const isDark = isEffectiveDark();
  const ys = points.map((q) => q.y);
  const lo = [Math.min(...ys), range.okMin].filter((v) => v != null);
  const hi = [Math.max(...ys), range.okMax].filter((v) => v != null);
  const minV = Math.min(...lo),
    maxV = Math.max(...hi);
  const pad = (maxV - minV || Math.abs(maxV) || 1) * 0.12;
  const xs = points.map((q) => q.x);
  let xMin = Math.min(...xs),
    xMax = Math.max(...xs);
  if (xMin === xMax) {
    xMin -= 12 * 3600e3;
    xMax += 12 * 3600e3;
  }

  // Chart aus vendor/chart.js (globales window.Chart)
  const ChartClass = window.Chart;
  if (!ChartClass) {
    return null;
  }

  const chartInstance = new ChartClass(canvas, {
    type: 'line',
    plugins: [bandPlugin],
    data: {
      datasets: [
        {
          data: points,
          borderColor: isDark ? '#38bdf8' : '#12343b',
          backgroundColor: isDark ? '#38bdf8' : '#12343b',
          borderWidth: 2,
          pointRadius: 3.5,
          pointHoverRadius: 5,
          tension: 0.2,
          pointBackgroundColor: points.map(
            (q) =>
              ({
                ok: isDark ? '#34d399' : '#2f7a58',
                warn: isDark ? '#fbbf24' : '#a86a00',
                crit: isDark ? '#f87171' : '#b8341f',
              }[evaluate(range, q.y)] || (isDark ? '#38bdf8' : '#12343b'))
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
        band: range,
        tooltip: {
          backgroundColor: isDark ? '#091315' : '#12343b',
          titleColor: isDark ? '#e2eeed' : '#ffffff',
          bodyColor: isDark ? '#e2eeed' : '#ffffff',
          borderColor: isDark ? '#22383c' : '#bccfcc',
          borderWidth: 1,
          callbacks: {
            title: (it) => fmtDate(it[0].parsed.x),
            label: (it) => `${fmtNum(p, it.parsed.y)}${p.unit ? ' ' + p.unit : ''}`,
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          min: xMin,
          max: xMax,
          ticks: {
            color: isDark ? '#8fa9ad' : '#4a6a70',
            maxTicksLimit: 5,
            callback: (v) =>
              new Date(v).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
          },
          grid: {
            color: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
          },
        },
        y: {
          suggestedMin: Math.max(minV - pad, p.min),
          suggestedMax: Math.min(maxV + pad, p.max),
          ticks: {
            color: isDark ? '#8fa9ad' : '#4a6a70',
          },
          grid: {
            color: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
          },
          title: {
            display: !!p.unit,
            text: p.unit,
            color: isDark ? '#8fa9ad' : '#4a6a70',
          },
        },
      },
    },
  });
  activeCharts.push(chartInstance);
  return chartInstance;
}
