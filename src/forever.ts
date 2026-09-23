#!/usr/bin/env bun
/**
 * forever.ts — WoW Forever data (Vanilla content on the retail engine)
 *
 * Forever data comes from wago.tools DB2 exports for the current Forever build,
 * a vendored offline extract of reused-Vanilla loot tables, and a locally derived
 * (gitignored) extract of wowtbc.gg's datamined dungeon tables. It deliberately
 * never touches the Blizzard API (dark for the beta) or the retail Encounter
 * Journal, so no credentials are required.
 *
 * Usage:
 *   bun run src/forever.ts --build-info [--pretty]
 *   bun run src/forever.ts --refresh-enums [--build 1.60.1.69977]
 *   bun run src/forever.ts --ingest [--build 1.60.1.69977] [--no-cache]
 *   bun run src/forever.ts --ingest-wowtbc [--build 1.60.1.69977] [--no-cache]
 *   bun run src/forever.ts --item 12640 [--pretty]
 *   bun run src/forever.ts --search "Lionheart" [--limit 20]
 *   bun run src/forever.ts --list-instances [--pretty]
 *   bun run src/forever.ts --audit-loot [--pretty]
 *   bun run src/forever.ts --loot "Ragefire" [--pretty]
 *   bun run src/forever.ts --item-sources 12640 [--pretty]
 */

import { getArg, hasFlag, output } from "./utils.ts";
import {
  auditLoot,
  auditWowtbc,
  findInstance,
  findItemSources,
  ingestCatalog,
  ingestWowtbcTables,
  loadCatalog,
  nameLootEntries,
  loadDungeonLoot,
  mergeInstances,
  refreshEnumSnapshots,
  resolveForeverBuild,
  resolveItemName,
  wowtbcItemFacts,
  ATLASLOOT_SOURCE,
  FOREVER_PRODUCT,
  FOREVER_VERSION_PREFIX,
  type ForeverCatalog,
  type LootExtract,
} from "./lib/forever.ts";
import {
  findWowtbcDungeon,
  findWowtbcSources,
  loadWowtbc,
  sameName,
  WOWTBC_MISSING,
  type WowtbcDungeon,
  type WowtbcExtract,
} from "./lib/forever-wowtbc.ts";

const pretty = hasFlag("--pretty");
const noCache = hasFlag("--no-cache");

async function build(): Promise<string> {
  const pinned = getArg("--build");
  if (pinned) return pinned;
  return (await resolveForeverBuild(noCache)).version;
}

const NO_SOURCE =
  "no drop source known: not in the vendored reused-Vanilla extract or the wowtbc datamined tables; Forever drop sources are server-side and not in the client";

/** Every known source for an item, each stamped with where it came from. Null = none known. */
function allSources(loot: LootExtract | null, wowtbc: WowtbcExtract | null, id: number) {
  const out = [
    ...(loot ? findItemSources(loot, id).map((s) => ({ ...s, source: ATLASLOOT_SOURCE })) : []),
    ...(wowtbc
      ? findWowtbcSources(wowtbc, id).map((s) => ({ ...s, source: s.provenance.source }))
      : []),
  ];
  return out.length > 0 ? out : null;
}

/** A wowtbc dungeon with every item id named (build first, gap item second). */
function namedDungeon(d: WowtbcDungeon, catalog: ForeverCatalog | null, wowtbc: WowtbcExtract) {
  const byId = catalog ? new Map(catalog.items.map((i) => [i.id, i])) : null;
  const name = (id: number, kind: "drop" | "quest") => {
    const item = wowtbc.items[String(id)];
    return {
      item_id: id,
      ...resolveItemName(id, byId, wowtbc),
      discovered: item?.provenance.discovered ?? null,
      content: item?.content ?? null,
      // Vanilla-observed; null for new content by construction, and a quest reward never carries one.
      vanilla_drop_chance: kind === "quest" ? null : item?.vanilla_drop_chance ?? null,
    };
  };
  return {
    ...d,
    source: wowtbc.meta.source,
    bosses: Object.fromEntries(Object.entries(d.bosses).map(([boss, b]) => [boss, b.item_ids.map((id) => name(id, "drop"))])),
    trash: d.trash ? d.trash.item_ids.map((id) => name(id, "drop")) : null,
    quests: d.quests.map((q) => ({ ...q, items: q.item_ids.map((id) => name(id, "quest")) })),
  };
}

