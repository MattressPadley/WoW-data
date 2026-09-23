// Pure search and instance → boss facet logic for the Forever item browser.
//
// Lives under .tome/widgets/lib/ so the widget can import it; its tests live in
// src/lib/forever-view-filters.test.ts, because tome builds every non-`_` file
// here for the browser and a bun:test import would break that build.
//
// The item → boss mapping is already on the view rows (`drop_sources[]`). This
// only indexes it, and always joins on the wowtbc dungeon *key* — AtlasLoot and
// wowtbc name instances differently ("The Hall of Thanes" / "Hall of Thanes").

export type DropKind = "boss" | "trash" | "quest";

export interface DropSourceRef {
  dungeon_key: string;
  kind: DropKind;
  name?: string;
}

export interface InstanceBoss {
  name: string;
  status: "listed" | "unknown";
  unknown?: string;
}

/** One `items-view.json` `meta.instances[]` entry. */
export interface InstanceEntry {
  key: string;
  name: string;
  kind: "dungeon" | "raid";
  is_new: boolean;
  status: "listed" | "unknown";
  unknown: string[];
  bosses: InstanceBoss[];
  has_trash: boolean;
  quests: string[];
  sources: { source: string; fetched_at?: string; upstream_commit?: string }[];
}

interface Row {
  id: number;
  name: string;
  drop_sources?: DropSourceRef[];
}

/* ── Search ── */

/**
 * All-digit input is an item id and matches exactly — a substring match on ids
 * would hit thousands of rows. Anything else is a case-insensitive name
 * substring. An empty query matches everything.
 */
export function matchesQuery(item: Row, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (/^\d+$/.test(needle)) return String(item.id) === needle;
  return item.name.toLowerCase().includes(needle);
}

/* ── Drop index ── */

/** Facet value for "everything the instance drops". */
export const FACET_ALL = "all";
/** Facet value for "every quest reward in the instance". */
export const FACET_QUESTS = "quests";

/** `key|kind|name` — name is empty for trash. */
export function dropKey(dungeonKey: string, kind: DropKind | typeof FACET_ALL | typeof FACET_QUESTS, name = ""): string {
  return `${dungeonKey}|${kind}|${name}`;
}

/**
 * `key|kind|name` → item ids, plus per-instance `key|all|` and `key|quests|`
 * rollups. Built once per row set.
 */
export function buildDropIndex(rows: readonly Row[]): Map<string, Set<number>> {
  const index = new Map<string, Set<number>>();
  const add = (k: string, id: number) => {
    const set = index.get(k);
    if (set) set.add(id);
    else index.set(k, new Set([id]));
  };
  for (const item of rows) {
    for (const s of item.drop_sources ?? []) {
      add(dropKey(s.dungeon_key, s.kind, s.kind === "trash" ? "" : (s.name ?? "")), item.id);
      add(dropKey(s.dungeon_key, FACET_ALL), item.id);
      if (s.kind === "quest") add(dropKey(s.dungeon_key, FACET_QUESTS), item.id);
    }
  }
  return index;
}

/**
 * Item ids for an instance + facet value, or null when no facet is active
 * (no instance picked). An empty set is a real answer: nothing resolves.
 */
export function facetItemIds(
  index: Map<string, Set<number>>,
  instanceKey: string | null,
  value: string,
): Set<number> | null {
  if (!instanceKey) return null;
  return index.get(`${instanceKey}|${value || `${FACET_ALL}|`}`) ?? new Set();
}

/* ── Facet options ── */

export interface FacetOption {
  /** `kind|name` — pass straight to {@link facetItemIds}. */
  value: string;
  label: string;
  kind: "all" | DropKind | "quests";
  count: number;
  /** Set when nothing in this view resolves to the value. Rendered, never hidden. */
  unknown?: string;
}

const NO_ITEMS = "no item in this view resolves to it";

/**
 * The second-level options for one instance: all drops, each boss (unknown
 * ones included and labelled), trash as its own value — never a boss — and
 * quests (all, then each).
 */
export function facetOptions(entry: InstanceEntry, index: Map<string, Set<number>>): FacetOption[] {
  const count = (k: string) => index.get(k)?.size ?? 0;
  const instanceUnknown = entry.unknown[0];
  const all = count(dropKey(entry.key, FACET_ALL));
  const options: FacetOption[] = [
    {
      value: `${FACET_ALL}|`,
      label: "All drops",
      kind: "all",
      count: all,
      ...(all === 0 ? { unknown: instanceUnknown ?? NO_ITEMS } : {}),
    },
  ];
  for (const boss of entry.bosses) {
    const n = boss.status === "listed" ? count(dropKey(entry.key, "boss", boss.name)) : 0;
    options.push({
      value: `boss|${boss.name}`,
      label: boss.name,
      kind: "boss",
      count: n,
      ...(n === 0 ? { unknown: boss.unknown ?? NO_ITEMS } : {}),
    });
  }
  if (entry.has_trash) {
    options.push({ value: "trash|", label: "Trash", kind: "trash", count: count(dropKey(entry.key, "trash")) });
  }
  if (entry.quests.length > 0) {
    options.push({ value: `${FACET_QUESTS}|`, label: "All quest rewards", kind: "quests", count: count(dropKey(entry.key, FACET_QUESTS)) });
    for (const quest of entry.quests) {
      const n = count(dropKey(entry.key, "quest", quest));
      options.push({ value: `quest|${quest}`, label: `Quest: ${quest}`, kind: "quest", count: n, ...(n === 0 ? { unknown: NO_ITEMS } : {}) });
    }
  }
  return options;
}

/** Instance select label: kind, "new", and an explicit unknown marker. */
export function instanceLabel(entry: InstanceEntry): string {
  const tags = [entry.kind === "raid" ? "raid" : null, entry.is_new ? "new" : null, entry.status === "unknown" ? "unknown" : null]
    .filter(Boolean)
    .join(", ");
  return tags ? `${entry.name} (${tags})` : entry.name;
}

/** Facet option label with its count, or "unknown" in place of a zero count. */
export function facetOptionLabel(option: FacetOption): string {
  return option.unknown ? `${option.label} — unknown` : `${option.label} (${option.count})`;
}

/** Source labels. Both loot sources are datamined; neither is observed in-game. */
export const LOOT_SOURCE_LABEL: Record<string, string> = {
  "wowtbc-warcraftforever": "wowtbc.gg, datamined",
  "atlaslootclassic-extract": "AtlasLoot extract, datamined",
};

export function sourceLabel(source: string): string {
  return LOOT_SOURCE_LABEL[source] ?? source;
}
