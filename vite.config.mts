import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const publicRoot = fileURLToPath(new URL("./public", import.meta.url));
export default defineConfig(({ mode }) => {
  const minify = mode === "production";
  const suffix = minify ? ".min" : "";
  let building = false;
  return {
    root: publicRoot,
    publicDir: false,
    base: "./",
    define: {
      "process.env.NODE_ENV": JSON.stringify(
        minify ? "production" : "development",
      ),
    },
    plugins: [
      vue({ template: { transformAssetUrls: false } }),
      {
        name: "aquarium-entries",
        configResolved(config) {
          building = config.command === "build";
        },
        transformIndexHtml: {
          order: "pre",
          handler: (html) =>
            html
              .replace('src="dist/app.min.js"', 'src="/frontend/main.ts"')
              .replace(
                /<link rel="stylesheet" href="dist\/style.min.css"\s*\/?>/,
                "",
              ),
        },
        buildStart() {
          if (!building) return;
          // Remove the previous mode so Express cannot select a stale bundle.
          for (const name of readdirSync(join(publicRoot, "dist"))) {
            if (name !== ".gitkeep")
              rmSync(join(publicRoot, "dist", name), {
                recursive: true,
                force: true,
              });
          }
        },
        generateBundle() {
          const source = readFileSync(
            join(publicRoot, "frontend/service-worker.ts"),
            "utf8",
          );
          const result = ts.transpileModule(source, {
            compilerOptions: {
              target: ts.ScriptTarget.ES2022,
              module: ts.ModuleKind.ESNext,
              sourceMap: true,
            },
            fileName: "sw.ts",
          });
          this.emitFile({
            type: "asset",
            fileName: "sw.js",
            source: result.outputText.replace(/export \{\};?\s*/g, ""),
          });
          this.emitFile({
            type: "asset",
            fileName: "sw.js.map",
            source: result.sourceMapText || "",
          });
        },
      },
    ],
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: Object.fromEntries(
        ["/api", "/auth", "/sw.js"].map((path) => [
          path,
          {
            target: process.env.VITE_BACKEND_URL || "http://127.0.0.1:3000",
            changeOrigin: true,
          },
        ]),
      ),
    },
    worker: {
      format: "es",
      rolldownOptions: { output: { entryFileNames: `worker${suffix}.js` } },
    },
    build: {
      outDir: "dist",
      emptyOutDir: false,
      target: "es2022",
      sourcemap: true,
      minify,
      cssMinify: minify,
      lib: {
        entry: fileURLToPath(
          new URL("./public/frontend/main.ts", import.meta.url),
        ),
        formats: ["es"],
        fileName: () => `app${suffix}.js`,
        cssFileName: `style${suffix}`,
      },
    },
  };
});
