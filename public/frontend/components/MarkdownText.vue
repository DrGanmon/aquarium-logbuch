<script setup lang="ts">
import { computed } from "vue";
import MarkdownInline from "./MarkdownInline";
const props = defineProps<{ text: string }>();
interface Block {
  kind: "paragraph" | "heading" | "list" | "code";
  text: string;
  level?: number;
  items?: string[];
}
const blocks = computed(() => {
  const result: Block[] = [];
  let code: string[] | null = null;
  for (const line of props.text.split("\n")) {
    if (line.trim().startsWith("```")) {
      if (code) {
        result.push({ kind: "code", text: code.join("\n") });
        code = null;
      } else code = [];
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    const item = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/);
    if (heading)
      result.push({
        kind: "heading",
        level: heading[1]!.length,
        text: heading[2]!,
      });
    else if (item) {
      const previous = result.at(-1);
      if (previous?.kind === "list") previous.items!.push(item[1]!);
      else result.push({ kind: "list", text: "", items: [item[1]!] });
    } else if (line.trim()) result.push({ kind: "paragraph", text: line });
  }
  if (code) result.push({ kind: "code", text: code.join("\n") });
  return result;
});
</script>
<template>
  <div class="markdown-body">
    <template v-for="(block, index) in blocks" :key="index">
      <pre v-if="block.kind === 'code'"><code>{{block.text}}</code></pre>
      <component
        :is="`h${Math.min(6, (block.level || 1) + 2)}`"
        v-else-if="block.kind === 'heading'"
        ><MarkdownInline :text="block.text"
      /></component>
      <ul v-else-if="block.kind === 'list'">
        <li v-for="(item, i) in block.items" :key="i">
          <MarkdownInline :text="item" />
        </li>
      </ul>
      <p v-else><MarkdownInline :text="block.text" /></p
    ></template>
  </div>
</template>
