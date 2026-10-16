import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import revision from "./scripts/frontend-revision.js";
import versioning from "./scripts/version.js";

const publicRoot = fileURLToPath(new URL("./public", import.meta.url));
function catalogDataBoundary(): Plugin {
  return {
    name: 'aquarium-catalog-data-boundary',
    generateBundle() {
      // Catalog data has its own versioned API; keep it out of shell identities.
      for (const id of this.getModuleIds()) {
        const modulePath = id.replaceAll('\\', '/').split('?')[0];
        if (/\/(?:src\/config\/(?:species|plants|health)|public\/(?:species-images|plants-images))\//.test(modulePath)) {
          this.error(`Katalogdaten dürfen nicht ins Frontend-Bundle importiert werden: ${id}. Stattdessen die Katalog-API verwenden.`);
        }
      }
    },
  };
}
export default defineConfig(({ mode }) => {
  const appVersion = versioning.resolveVersion();
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
      catalogDataBoundary(),
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
        generateBundle: {
          order: "post",
          handler(_options, bundle) {
            const workerSource = readFileSync(join(publicRoot, "frontend/service-worker.ts"), "utf8");
            const files: Record<string, string | Uint8Array> = {};
            for (const [name, item] of Object.entries(bundle)) {
              if (/\.(js|css)$/.test(name)) files[`dist/${name}`] = item.type === 'chunk' ? item.code : item.source;
            }
            for (const name of ['index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon-16x16.png', 'favicon-32x32.png']) {
              files[name === 'index.html' ? './' : name] = readFileSync(join(publicRoot, name));
            }
            const frontend = revision.frontendRevision(files, workerSource);
            this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version: appVersion, frontendVersion: frontend.version }) + "\n" });
            this.emitFile({ type: "asset", fileName: "frontend-version.json", source: JSON.stringify(frontend) + "\n" });
            const source = workerSource.replace('/* OFFLINE_ASSETS */ []', JSON.stringify(Object.keys(frontend.assets)))
              .replace('/* OFFLINE_REVISIONS */ {}', JSON.stringify(frontend.assets))
              .replace("/* OFFLINE_BUILD */ 'dev'", JSON.stringify(frontend.version));
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
              source: result.outputText.replace(/export \{};?\s*/g, ""),
            });
            this.emitFile({
              type: "asset",
              fileName: "sw.js.map",
              source: result.sourceMapText || "",
            });
          },
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
      plugins: () => [catalogDataBoundary()],
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
      rolldownOptions: { output: { chunkFileNames: "chunk-[name]-[hash].js" } },
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
