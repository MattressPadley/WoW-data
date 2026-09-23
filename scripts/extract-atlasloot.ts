#!/usr/bin/env bun
/**
 * One-time offline extract of AtlasLootClassic's reused-Vanilla loot tables into
 * `forever/loot/dungeon-loot.json`.
 *
 * Why offline and checked in: `data/` is gitignored, and the upstream data is
 * addon Lua written against AtlasLoot's module API. We therefore evaluate it
 * under a stub of that API (`scripts/atlasloot-extract.lua`) rather than
 * regexing it, and vendor the result along with the upstream GPLv2 LICENSE and
 * the exact commit it came from. Nothing in the query path runs Lua.
 *
 * The module is loaded twice — once with AtlasLoot's `IS_FOREVER` off and once
 * on — and the two are diffed. That gives exact provenance per instance, boss
 * and loot row: anything that only appears in the Forever pass is new content,
 * which upstream datamines rather than observes, so it is never asserted as
 * known.
 *
 * Usage:
 *   bun run scripts/extract-atlasloot.ts [--repo <path>] [--commit <sha>] [--no-cache]
 */

import { mkdir, rm } from "node:fs/promises";
import { $ } from "bun";
import { getCachedCsv, parseCsv } from "../src/lib/wago.ts";
import { foreverOptions, resolveForeverBuild } from "../src/lib/forever.ts";
import { getArg, hasFlag } from "../src/utils.ts";

const UPSTREAM_REPO = "https://github.com/HoliestWoW/AtlasLootClassic.git";
/**
 * Pinned upstream commit ("Update for WoW Forever", 2026-09-21). The fork is the
 * AtlasLootClassic continuation carrying a Forever (`_Camelot`) TOC, whose
 * Dungeons-and-Raids TOC loads the Vanilla `data.lua` — i.e. Forever reuses the
 * Vanilla loot tables verbatim.
 */
const UPSTREAM_COMMIT = "9e96553a11ce3534d0af0ed54995ec5f5427f6b4";
const UPSTREAM_PATHS = [
  "AtlasLootClassic_DungeonsAndRaids/data.lua",
  "AtlasLootClassic_DungeonsAndRaids/droprate.lua",
];

const CLONE_DIR = "data/upstream/atlasloot";
const WORK_DIR = "data/upstream/work";
const OUT_DIR = "forever/loot";

interface RawEntry { slot: number | null; item_id: number }
interface RawBoss {
  name: string | null;
  npc_id: number | null;
  atlas_map_boss_id: number | null;
  extra_list: boolean;
  difficulties: Record<string, RawEntry[]>;
  drop_rates?: Record<string, number>;
}
interface RawInstance {
  key: string;
  name: string;
  area_name: string | null;
  content_type: string | null;
  map_id: number | null;
  instance_id: number | null;
  level_range: number[] | null;
  boss_count: number;
  bosses: RawBoss[];
}
interface RawExtract {
  is_forever: boolean;
  difficulties: Record<string, string>;
  content_types: Record<string, string>;
  instance_count: number;
  instances: RawInstance[];
}

const repoOverride = getArg("--repo");
const commit = getArg("--commit") ?? UPSTREAM_COMMIT;
const noCache = hasFlag("--no-cache");

async function ensureUpstream(): Promise<string> {
  if (repoOverride) return repoOverride;
  await mkdir("data/upstream", { recursive: true });
  const exists = await Bun.file(`${CLONE_DIR}/.git/HEAD`).exists();
  if (!exists) {
    await rm(CLONE_DIR, { recursive: true, force: true });
    await $`git clone --quiet ${UPSTREAM_REPO} ${CLONE_DIR}`;
  }
  await $`git -C ${CLONE_DIR} fetch --quiet origin ${commit}`.nothrow();
  await $`git -C ${CLONE_DIR} checkout --quiet ${commit}`;
  const head = (await $`git -C ${CLONE_DIR} rev-parse HEAD`.text()).trim();
  if (head !== commit) throw new Error(`Upstream checkout is ${head}, expected ${commit}`);
  return CLONE_DIR;
}

