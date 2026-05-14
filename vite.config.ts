import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Default: dump next to the API tooling repo (sibling folder). */
const siblingApiAccessDump = path.resolve(
  __dirname,
  "..",
  "mmm-wiki-api-access",
  "data",
  "main_namespace.ndjson",
);

/** Optional: keep a copy inside this repo. */
const localDump = path.join(__dirname, "data", "main_namespace.ndjson");

const ndjsonPublicName = "wiki-pages.ndjson";

function ndjsonSourcePath(): string {
  const fromEnv = process.env.WIKI_NDJSON_PATH?.trim();
  if (fromEnv) return fromEnv;
  if (fs.existsSync(siblingApiAccessDump)) return siblingApiAccessDump;
  if (fs.existsSync(localDump)) return localDump;
  return siblingApiAccessDump;
}

function serveAndCopyNdjson(): Plugin {
  let outDir = "dist";
  return {
    name: "wiki-ndjson-serve-and-copy",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split("?")[0] ?? "";
        if (pathname !== `/${ndjsonPublicName}`) {
          next();
          return;
        }
        const src = ndjsonSourcePath();
        if (!fs.existsSync(src)) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(
            `NDJSON not found. Export a dump or set WIKI_NDJSON_PATH.\nTried:\n- ${siblingApiAccessDump}\n- ${localDump}\n`,
          );
          return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
        fs.createReadStream(src).pipe(res);
      });
    },
    closeBundle() {
      const src = ndjsonSourcePath();
      const dest = path.resolve(__dirname, outDir, ndjsonPublicName);
      if (!fs.existsSync(src)) {
        console.warn(
          `[wiki-ndjson] skip copy: no file at ${src} (set WIKI_NDJSON_PATH or add sibling ../mmm-wiki-api-access/data/main_namespace.ndjson or ./data/main_namespace.ndjson)`,
        );
        return;
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    },
  };
}

// Use `./` so static file:// or GitHub Pages project URLs resolve assets + NDJSON next to index.
export default defineConfig({
  base: "./",
  root: __dirname,
  plugins: [serveAndCopyNdjson()],
});
