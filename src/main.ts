import { splitWikitextIntoSections } from "./wikitextSections";

/** Field order for wiki export objects; unknown keys append sorted. */
const FIELD_ORDER: string[] = [
  "pageid",
  "ns",
  "title",
  "displaytitle",
  "fullurl",
  "canonicalurl",
  "talkid",
  "subjectid",
  "revid",
  "parentid",
  "timestamp",
  "length_bytes",
  "contentmodel",
  "contentformat",
  "categories",
  "templates",
  "wikitext",
];

const NDJSON_NAME = "wiki-pages.ndjson";
const EMPTY_CAT_VALUE = "__none__";

type WikiPage = Record<string, unknown>;

type BrowseRow = {
  pageid: number;
  ns: number;
  title: string;
  /** All category strings from the dump (deduped, order preserved). */
  categories: string[];
};

type DetailMode = "details" | "raw";

/**
 * Directory URL for the current HTML page (trailing slash). Avoids mis-resolving
 * `./wiki-pages.ndjson` when the location is `…/repo` without a trailing slash (GitHub Pages).
 */
function directoryBaseHref(): string {
  const u = new URL(window.location.href);
  u.hash = "";
  u.search = "";
  let p = u.pathname;
  if (!p.endsWith("/")) {
    const last = p.split("/").pop() ?? "";
    if (last.includes(".")) {
      p = p.replace(/\/[^/]+$/, "/") || "/";
    } else {
      p = `${p}/`;
    }
  }
  u.pathname = p;
  return u.href;
}

function ndjsonUrl(): string {
  return new URL(NDJSON_NAME, directoryBaseHref()).href;
}

