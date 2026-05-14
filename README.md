# ManiacWiki offline viewer (`mmm-wiki-api-viewer`)

Small **static** web UI to browse a local **NDJSON** wiki page export (same layout idea as the [MMM catalog viewer](https://github.com/selloa/mmm-web)): list pages, filter by namespace / first category / text search, open **Details** or **Raw JSON** (scrollable wikitext).

Data is **read-only** in the browser. A later step can swap the loader for the MediaWiki Action API; this repo starts **offline** only.

## Where the dump is read from

Resolution order (first match wins):

1. Environment variable **`WIKI_NDJSON_PATH`** — absolute path to any `.ndjson` file  
2. **`../mmm-wiki-api-access/data/main_namespace.ndjson`** (sibling folder next to this repo)  
3. **`./data/main_namespace.ndjson`** inside this repo  

Dev and build expose the chosen file as **`/wiki-pages.ndjson`** and copy it next to `index.html` in `dist/` when you run **`npm run build`**.

## Run locally

```powershell
cd C:\mmm\mmm-local\mmm-wiki-api-viewer
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173/`).

## Build

```powershell
npm run build
```

Output: `dist/`. Preview with `npm run preview`.

## Repo layout

| Path | Purpose |
| --- | --- |
| `src/main.ts` | App logic |
| `src/style.css` | Styling (aligned with `mmm-web`) |
| `vite.config.ts` | Serves/copies NDJSON; `base: "./"` for subpath hosting |
| `data/` | *(optional)* place `main_namespace.ndjson` here if you do not use the sibling `mmm-wiki-api-access` layout |

## Related repo

Exports and Python API helpers live in **`mmm-wiki-api-access`** (same parent folder by default).
