import React, { useMemo } from "react";
import { colors, fonts, Stack, ScrollArea, SectionHeader, EmptyState, Text, Badge } from "@tome/ui";

interface TrackInfo {
  min_ilvl: number;
  max_ilvl: number;
  ranks: number;
  sources?: string[];
}

interface Props {
  tracks?: Record<string, TrackInfo>;
  title?: string;
  changedFields?: string[];
}

// Track names are fixed presentation keys (same palette as IlvlRangeChart);
// which tracks exist and their order come from `tracks`.
const TRACK_COLOR: Record<string, string> = {
  myth: colors.chart5,
  hero: colors.chart2,
  champion: colors.chart3,
  veteran: colors.chart1,
  adventurer: colors.chart4,
};

// Tracks a season adds beyond the named palette still get a distinct colour.
const FALLBACK_COLORS = [colors.chart6, colors.chart1, colors.chart4, colors.chart3];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function TrackSources({ tracks, title = "Track Sources", changedFields }: Props) {
  const rows = useMemo(() => {
    if (!tracks) return [];
    // Highest track first, ordered by the season's own ilvl ranges.
    return Object.entries(tracks)
      .map(([k, t]) => ({ key: k, ...t }))
      .sort((a, b) => b.max_ilvl - a.max_ilvl || b.min_ilvl - a.min_ilvl);
  }, [tracks]);

  const tracksChanged = changedFields?.includes("tracks");

  return (
    <Stack style={{ height: "100%" }}>
      <SectionHeader>{title}</SectionHeader>
      <ScrollArea className={tracksChanged ? "tome-changed" : undefined} style={{ flex: 1 }}>
        {rows.length === 0 ? (
          <EmptyState>No track data loaded. Wire a data node to the tracks prop.</EmptyState>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", padding: "10px 16px", background: colors.bgTertiary, position: "sticky", top: 0 }}>
              <Text size="xs" weight={600} color={colors.textSecondary} uppercase>Track</Text>
              <Text size="xs" weight={600} color={colors.textSecondary} uppercase>Sources</Text>
            </div>
            {rows.map((row, rowIndex) => (
              <div
                key={row.key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "130px 1fr",
                  padding: "12px 16px",
                  borderTop: `1px solid ${colors.borderSecondary}`,
                  fontSize: 12,
                  alignItems: "start",
                }}
              >
                <div>
                  <Badge style={{ background: TRACK_COLOR[row.key] ?? FALLBACK_COLORS[rowIndex % FALLBACK_COLORS.length], color: colors.textWhite }}>
                    {capitalize(row.key)}
                  </Badge>
                  <Text size="xs" color={colors.textSecondary} style={{ marginTop: 4 }}>
                    {row.min_ilvl}–{row.max_ilvl} · {row.ranks} ranks
                  </Text>
                </div>
                <div style={{ color: colors.textSecondary, lineHeight: 1.5 }}>
                  {(row.sources ?? []).map((s, i) => (
                    <div key={i}>{s}</div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </ScrollArea>
    </Stack>
  );
}

export const meta = {
  type: "track-sources",
  description: "Table of upgrade tracks with their loot sources",
  ports: {
    inputs: [
      { prop: "tracks", label: "Tracks (object)", type: "record" },
      { prop: "title", label: "Title", type: "string" },
    ],
    outputs: [],
  },
};