try {
  if (hasFlag("--build-info")) {
    const info = await resolveForeverBuild(noCache);
    output({ product: FOREVER_PRODUCT, version_prefix: FOREVER_VERSION_PREFIX, build: info }, pretty);
  } else if (hasFlag("--refresh-enums")) {
    const b = await build();
    const snapshots = await refreshEnumSnapshots(b, noCache);
    output(
      {
        build: b,
        enums: snapshots.map((s) => ({ enum: s.enum, column: s.column, value_count: Object.keys(s.values).length, source: s.source })),
      },
      pretty,
    );
  } else if (hasFlag("--ingest-wowtbc")) {
    const b = await build();
    console.error(`Ingesting wowtbc dungeon tables against Forever build ${b}…`);
    const extract = await ingestWowtbcTables(b, noCache);
    output(extract.meta, pretty);
  } else if (hasFlag("--ingest")) {
    const b = await build();
    console.error(`Ingesting Forever build ${b}…`);
    const catalog = await ingestCatalog(b, noCache);
    output({ ...catalog.meta, sample: catalog.items.slice(0, 3).map((i) => ({ id: i.id, name: i.name })) }, pretty);
  } else if (getArg("--item")) {
    const id = parseInt(getArg("--item")!, 10);
    const [catalog, wowtbc, loot] = await Promise.all([
      loadCatalog(),
      loadWowtbc(),
      loadDungeonLoot().catch(() => null),
    ]);
    const item = catalog.items.find((i) => i.id === id);
    const gap = item ? undefined : wowtbc?.gap_items[String(id)];
    if (!item && !gap) {
      output(
        {
          error: `Item ${id} not in Forever build ${catalog.meta.build}${wowtbc ? " or the wowtbc tables" : ""}`,
          ...(wowtbc ? {} : { hint: WOWTBC_MISSING }),
        },
        pretty,
      );
      process.exit(1);
    }
    const sources = allSources(loot, wowtbc, id);
    output(
      {
        build: catalog.meta.build,
        // Build rows win; a gap item exists only because the build has no ItemSparse row.
        item: item ?? null,
        gap_item: gap ?? undefined,
        gap_item_note: gap
          ? "the build has no ItemSparse row for this id; fields are per field_sources (wago Item table first, then wowtbc datamined)"
          : undefined,
        // Upstream's view of a build item: a cross-check, never a value source.
        wowtbc: item && wowtbc ? wowtbcItemFacts(wowtbc, id) : undefined,
        drop_sources: sources,
        drop_sources_unknown: sources ? undefined : NO_SOURCE,
      },
      pretty,
    );
  } else if (getArg("--search")) {
    const needle = getArg("--search")!.toLowerCase();
    const limit = parseInt(getArg("--limit") ?? "20", 10);
    const [catalog, wowtbc] = await Promise.all([loadCatalog(), loadWowtbc()]);
    const buildIds = new Set(catalog.items.map((i) => i.id));
    const matches = [
      ...catalog.items
        .filter((i) => i.name.toLowerCase().includes(needle))
        .map((i) => ({
          id: i.id,
          name: i.name,
          item_level: i.item_level,
          quality: i.quality,
          inventory_type: i.inventory_type,
          stats: i.stats.map((s) => ({ stat: s.stat, value: s.value, unknown: s.unknown })),
        })),
      ...Object.values(wowtbc?.gap_items ?? {})
        .filter((g) => !buildIds.has(g.id) && g.name.toLowerCase().includes(needle))
        .map((g) => ({
          id: g.id,
          name: g.name,
          item_level: g.item_level,
          quality: g.quality,
          inventory_type: g.inventory_type,
          data_source: g.provenance.source,
          discovered: g.provenance.discovered,
          // Raw upstream stats — deliberately not under `stats`, which means build-computed.
          upstream_stats: g.upstream_stats,
        })),
    ].sort((a, b) => a.id - b.id);
    output(
      {
        build: catalog.meta.build,
        query: getArg("--search"),
        total_matches: matches.length,
        wowtbc_included: wowtbc !== null,
        items: matches.slice(0, limit),
      },
      pretty,
    );
  } else if (hasFlag("--list-instances")) {
    const [loot, wowtbc] = await Promise.all([loadDungeonLoot(), loadWowtbc()]);
    const summary = (d: WowtbcDungeon) => ({
      key: d.key,
      status: d.status,
      is_new: d.is_new,
      boss_count: Object.keys(d.bosses).length,
      item_count: new Set([
        ...Object.values(d.bosses).flatMap((b) => b.item_ids),
        ...(d.trash?.item_ids ?? []),
        ...d.quests.flatMap((q) => q.item_ids),
      ]).size,
      quest_count: d.quests.length,
      ...(d.unknown.length > 0 ? { unknown: d.unknown } : {}),
      source: wowtbc!.meta.source,
    });
    const instances = mergeInstances(loot, wowtbc).map(({ atlasloot: i, wowtbc: w }) =>
      i
        ? {
            key: i.key,
            name: i.name,
            content_type: i.content_type,
            provenance: i.provenance,
            boss_count: i.bosses.length,
            bosses_with_unknown_loot: i.bosses.filter((b) => b.loot_status === "unknown-new-content").length,
            wowtbc: w ? summary(w) : null,
          }
        : {
            key: w!.key,
            name: w!.name,
            content_type: "Dungeons",
            provenance: w!.is_new ? "forever-new" : "vanilla",
            atlasloot: null,
            wowtbc: summary(w!),
          }
    );
    output(
      {
        ...loot.meta,
        wowtbc: wowtbc
          ? { source: wowtbc.meta.source, fetched_at: wowtbc.meta.fetched_at, dungeon_count: wowtbc.meta.dungeon_count }
          : { unknown: WOWTBC_MISSING },
        instances,
      },
      pretty,
    );
  } else if (hasFlag("--audit-loot")) {
    const [loot, catalog, wowtbc] = await Promise.all([loadDungeonLoot(), loadCatalog(), loadWowtbc()]);
    output(
      {
        ...auditLoot(loot, catalog),
        wowtbc: wowtbc ? auditWowtbc(wowtbc, loot, catalog) : { unknown: WOWTBC_MISSING },
      },
      pretty,
    );
  } else if (getArg("--loot")) {
    const query = getArg("--loot")!;
    const [loot, wowtbc, catalog] = await Promise.all([
      loadDungeonLoot(),
      loadWowtbc(),
      loadCatalog().catch(() => null),
    ]);
    const dungeonFirst = wowtbc ? findWowtbcDungeon(wowtbc, query) : undefined;
    const instance = findInstance(loot, query) ??
      (dungeonFirst ? loot.instances.find((i) => sameName(i.name, dungeonFirst.name)) : undefined);
    const dungeon = wowtbc
      ? findWowtbcDungeon(wowtbc, query) ??
        (instance ? findWowtbcDungeon(wowtbc, instance.name) : undefined)
      : undefined;
    if (!instance && !dungeon) {
      output({ error: `No instance matching "${query}"`, hint: "use --list-instances" }, pretty);
      process.exit(1);
    }
    output(
      {
        upstream: loot.meta.upstream,
        notes: loot.meta.notes,
        catalog_build: catalog?.meta.build ?? null,
        instance: instance
          ? {
              ...instance,
              source: ATLASLOOT_SOURCE,
              bosses: instance.bosses.map((boss) => ({
                ...boss,
                difficulties: Object.fromEntries(
                  Object.entries(boss.difficulties).map(([d, entries]) => [d, nameLootEntries(entries, catalog, wowtbc)]),
                ),
              })),
            }
          : null,
        wowtbc: dungeon && wowtbc
          ? namedDungeon(dungeon, catalog, wowtbc)
          : wowtbc
            ? {
                unknown:
                  "out of wowtbc scope: its tables cover dungeons only (no raids or world bosses), and it lists no dungeon matching this instance",
              }
            : { unknown: WOWTBC_MISSING },
      },
      pretty,
    );
  } else if (getArg("--item-sources")) {
    const id = parseInt(getArg("--item-sources")!, 10);
    const [loot, wowtbc] = await Promise.all([loadDungeonLoot(), loadWowtbc()]);
    const sources = allSources(loot, wowtbc, id);
    output(
      {
        item_id: id,
        upstream: loot.meta.upstream,
        wowtbc: wowtbc ? { source: wowtbc.meta.source, fetched_at: wowtbc.meta.fetched_at } : { unknown: WOWTBC_MISSING },
        sources,
        unknown: sources ? undefined : NO_SOURCE,
      },
      pretty,
    );
  } else {
    console.error(
      JSON.stringify({
        error: "no action given",
        actions: ["--build-info", "--refresh-enums", "--ingest", "--ingest-wowtbc", "--item <id>", "--search <text>", "--list-instances", "--audit-loot", "--loot <instance>", "--item-sources <id>"],
      }),
    );
    process.exit(1);
  }
} catch (err) {
  console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
}
