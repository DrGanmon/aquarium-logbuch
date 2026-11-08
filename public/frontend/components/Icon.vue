<script setup lang="ts">
import { computed } from "vue";
// Own, consistent line icons (24×24, stroked). They replace emoji in navigation and are always shown next to a text label.
const circle = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const icons: Record<string, string> = {
  home: "M3 11l9-8 9 8M5 9.5V20h5v-6h4v6h5V9.5",
  fish: `M2.5 12c3.5-5.5 10-6.5 14-2.5L21 6v12l-4.5-3.5c-4 4-10.5 3-14-2.5z${circle(8, 11, 1)}`,
  leaf: "M5 20c-1-9 5-15 15-15 .5 9-5 15-14 15zM5 20l9-9",
  health: "M12 20s-8-5-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15 12 20 12 20zM7 12h3l1.5-2.5 2 4L15 12h2",
  users: `${circle(9, 8, 3.5)}M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .8 3.5 2.6 3.5 5.5`,
  bell: "M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 20.5a2 2 0 0 0 4 0",
  user: `${circle(12, 8, 4)}M4 21c0-4 3.6-7 8-7s8 3 8 7`,
  admin: `M4 7h9M17 7h3M4 17h3M11 17h9${circle(15, 7, 2)}${circle(9, 17, 2)}`,
  globe: `${circle(12, 12, 9)}M3 12h18M12 3c3.2 3.5 3.2 14.5 0 18M12 3c-3.2 3.5-3.2 14.5 0 18`,
  theme: `${circle(12, 12, 9)}M12 3v18M12 7h4.5M12 11h6.5M12 15h5.5`,
  logout: "M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10",
  more: `${circle(5, 12, 1.5)}${circle(12, 12, 1.5)}${circle(19, 12, 1.5)}`,
  book: "M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 7h6",
  overview: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  chart: "M4 4v16h16M7.5 15l3.5-4.5 3 3L19 7",
  tool: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z",
  tasks: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M9 15l2 2 4-4",
  camera: `M4 8h3l2-3h6l2 3h3v11H4z${circle(12, 13, 3.5)}`,
  measure: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6A2 2 0 0 0 19 18l-5-9V3M7.5 14h9",
  sync: "M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4",
};
const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 });
const path = computed(() => icons[props.name] || icons.more);
</script>
<template>
  <svg class="icon" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path :d="path" /></svg>
</template>