function parseNdjson(text: string): WikiPage[] {
  const out: WikiPage[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    out.push(JSON.parse(line) as WikiPage);
  }
  return out;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function normalizeCategories(categories: unknown): string[] {
  if (!Array.isArray(categories)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of categories) {
    if (typeof x !== "string") continue;
    const s = x.trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function toBrowseRow(p: WikiPage): BrowseRow {
  return {
    pageid: asNumber(p.pageid, -1),
    ns: asNumber(p.ns, 0),
    title: asString(p.title, "(untitled)"),
    categories: normalizeCategories(p.categories),
  };
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Partial<HTMLElementTagNameMap[K]> & { class?: string; text?: string },
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props) {
    const { class: cls, text, ...rest } = props;
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    Object.assign(node, rest);
  }
  for (const c of children) {
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function orderedKeys(obj: Record<string, unknown>): string[] {
  const keys = Object.keys(obj);
  const out: string[] = [];
  for (const k of FIELD_ORDER) {
    if (keys.includes(k)) out.push(k);
  }
  const rest = keys.filter((k) => !out.includes(k)).sort();
  return [...out, ...rest];
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

type WikitextFieldMode = "sections" | "source";

function buildWikitextValueNode(text: string): HTMLElement {
  const wrap = el("div", { class: "wikitext-field" });
  const toolbar = el("div", { class: "wikitext-field-toolbar" });
  const btnSections = el("button", {
    type: "button",
    class: "mode-btn is-active",
    text: "Abschnitte",
  }) as HTMLButtonElement;
  const btnSource = el("button", {
    type: "button",
    class: "mode-btn",
    text: "Quelltext",
  }) as HTMLButtonElement;
  toolbar.append(btnSections, btnSource);

  const sectionsHost = el("div", { class: "wikitext-sections" });
  const preSource = el("pre", { class: "field-value-pre wikitext-source-pre", text });
  preSource.style.display = "none";

  const sections = splitWikitextIntoSections(text);
  for (const sec of sections) {
    const block = el("div", { class: "wikitext-section" });
    const heading = el("div", { class: "wikitext-section-heading" });
    if (sec.level === 0 && sec.title === "") {
      heading.textContent = "Einleitung";
    } else {
      heading.textContent = `${"=".repeat(sec.level)} ${sec.title} ${"=".repeat(sec.level)}`;
    }
    const pre = el("pre", { class: "field-value-pre wikitext-section-pre", text: sec.body });
    block.append(heading, pre);
    sectionsHost.appendChild(block);
  }

  let mode: WikitextFieldMode = "sections";

  function syncToolbar(): void {
    btnSections.classList.toggle("is-active", mode === "sections");
    btnSource.classList.toggle("is-active", mode === "source");
    // Avoid relying on the `hidden` attribute alone (flex + scroll parents can behave oddly).
    sectionsHost.style.display = mode === "sections" ? "flex" : "none";
    preSource.style.display = mode === "source" ? "block" : "none";
  }

  btnSections.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (mode === "sections") return;
    mode = "sections";
    syncToolbar();
  });
  btnSource.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (mode === "source") return;
    mode = "source";
    syncToolbar();
  });

  syncToolbar();
  preSource.textContent = text;
  wrap.append(toolbar, sectionsHost, preSource);
  return wrap;
}

function formatValue(val: unknown, fieldKey: string): Node {
  if (val === null || val === undefined) {
    return el("span", { class: "cell-empty", text: "—" });
  }
  if (fieldKey === "wikitext" && typeof val === "string") {
    return buildWikitextValueNode(val);
  }
  if (Array.isArray(val)) {
    if (val.length === 0) return el("span", { class: "cell-empty", text: "—" });
    return document.createTextNode(val.map(String).join(", "));
  }
  if (typeof val === "object") {
    return document.createTextNode(JSON.stringify(val));
  }
  const s = String(val);
  if (isHttpUrl(s)) {
    const a = el("a", {
      href: s,
      rel: "noopener noreferrer",
      target: "_blank",
      class: "field-link",
    });
    a.textContent = s;
    return a;
  }
  return document.createTextNode(s);
}

function buildFieldList(row: Record<string, unknown>): HTMLElement {
  const list = el("div", { class: "field-list" }, []);
  for (const key of orderedKeys(row)) {
    const valueWrap = el("div", { class: "field-value" }, []);
    valueWrap.appendChild(formatValue(row[key], key));
    list.appendChild(
      el("div", { class: "field-row" }, [
        el("div", { class: "field-key", text: key }),
        valueWrap,
      ]),
    );
  }
  return list;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function uniqueSortedNs(rs: BrowseRow[]): number[] {
  return [...new Set(rs.map((r) => r.ns))].sort((a, b) => a - b);
}

function categoryCounts(rs: BrowseRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rs) {
    if (r.categories.length === 0) {
      m.set("", (m.get("") ?? 0) + 1);
    } else {
      for (const c of r.categories) {
        m.set(c, (m.get(c) ?? 0) + 1);
      }
    }
  }
  return m;
}

/** Category dropdown order: most pages first, then alphabetical tie-break. */
function sortedCategoryKeysByCountDesc(counts: Map<string, number>): string[] {
  return [...counts.keys()].sort((a, b) => {
    const d = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
    if (d !== 0) return d;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });
}

function optionValueForCategoryKey(key: string): string {
  return key === "" ? EMPTY_CAT_VALUE : key;
}

function categoryKeyFromSelectValue(value: string): string | null {
  if (value === "") return null;
  if (value === EMPTY_CAT_VALUE) return "";
  return value;
}

function singleNs(rows: BrowseRow[]): boolean {
  return new Set(rows.map((r) => r.ns)).size <= 1;
}

function groupKey(r: BrowseRow): string {
  return String(r.ns);
}

function formatGroupHead(nsKey: string, oneNs: boolean): string {
  if (oneNs) return "Pages";
  const ns = Number(nsKey) || 0;
  return `ns ${ns}`;
}

function render(root: HTMLElement): void {
  const srcLabel = ndjsonUrl();

  root.appendChild(
    el("header", { class: "site-header" }, [
      el("div", {}, [
        el("h1", { text: "ManiacWiki offline viewer" }),
        el("p", {
          text: "Read-only browse over a local NDJSON page dump (namespace export). Live API wiring can come later.",
        }),
      ]),
      el("div", { class: "source-pill", title: srcLabel, text: `Source: ${NDJSON_NAME}` }),
    ]),
  );

  const status = el("div", { class: "status loading", text: "Loading NDJSON…" });
  root.appendChild(status);

  const detailBody = el("div", { class: "detail-body" });
  const entryActions = el("div", { class: "panel-header-actions", hidden: true });
  const btnDetails = el("button", { type: "button", class: "mode-btn is-active", text: "Details" });
  const btnRaw = el("button", { type: "button", class: "mode-btn", text: "Raw JSON" });
  entryActions.append(btnDetails, btnRaw);

  const browseToolbar = el("div", { class: "browse-toolbar" });
  const browseScroll = el("div", { class: "table-wrap" });

  const layout = el("div", { class: "layout", hidden: true }, [
    el("section", { class: "panel" }, [
      el("div", { class: "panel-header", text: "Pages" }),
      browseToolbar,
      browseScroll,
    ]),
    el("section", { class: "panel" }, [
      el("div", { class: "panel-header panel-header--split" }, [
        el("span", { text: "Page" }),
        entryActions,
      ]),
      detailBody,
    ]),
  ]);
  root.appendChild(layout);

  const foot = el("footer", { class: "footer-note" });
  foot.append(
    "Wiki: ",
    el("a", { href: "http://wiki.maniac-mansion-mania.de/", text: "ManiacWiki" }),
    " · Default dump: ",
    el("code", { class: "mono", text: "../mmm-wiki-api-access/data/main_namespace.ndjson" }),
    " or ",
    el("code", { class: "mono", text: "./data/main_namespace.ndjson" }),
    "; override with ",
    el("code", { class: "mono", text: "WIKI_NDJSON_PATH" }),
    ". Served as ",
    el("code", { class: "mono", text: NDJSON_NAME }),
    ". See this repo’s README.",
  );
  root.appendChild(foot);

  const tableHost = browseScroll;

  let pages: WikiPage[] = [];
  let pageById = new Map<number, WikiPage>();
  let rows: BrowseRow[] = [];
  let selectedPageid: number | null = null;

  const browseFilter = { query: "", categorySelect: "" as string, nsSelect: "" as string };

  const browseSearch = el("input", {
    type: "search",
    class: "browse-search",
    placeholder: "Filter by pageid, title, category, or wikitext…",
    spellcheck: false,
  }) as HTMLInputElement;

  const browseNs = el("select", {
    id: "browse-ns-filter",
    class: "browse-select",
  }) as HTMLSelectElement;
  browseNs.setAttribute("aria-label", "Namespace filter");

  const browseCat = el("select", {
    id: "browse-cat-filter",
    class: "browse-select",
  }) as HTMLSelectElement;
  browseCat.setAttribute("aria-label", "Filter pages that include this category");

  const browseSummary = el("span", { class: "browse-summary" });

  let browseChromeReady = false;

  const detailState: { row: WikiPage | null; mode: DetailMode } = {
    row: null,
    mode: "details",
  };

  function syncModeButtons(): void {
    btnDetails.classList.toggle("is-active", detailState.mode === "details");
    btnRaw.classList.toggle("is-active", detailState.mode === "raw");
  }

  function renderDetailBody(): void {
    detailBody.replaceChildren();
    if (!detailState.row) {
      entryActions.hidden = true;
      detailBody.appendChild(
        el("p", { class: "muted", text: "Select a page from the list." }),
      );
      return;
    }
    entryActions.hidden = false;
    syncModeButtons();
    if (detailState.mode === "raw") {
      detailBody.appendChild(
        el("pre", {}, [JSON.stringify(detailState.row, null, 2)]),
      );
    } else {
      detailBody.appendChild(buildFieldList(detailState.row));
    }
  }

  btnDetails.addEventListener("click", () => {
    if (!detailState.row || detailState.mode === "details") return;
    detailState.mode = "details";
    renderDetailBody();
  });

  btnRaw.addEventListener("click", () => {
    if (!detailState.row || detailState.mode === "raw") return;
    detailState.mode = "raw";
    renderDetailBody();
  });

  function syncBrowseSelection(): void {
    const id = selectedPageid;
    for (const rowEl of tableHost.querySelectorAll(".catalog-row")) {
      const pid = Number(rowEl.getAttribute("data-pageid"));
      rowEl.classList.toggle("selected", id !== null && pid === id);
    }
  }

  function rowMatchesBrowseFilter(r: BrowseRow): boolean {
    const nsSel = browseFilter.nsSelect;
    if (nsSel !== "") {
      const want = Number(nsSel);
      if (Number.isFinite(want) && r.ns !== want) return false;
    }
    const catSel = browseFilter.categorySelect;
    if (catSel !== "") {
      const want = categoryKeyFromSelectValue(catSel);
      if (want !== null) {
        if (want === "") {
          if (r.categories.length > 0) return false;
        } else if (!r.categories.includes(want)) {
          return false;
        }
      }
    }
    const q = browseFilter.query.trim().toLowerCase();
    if (!q) return true;
    const page = pageById.get(r.pageid);
    const wikiBlob = page ? JSON.stringify(page).toLowerCase() : "";
    const catBlob = r.categories.join(" ").toLowerCase();
    return (
      String(r.pageid).includes(q) ||
      r.title.toLowerCase().includes(q) ||
      catBlob.includes(q) ||
      wikiBlob.includes(q)
    );
  }

  function filteredBrowseRows(): BrowseRow[] {
    return rows.filter(rowMatchesBrowseFilter);
  }

  function fillNsSelect(): void {
    const prev = browseNs.value;
    browseNs.replaceChildren();
    browseNs.appendChild(el("option", { value: "", text: `All namespaces (${rows.length})` }));
    for (const ns of uniqueSortedNs(rows)) {
      const n = rows.filter((r) => r.ns === ns).length;
      browseNs.appendChild(
        el("option", { value: String(ns), text: `ns ${ns} (${n})` }),
      );
    }
    const keys = new Set(uniqueSortedNs(rows).map(String));
    if (prev === "" || keys.has(prev)) browseNs.value = prev;
    else browseNs.value = "";
    browseFilter.nsSelect = browseNs.value;
  }

  function fillCategorySelect(): void {
    const prev = browseCat.value;
    browseCat.replaceChildren();
    browseCat.appendChild(
      el("option", { value: "", text: `Any category (${rows.length})` }),
    );
    const counts = categoryCounts(rows);
    const keysOrder = sortedCategoryKeysByCountDesc(counts);
    for (const key of keysOrder) {
      const n = counts.get(key) ?? 0;
      const label = key === "" ? `(no category) (${n})` : `${key} (${n})`;
      browseCat.appendChild(
        el("option", { value: optionValueForCategoryKey(key), text: label }),
      );
    }
    const keys = new Set(keysOrder.map((k) => optionValueForCategoryKey(k)));
    if (prev === "" || keys.has(prev)) browseCat.value = prev;
    else browseCat.value = "";
    browseFilter.categorySelect = browseCat.value;
  }

  function makeCatalogRow(r: BrowseRow): HTMLButtonElement {
    const btn = el("button", {
      type: "button",
      class: "catalog-row",
    }) as HTMLButtonElement;
    btn.dataset.pageid = String(r.pageid);
    const catLabel = r.categories.length === 0 ? "—" : r.categories.join(" · ");
    btn.appendChild(
      el("span", { class: "catalog-row-meta" }, [
        el("span", { class: "catalog-id mono", text: `pageid ${r.pageid}` }),
        el("span", { class: "catalog-cat mono", text: `ns ${r.ns}` }),
        el("span", { class: "catalog-cat catalog-cat-all", text: catLabel }),
      ]),
    );
    btn.appendChild(el("span", { class: "catalog-title", text: r.title }));
    btn.addEventListener("click", () => {
      showDetail(r.pageid);
    });
    return btn;
  }

  function groupRowsByKey(list: BrowseRow[]): Map<string, BrowseRow[]> {
    const map = new Map<string, BrowseRow[]>();
    for (const r of list) {
      const k = groupKey(r);
      const arr = map.get(k);
      if (arr) arr.push(r);
      else map.set(k, [r]);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    }
    return map;
  }

  function sortedGroupKeys(keys: string[]): string[] {
    return [...keys].sort((a, b) => Number(a) - Number(b));
  }

  function renderCatalogList(): void {
    const filtered = filteredBrowseRows();
    browseSummary.textContent =
      filtered.length === rows.length
        ? `${rows.length} pages`
        : `${filtered.length} shown · ${rows.length} total`;

    const oneNs = singleNs(rows);

    tableHost.replaceChildren();
    if (filtered.length === 0) {
      tableHost.appendChild(
        el("p", {
          class: "browse-empty muted",
          text: "No pages match the current filters. Clear search or reset the dropdowns.",
        }),
      );
      syncBrowseSelection();
      return;
    }

    const q = browseFilter.query.trim();
    const narrowed = browseFilter.categorySelect !== "" || browseFilter.nsSelect !== "";
    const useGroups = !q && !narrowed;

    if (useGroups) {
      const byKey = groupRowsByKey(filtered);
      const keys = sortedGroupKeys([...byKey.keys()]);
      for (const key of keys) {
        const blockRows = byKey.get(key);
        if (!blockRows?.length) continue;
        tableHost.appendChild(
          el("h3", { class: "catalog-group-head", text: formatGroupHead(key, oneNs) }),
        );
        const list = el("div", { class: "catalog-rows" }, []);
        for (const r of blockRows) list.appendChild(makeCatalogRow(r));
        tableHost.appendChild(list);
      }
    } else {
      const sorted = [...filtered].sort((a, b) => {
        if (a.ns !== b.ns) return a.ns - b.ns;
        const ca = (a.categories[0] ?? "").localeCompare(b.categories[0] ?? "", undefined, {
          sensitivity: "base",
        });
        if (ca !== 0) return ca;
        return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      });
      const list = el("div", { class: "catalog-rows" }, []);
      for (const r of sorted) list.appendChild(makeCatalogRow(r));
      tableHost.appendChild(list);
    }
    syncBrowseSelection();
  }

  function setupBrowseChrome(): void {
    if (!browseChromeReady) {
      browseChromeReady = true;
      browseToolbar.append(
        browseSearch,
        el("div", { class: "browse-toolbar-row" }, [
          el("label", { class: "browse-label", htmlFor: "browse-ns-filter", text: "Namespace" }),
          browseNs,
        ]),
        el("div", { class: "browse-toolbar-row" }, [
          el("label", { class: "browse-label", htmlFor: "browse-cat-filter", text: "Has category" }),
          browseCat,
          browseSummary,
        ]),
      );
      browseSearch.addEventListener("input", () => {
        browseFilter.query = browseSearch.value;
        renderCatalogList();
      });
      browseNs.addEventListener("change", () => {
        browseFilter.nsSelect = browseNs.value;
        renderCatalogList();
      });
      browseCat.addEventListener("change", () => {
        browseFilter.categorySelect = browseCat.value;
        renderCatalogList();
      });
    }
    fillNsSelect();
    fillCategorySelect();
  }

  function showDetail(pageid: number): void {
    selectedPageid = pageid;
    syncBrowseSelection();
    const row = pageById.get(pageid) ?? null;
    detailState.row = row;
    detailState.mode = "details";
    renderDetailBody();
  }

  renderDetailBody();

  void (async () => {
    try {
      const url = ndjsonUrl();
      const res = await fetch(url);
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText}${t ? `: ${t.slice(0, 400)}` : ""}`);
      }
      const text = await res.text();
      pages = parseNdjson(text);
      pageById = new Map<number, WikiPage>();
      for (const p of pages) {
        const id = asNumber(p.pageid, Number.NaN);
        if (Number.isFinite(id)) pageById.set(id, p);
      }
      rows = pages.map(toBrowseRow);
      status.remove();
      layout.hidden = false;
      setupBrowseChrome();
      renderCatalogList();
      if (rows.length === 0) {
        detailBody.innerHTML = '<p class="status error">NDJSON contained no rows.</p>';
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      status.className = "status error";
      status.innerHTML = `Failed to load NDJSON (${escapeHtml(srcLabel)}): ${escapeHtml(msg)}`;
    }
  })();
}

render(document.getElementById("app")!);