/** Real AreaTable names for the Forever build, so instance names are not invented. */
async function writeAreaNames(): Promise<string> {
  const build = (await resolveForeverBuild(noCache)).version;
  const rows = parseCsv(await getCachedCsv("AreaTable", noCache, foreverOptions(build)));
  await mkdir(WORK_DIR, { recursive: true });
  const path = `${WORK_DIR}/area-names.tsv`;
  await Bun.write(path, rows.map((r) => `${r["ID"]}\t${(r["AreaName_lang"] ?? "").replace(/\t|\n/g, " ")}`).join("\n"));
  return path;
}

async function runLua(root: string, isForever: boolean, areaNames: string): Promise<RawExtract> {
  const proc = Bun.spawnSync(["luajit", "scripts/atlasloot-extract.lua", root, String(isForever), areaNames]);
  if (proc.exitCode !== 0) {
    throw new Error(`Lua extract (isForever=${isForever}) failed: ${proc.stderr.toString()}`);
  }
  return JSON.parse(proc.stdout.toString()) as RawExtract;
}

/** Lua tables drop nil values, so absent fields arrive as undefined. */
const orNull = <T>(v: T | undefined | null): T | null => (v === undefined || v === null ? null : v);

const bossKey = (b: RawBoss, idx: number) => `${b.npc_id ?? "n"}|${b.name ?? ""}|${b.atlas_map_boss_id ?? idx}`;

const root = await ensureUpstream();
const areaNames = await writeAreaNames();
const [vanilla, forever] = await Promise.all([runLua(root, false, areaNames), runLua(root, true, areaNames)]);

const vanillaInstances = new Map(vanilla.instances.map((i) => [i.key, i]));

interface OutEntry { slot: number | null; item_id: number; provenance: "vanilla" | "forever-new" }
interface OutBoss {
  name: string | null;
  npc_id: number | null;
  atlas_map_boss_id: number | null;
  loot_status: "known-vanilla" | "unknown-new-content";
  difficulties: Record<string, OutEntry[]>;
  /** Vanilla-observed drop percentages from upstream `droprate.lua`, when it has the NPC. */
  drop_rates: Record<string, number> | null;
  unknown: string[];
}

const NEW_CONTENT_CAVEAT =
  "Forever-new content: upstream datamines these rows rather than observing them, and Forever drop sources are server-side. Treat as unverified, not confirmed.";

let knownBosses = 0;
let unknownBosses = 0;

const instances = forever.instances
  .map((inst) => {
    const base = vanillaInstances.get(inst.key);
    const instanceProvenance = base ? ("vanilla" as const) : ("forever-new" as const);
    const instanceUnknown: string[] = [];
    if (!base) instanceUnknown.push(NEW_CONTENT_CAVEAT);
    // Upstream marks unresolved ids with 0 — surface that rather than passing 0 off as an id.
    if (!inst.instance_id) instanceUnknown.push("instance id not known upstream (placeholder 0)");
    if (!inst.map_id) instanceUnknown.push("map id not known upstream (placeholder 0)");
    else if (!inst.area_name) instanceUnknown.push(`map id ${inst.map_id} has no AreaTable row in the Forever build`);

    const baseBosses = new Map((base?.bosses ?? []).map((b, i) => [bossKey(b, i), b]));

    const bosses: OutBoss[] = inst.bosses.map((boss, idx) => {
      const baseBoss = baseBosses.get(bossKey(boss, idx));
      const unknown: string[] = [];
      const difficulties: Record<string, OutEntry[]> = {};
      let newRows = 0;

      for (const [difficulty, entries] of Object.entries(boss.difficulties)) {
        const baseIds = new Set((baseBoss?.difficulties[difficulty] ?? []).map((e) => e.item_id));
        difficulties[difficulty] = entries.map((e) => {
          const provenance = baseBoss && baseIds.has(e.item_id) ? ("vanilla" as const) : ("forever-new" as const);
          if (provenance === "forever-new") newRows++;
          return { slot: orNull(e.slot), item_id: e.item_id, provenance };
        });
      }

      const lootStatus = baseBoss ? ("known-vanilla" as const) : ("unknown-new-content" as const);
      if (!baseBoss) unknown.push(NEW_CONTENT_CAVEAT);
      else if (newRows > 0) unknown.push(`${newRows} loot row(s) are Forever-new and unverified — ${NEW_CONTENT_CAVEAT}`);
      if (Object.values(difficulties).every((d) => d.length === 0)) {
        unknown.push("upstream has no loot rows for this boss");
      }
      if (orNull(boss.npc_id) === null) unknown.push("npc id not known upstream");
      if (orNull(boss.name) === null) unknown.push("boss name not known upstream");

      lootStatus === "known-vanilla" ? knownBosses++ : unknownBosses++;
      return {
        name: orNull(boss.name),
        npc_id: orNull(boss.npc_id),
        atlas_map_boss_id: orNull(boss.atlas_map_boss_id),
        loot_status: lootStatus,
        difficulties,
        drop_rates: orNull(boss.drop_rates),
        unknown,
      };
    });

    return {
      key: inst.key,
      name: inst.name,
      area_name: orNull(inst.area_name),
      content_type: orNull(inst.content_type),
      map_id: inst.map_id || null,
      instance_id: inst.instance_id || null,
      level_range: orNull(inst.level_range),
      provenance: instanceProvenance,
      bosses,
      unknown: instanceUnknown,
    };
  })
  .sort((a, b) => a.key.localeCompare(b.key));

