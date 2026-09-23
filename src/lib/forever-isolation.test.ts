/**
 * Architectural gate: the Forever path must not reach the Blizzard API.
 *
 * The API is dark for the Forever beta and `WoWAPI.ns()` only produces the
 * retail namespace form, so any call from here would fail at runtime. This walks
 * the real import graph rather than trusting review.
 */
import { describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";

const FORBIDDEN = ["src/api.ts", "src/lib/dungeon-loot.ts", "src/lib/journal.ts", "src/journal.ts", "src/connection.ts"];
const ROOT = resolve(import.meta.dir, "../..");

async function importGraph(entry: string): Promise<string[]> {
  const seen = new Set<string>();
  const queue = [resolve(ROOT, entry)];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = await Bun.file(file).text();
    for (const match of source.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s+["'](\.[^"']+)["']/g)) {
      queue.push(resolve(dirname(file), match[1]!));
    }
  }
  return [...seen].map((f) => f.slice(ROOT.length + 1));
}

describe("Forever path isolation", () => {
  for (const entry of ["src/lib/forever.ts", "src/forever.ts", "scripts/extract-atlasloot.ts"]) {
    test(`${entry} imports nothing that reaches the Blizzard API`, async () => {
      const graph = await importGraph(entry);
      expect(graph.filter((f) => FORBIDDEN.includes(f))).toEqual([]);
    });
  }

  test("no WoWAPI construction in the Forever sources", async () => {
    for (const file of ["src/lib/forever.ts", "src/forever.ts", "scripts/extract-atlasloot.ts"]) {
      const source = await Bun.file(resolve(ROOT, file)).text();
      expect(source).not.toContain("new WoWAPI");
    }
  });

  test("the graph walker actually resolves imports", async () => {
    // Guards against the test passing because it found nothing.
    expect(await importGraph("src/lib/forever.ts")).toContain("src/lib/wago.ts");
    expect(await importGraph("src/dungeon-loot.ts")).toContain("src/api.ts");
  });
});
