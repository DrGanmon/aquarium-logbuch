import { defineComponent, h, type VNodeChild } from "vue";
export default defineComponent({
  props: { text: { type: String, required: true } },
  setup(props) {
    return () => {
      const parts: VNodeChild[] = props.text
        .split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g)
        .map((part) => {
          if (part.startsWith("**") && part.endsWith("**"))
            return h("strong", part.slice(2, -2));
          if (part.startsWith("`") && part.endsWith("`"))
            return h("code", part.slice(1, -1));
          if (part.startsWith("*") && part.endsWith("*"))
            return h("em", part.slice(1, -1));
          const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
          if (link) {
            try {
              const url = new URL(link[2]!, document.baseURI);
              if (["https:", "http:"].includes(url.protocol))
                return h(
                  "a",
                  {
                    href: url.href,
                    target: "_blank",
                    rel: "noopener noreferrer",
                  },
                  link[1],
                );
            } catch {
              /* Render invalid links as text. */
            }
          }
          return part;
        });
      return h("span", parts);
    };
  },
});