const extract = {
  meta: {
    generated_at: new Date().toISOString(),
    generator: "scripts/extract-atlasloot.ts + scripts/atlasloot-extract.lua",
    upstream: {
      repo: UPSTREAM_REPO,
      commit,
      paths: UPSTREAM_PATHS,
      license: "GPL-2.0 (see forever/loot/LICENSE)",
    },
    instance_count: instances.length,
    boss_count: knownBosses + unknownBosses,
    known_vanilla_boss_count: knownBosses,
    unknown_new_content_boss_count: unknownBosses,
    notes: [
      "Rows marked provenance=vanilla are reused live-Vanilla loot tables and are trustworthy.",
      "Rows marked provenance=forever-new come from the isForever branch of the upstream data and are unverified datamining, not observed drops.",
      "An item absent from this extract means 'not in the reused-Vanilla tables' — not 'drops from nothing'. Forever's real drop sources are server-side and absent from the client.",
      "drop_rates are upstream's Vanilla-observed percentages; they are never inferred for Forever-new content.",
    ],
  },
  instances,
};

await mkdir(OUT_DIR, { recursive: true });
await Bun.write(`${OUT_DIR}/dungeon-loot.json`, JSON.stringify(extract, null, 1) + "\n");
await Bun.write(`${OUT_DIR}/LICENSE`, await Bun.file(`${root}/LICENSE`).text());
await Bun.write(
  `${OUT_DIR}/SOURCE.md`,
  `# Source and attribution — forever/loot/dungeon-loot.json

\`dungeon-loot.json\` is a derivative work of **AtlasLootClassic**, extracted offline.

| | |
|---|---|
| Upstream repo | ${UPSTREAM_REPO} |
| Commit | \`${commit}\` |
| Files used | ${UPSTREAM_PATHS.map((p) => `\`${p}\``).join(", ")} |
| Upstream license | GPL-2.0 — full text in \`LICENSE\` beside this file |
| Extractor | \`scripts/extract-atlasloot.ts\` + \`scripts/atlasloot-extract.lua\` |

## How it was produced

The upstream data is addon Lua written against AtlasLoot's module API, so it is
evaluated under a stub of that API rather than pattern-matched. The module is
loaded twice — with AtlasLoot's \`IS_FOREVER\` off and on — and the results are
diffed, which is what \`provenance\` records:

- \`vanilla\` — present in both passes: reused live-Vanilla loot, trustworthy.
- \`forever-new\` — only in the Forever pass: upstream datamining of new content,
  **unverified**. Bosses made only of such rows are \`loot_status:
  unknown-new-content\`.

Instance and boss ids that upstream leaves as \`0\` placeholders are emitted as
\`null\` with a reason in \`unknown\`, never as \`0\`.

## Licensing note

A checked-in extract of GPLv2 data is a derivative work. That is fine while this
repository is private; if it is ever published, the repository inherits GPLv2
obligations. Raise this at publish time.

## Regenerating

\`\`\`sh
bun run scripts/extract-atlasloot.ts
\`\`\`

Requires \`luajit\` (LuaJIT 2.1, for \`getfenv\`) on PATH.
`,
);

console.log(
  JSON.stringify(
    {
      out: `${OUT_DIR}/dungeon-loot.json`,
      upstream_commit: commit,
      ...extract.meta,
      vanilla_pass: { instances: vanilla.instance_count },
      forever_pass: { instances: forever.instance_count },
    },
    null,
    2,
  ),
);
