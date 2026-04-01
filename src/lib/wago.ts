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

export function parseCsv(content: string): Row[] {
  const lines = content.split("\n");
  const headers = lines[0].split(",");
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cols = lines[i].split(",");
    const row: Row = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = cols[j] ?? "";
    rows.push(row);
  }
  return rows;
}

export function indexBy(rows: Row[], key: string): Map<string, Row> {
  const map = new Map<string, Row>();
  for (const row of rows) map.set(row[key], row);
  return map;
}

export function indexByMulti(rows: Row[], key: string): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const k = row[key];
    const arr = map.get(k);
    if (arr) arr.push(row);
    else map.set(k, [row]);
  }
  return map;
}
