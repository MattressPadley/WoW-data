#!/usr/bin/env bun
/**
 * forever.ts — WoW Forever data (Vanilla content on the retail engine)
 *
 * Forever data comes from wago.tools DB2 exports for the current Forever build
 * plus a vendored offline extract of reused-Vanilla loot tables. It deliberately
 * never touches the Blizzard API (dark for the beta) or the retail Encounter
 * Journal, so no credentials are required.
 *
 * Usage:
 *   bun run src/forever.ts --build-info [--pretty]
 *   bun run src/forever.ts --refresh-enums [--build 1.60.1.69977]
 *   bun run src/forever.ts --ingest [--build 1.60.1.69977] [--no-cache]
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
  findInstance,
  findItemSources,
  ingestCatalog,
  loadCatalog,
  nameLootEntries,
  loadDungeonLoot,
  refreshEnumSnapshots,
  resolveForeverBuild,
  FOREVER_PRODUCT,
  FOREVER_VERSION_PREFIX,
} from "./lib/forever.ts";

const pretty = hasFlag("--pretty");
const noCache = hasFlag("--no-cache");

async function build(): Promise<string> {
  const pinned = getArg("--build");
  if (pinned) return pinned;
  return (await resolveForeverBuild(noCache)).version;
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
  } else if (hasFlag("--ingest")) {
    const b = await build();
    console.error(`Ingesting Forever build ${b}…`);
    const catalog = await ingestCatalog(b, noCache);
    output({ ...catalog.meta, sample: catalog.items.slice(0, 3).map((i) => ({ id: i.id, name: i.name })) }, pretty);
  } else if (getArg("--item")) {
    const id = parseInt(getArg("--item")!, 10);
    const catalog = await loadCatalog();
    const item = catalog.items.find((i) => i.id === id);
    if (!item) {
      output({ error: `Item ${id} not in Forever build ${catalog.meta.build}` }, pretty);
      process.exit(1);
    }
    const loot = await loadDungeonLoot().catch(() => null);
    const sources = loot ? findItemSources(loot, id) : [];
    output(
      {
        build: catalog.meta.build,
        item,
        // An empty list is "not in the reused-Vanilla tables", never "drops from nothing".
        drop_sources: sources.length > 0 ? sources : null,
        drop_sources_unknown: sources.length === 0
          ? "no entry in the vendored reused-Vanilla loot extract; Forever drop sources are server-side and not in the client"
          : undefined,
      },
      pretty,
    );
  } else if (getArg("--search")) {
    const needle = getArg("--search")!.toLowerCase();
    const limit = parseInt(getArg("--limit") ?? "20", 10);
    const catalog = await loadCatalog();
    const matches = catalog.items.filter((i) => i.name.toLowerCase().includes(needle));
    output(
      {
        build: catalog.meta.build,
        query: getArg("--search"),
        total_matches: matches.length,
        items: matches.slice(0, limit).map((i) => ({
          id: i.id,
          name: i.name,
          item_level: i.item_level,
          quality: i.quality,
          inventory_type: i.inventory_type,
          stats: i.stats.map((s) => ({ stat: s.stat, value: s.value, unknown: s.unknown })),
        })),
      },
      pretty,
    );
  } else if (hasFlag("--list-instances")) {
    const loot = await loadDungeonLoot();
    output(
      {
        ...loot.meta,
        instances: loot.instances.map((i) => ({
          key: i.key,
          name: i.name,
          content_type: i.content_type,
          provenance: i.provenance,
          boss_count: i.bosses.length,
          bosses_with_unknown_loot: i.bosses.filter((b) => b.loot_status === "unknown-new-content").length,
        })),
      },
      pretty,
    );
  } else if (hasFlag("--audit-loot")) {
    const [loot, catalog] = await Promise.all([loadDungeonLoot(), loadCatalog()]);
    output(auditLoot(loot, catalog), pretty);
  } else if (getArg("--loot")) {
    const loot = await loadDungeonLoot();
    const instance = findInstance(loot, getArg("--loot")!);
    if (!instance) {
      output({ error: `No instance matching "${getArg("--loot")}"`, hint: "use --list-instances" }, pretty);
      process.exit(1);
    }
    const catalog = await loadCatalog().catch(() => null);
    output(
      {
        upstream: loot.meta.upstream,
        notes: loot.meta.notes,
        catalog_build: catalog?.meta.build ?? null,
        instance: {
          ...instance,
          bosses: instance.bosses.map((boss) => ({
            ...boss,
            difficulties: Object.fromEntries(
              Object.entries(boss.difficulties).map(([d, entries]) => [d, nameLootEntries(entries, catalog)]),
            ),
          })),
        },
      },
      pretty,
    );
  } else if (getArg("--item-sources")) {
    const id = parseInt(getArg("--item-sources")!, 10);
    const loot = await loadDungeonLoot();
    const sources = findItemSources(loot, id);
    output(
      {
        item_id: id,
        upstream: loot.meta.upstream,
        sources: sources.length > 0 ? sources : null,
        unknown: sources.length === 0
          ? "no entry in the vendored reused-Vanilla loot extract; Forever drop sources are server-side and not in the client"
          : undefined,
      },
      pretty,
    );
  } else {
    console.error(
      JSON.stringify({
        error: "no action given",
        actions: ["--build-info", "--refresh-enums", "--ingest", "--item <id>", "--search <text>", "--list-instances", "--audit-loot", "--loot <instance>", "--item-sources <id>"],
      }),
    );
    process.exit(1);
  }
} catch (err) {
  console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
}
