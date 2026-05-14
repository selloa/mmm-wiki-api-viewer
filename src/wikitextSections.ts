/**
 * Heuristic MediaWiki-style headings: same count of "=" at start and end (2–6).
 * Lines that do not match (e.g. unbalanced "=") stay in section body.
 */
const HEADING_LINE = /^(={2,6})\s*(.+?)\s*\1\s*$/;

export type WikiSection = {
  /** Number of "=" on each side (2–6); 0 = lead before first heading. */
  level: number;
  /** Heading inner text; empty for lead block. */
  title: string;
  /** Raw wikitext for this block (no heading line included). */
  body: string;
};

export function parseHeadingLine(line: string): { level: number; title: string } | null {
  const m = line.trim().match(HEADING_LINE);
  if (!m) return null;
  const eq = m[1];
  return { level: eq.length, title: m[2].trim() };
}

/**
 * Split full page wikitext into sections at heading lines.
 * Skips a completely empty lead block when the page starts with a heading.
 */
export function splitWikitextIntoSections(source: string): WikiSection[] {
  const lines = source.split(/\r?\n/);
  const out: WikiSection[] = [];
  let curLevel = 0;
  let curTitle = "";
  const curLines: string[] = [];

  function flush(): void {
    const body = curLines.join("\n");
    if (curLevel === 0 && curTitle === "" && body === "" && out.length === 0) {
      return;
    }
    out.push({ level: curLevel, title: curTitle, body });
    curLines.length = 0;
  }

  for (const line of lines) {
    const head = parseHeadingLine(line);
    if (head) {
      flush();
      curLevel = head.level;
      curTitle = head.title;
      continue;
    }
    curLines.push(line);
  }

  flush();

  if (out.length === 0) {
    return [{ level: 0, title: "", body: source }];
  }
  return out;
}
