/**
 * Shared utilities for fetching and parsing wago.tools DB2 CSV exports.
 *
 * Cache layout is keyed by product and build:
 *   data/cache/<product>/<build|live>/<name>.csv
 * Pinned builds are immutable, so they never expire; only `live` honours the TTL.
 */

import { mkdir, stat } from "node:fs/promises";

const CACHE_DIR = "data/cache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const WAGO_BASE = "https://wago.tools/db2";
const WAGO_BUILDS = "https://wago.tools/api/builds";

/** Retail live product string. */
export const PRODUCT_RETAIL = "wow";
/** Sentinel build meaning "whatever wago serves as current for this product". */
export const BUILD_LIVE = "live";

export type Row = Record<string, string>;

export interface WagoOptions {
  /** wago product key, e.g. `wow` (retail) or `wow_classic_beta`. Defaults to retail. */
  product?: string;
  /** Exact build string, e.g. `1.60.1.69977`. Defaults to `live`. */
  build?: string;
}

export interface WagoBuild {
  product: string;
  version: string;
  created_at: string;
  build_config: string;
  product_config: string;
  cdn_config: string;
  is_bgdl: boolean;
}

function cachePath(name: string, opts?: WagoOptions): string {
  const product = opts?.product ?? PRODUCT_RETAIL;
  const build = opts?.build ?? BUILD_LIVE;
  return `${CACHE_DIR}/${product}/${build}/${name}.csv`;
}

/**
 * Fetch `url` through a file cache at `path`.
 *
 * `immutable` entries never expire; everything else honours the 24h TTL.
 * `headers` is for non-wago sources that need them (e.g. a browser UA).
 */
export async function cachedFetch(
  url: string,
  path: string,
  noCache: boolean,
  immutable: boolean,
  label: string,
  headers?: Record<string, string>,
): Promise<string> {
  if (!noCache) {
    try {
      const s = await stat(path);
      if (immutable || Date.now() - s.mtimeMs < CACHE_TTL_MS) {
        return await Bun.file(path).text();
      }
    } catch {}
  }
  const res = await fetch(url, headers ? { headers } : undefined);
  if (!res.ok) throw new Error(`Failed to fetch ${label}: ${res.status}`);
  const text = await res.text();
  await mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  await Bun.write(path, text);
  return text;
}

export async function getCachedCsv(name: string, noCache: boolean, opts?: WagoOptions): Promise<string> {
  const build = opts?.build ?? BUILD_LIVE;
  const url = build === BUILD_LIVE ? `${WAGO_BASE}/${name}/csv` : `${WAGO_BASE}/${name}/csv?build=${encodeURIComponent(build)}`;
  return cachedFetch(url, cachePath(name, opts), noCache, build !== BUILD_LIVE, `${name} CSV`);
}

/** All builds wago knows about, grouped by product key. */
export async function getBuilds(noCache: boolean): Promise<Record<string, WagoBuild[]>> {
  const text = await cachedFetch(WAGO_BUILDS, `${CACHE_DIR}/builds.json`, noCache, false, "builds index");
  return JSON.parse(text) as Record<string, WagoBuild[]>;
}

/**
 * Newest build for a product, optionally restricted to a version prefix.
 *
 * The prefix filter is mandatory for products whose key mixes branches — e.g.
 * `wow_classic_beta` holds both MoP-Classic `5.5.0.x` and Forever `1.60.1.x`,
 * and the array is not globally ordered by `created_at`.
 */
export async function resolveBuild(product: string, versionPrefix: string | undefined, noCache: boolean): Promise<WagoBuild> {
  const builds = await getBuilds(noCache);
  const all = builds[product];
  if (!all || all.length === 0) throw new Error(`No builds listed for product ${product}`);
  const matching = versionPrefix ? all.filter((b) => b.version.startsWith(versionPrefix)) : all;
  if (matching.length === 0) {
    throw new Error(`No builds for product ${product} matching version prefix ${versionPrefix}`);
  }
  const sorted = [...matching].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  return sorted[0]!;
}

export interface EnumDefinition {
  value: string;
  name: string;
  isVerified: boolean;
  comment: string | null;
}

export interface ColumnEnum {
  table: string;
  column: string;
  name: string;
  definitions: EnumDefinition[];
}

/**
 * DBD enum definitions wago publishes alongside a table's browse page.
 *
 * This is the authoritative mapping for enum-typed columns (e.g. the
 * `ItemStatType` enum behind `ItemSparse.StatModifier_bonusStat[n]`) — it is
 * scraped from the page's embedded Inertia payload rather than hardcoded.
 */
export async function getColumnEnums(table: string, opts: WagoOptions | undefined, noCache: boolean): Promise<ColumnEnum[]> {
  const build = opts?.build ?? BUILD_LIVE;
  const product = opts?.product ?? PRODUCT_RETAIL;
  const url = build === BUILD_LIVE ? `${WAGO_BASE}/${table}` : `${WAGO_BASE}/${table}?build=${encodeURIComponent(build)}`;
  const path = `${CACHE_DIR}/${product}/${build}/${table}.page.html`;
  const html = await cachedFetch(url, path, noCache, build !== BUILD_LIVE, `${table} page`);

  const match = html.match(/data-page="([^"]*)"/);
  if (!match?.[1]) throw new Error(`Could not locate wago page payload for ${table}`);
  const payload = JSON.parse(decodeHtmlEntities(match[1])) as {
    props?: { dbdMeta?: { enums?: ColumnEnum[] } };
  };
  const enums = payload.props?.dbdMeta?.enums;
  if (!enums) throw new Error(`wago page payload for ${table} has no dbdMeta.enums`);
  return enums;
}

const HTML_ENTITIES: Record<string, string> = {
  quot: '"',
  apos: "'",
  amp: "&",
  lt: "<",
  gt: ">",
  nbsp: " ",
};

function decodeHtmlEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) return String.fromCodePoint(parseInt(body.slice(2), 16));
    if (body.startsWith("#")) return String.fromCodePoint(parseInt(body.slice(1), 10));
    return HTML_ENTITIES[body.toLowerCase()] ?? whole;
  });
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
