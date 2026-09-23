// Item quality colours — the in-game palette, shared by every widget that
// renders an item name, icon border or item level.
//
// Lives under .tome/widgets/lib/ and is imported by sibling widgets via
// `./lib/quality`. The bundler inlines it into each importer.

export const QUALITY_COLOR: Record<string, string> = {
  Poor: "#9d9d9d",
  Common: "#ffffff",
  Uncommon: "#1eff00",
  Rare: "#0070dd",
  Epic: "#a335ee",
  Legendary: "#ff8000",
  Artifact: "#e6cc80",
  Heirloom: "#00ccff",
};

/** Fallback is Common white — an unknown quality never borrows another's colour. */
export const DEFAULT_QUALITY_COLOR = QUALITY_COLOR.Common!;

export function qualityColor(quality?: string | null): string {
  return (quality && QUALITY_COLOR[quality]) || DEFAULT_QUALITY_COLOR;
}

/**
 * Quality ladder, Poor → Heirloom. The palette above is already written in
 * ladder order, so this reads the rank off it rather than restating it —
 * a sort on quality and the colour it renders in can never disagree.
 */
export const QUALITY_RANK: Record<string, number> = Object.fromEntries(
  Object.keys(QUALITY_COLOR).map((name, index) => [name, index]),
);

/** Unknown qualities sort below Poor rather than being silently grouped with it. */
export function qualityRank(quality?: string | null): number {
  return (quality && QUALITY_RANK[quality]) ?? -1;
}
