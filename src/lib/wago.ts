/**
 * Shared utilities for fetching and parsing wago.tools DB2 CSV exports.
 */

import { mkdir, stat } from "node:fs/promises";

const CACHE_DIR = "data/cache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const WAGO_BASE = "https://wago.tools/db2";

export type Row = Record<string, string>;

export async function getCachedCsv(name: string, noCache: boolean): Promise<string> {
  const path = `${CACHE_DIR}/${name}.csv`;
  if (!noCache) {
    try {
      const s = await stat(path);
      if (Date.now() - s.mtimeMs < CACHE_TTL_MS) {
        return await Bun.file(path).text();
      }
    } catch {}
  }
  const res = await fetch(`${WAGO_BASE}/${name}/csv`);
  if (!res.ok) throw new Error(`Failed to fetch ${name} CSV: ${res.status}`);
  const text = await res.text();
  await mkdir(CACHE_DIR, { recursive: true });
  await Bun.write(path, text);
  return text;
}

/**
 * RFC4180 CSV parser.
 *
 * Fields may be double-quoted, quoted fields may contain commas, CRLF/LF
 * newlines and escaped quotes (`""`). wago's `ItemSparse` export relies on all
 * three (773 of ~19k rows carry quoted fields and one has an embedded newline),
 * so naive `split(",")` mis-columns those rows.
 */
export function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let sawAnything = false;

  const endField = () => {
    row.push(field);
    field = "";
    sawAnything = true;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    sawAnything = false;
  };

  for (let i = 0; i < content.length; i++) {
    const c = content[i]!;
    if (quoted) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    switch (c) {
      case '"':
        // A quote only opens a quoted field at the start of one; mid-field
        // quotes are kept verbatim (wago emits a few of those).
        if (field === "") quoted = true;
        else field += c;
        break;
      case ",":
        endField();
        break;
      case "\r":
        if (content[i + 1] === "\n") i++;
        endRow();
        break;
      case "\n":
        endRow();
        break;
      default:
        field += c;
    }
  }
  // Trailing field/row only counts if the file did not end on a newline.
  if (quoted || field !== "" || sawAnything) endRow();
  return rows;
}

export function parseCsv(content: string): Row[] {
  const raw = parseCsvRows(content);
  if (raw.length === 0) return [];
  const headers = raw[0]!;
  const rows: Row[] = [];
  for (let i = 1; i < raw.length; i++) {
    const cols = raw[i]!;
    // Skip the blank line a trailing newline leaves behind.
    if (cols.length === 1 && cols[0] === "") continue;
    const row: Row = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]!] = cols[j] ?? "";
    rows.push(row);
  }
  return rows;
}

export function indexBy(rows: Row[], key: string): Map<string, Row> {
  const map = new Map<string, Row>();
  for (const row of rows) map.set(row[key]!, row);
  return map;
}

export function indexByMulti(rows: Row[], key: string): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const k = row[key]!;
    const arr = map.get(k);
    if (arr) arr.push(row);
    else map.set(k, [row]);
  }
  return map;
}
