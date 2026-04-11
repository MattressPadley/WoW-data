import React, { useMemo } from "react";
import { colors, fonts, Stack, ScrollArea, SectionHeader, EmptyState, Text, Badge } from "@tome/ui";

interface TrackInfo {
  min_ilvl: number;
  max_ilvl: number;
  ranks: number;
  crest?: string;
  sources?: string[];
}

interface Props {
  tracks?: Record<string, TrackInfo>;
  title?: string;
  changedFields?: string[];
}

const TRACK_ORDER = ["myth", "hero", "champion", "veteran", "adventurer"];

const TRACK_COLOR: Record<string, string> = {
  myth: colors.chart5,
  hero: colors.chart2,
  champion: colors.chart3,
  veteran: colors.chart1,
  adventurer: colors.chart4,
};

const CREST_COLOR: Record<string, string> = {
  "Myth Dawncrest": colors.chart5,
  "Hero Dawncrest": colors.chart2,
  "Champion Dawncrest": colors.chart3,
  "Veteran Dawncrest": colors.chart1,
  "Adventurer Dawncrest": colors.chart4,
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function TrackSources({ tracks, title = "Track Sources", changedFields }: Props) {
  const rows = useMemo(() => {
    if (!tracks) return [];
    return TRACK_ORDER.filter((k) => tracks[k]).map((k) => ({ key: k, ...tracks[k] }));
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
            <div style={{ display: "grid", gridTemplateColumns: "130px 1fr 170px", padding: "10px 16px", background: colors.bgTertiary, position: "sticky", top: 0 }}>
              <Text size="xs" weight={600} color={colors.textSecondary} uppercase>Track</Text>
              <Text size="xs" weight={600} color={colors.textSecondary} uppercase>Sources</Text>
              <Text size="xs" weight={600} color={colors.textSecondary} uppercase>Required Crest</Text>
            </div>
            {rows.map((row) => (
              <div
                key={row.key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "130px 1fr 170px",
                  padding: "12px 16px",
                  borderTop: `1px solid ${colors.borderSecondary}`,
                  fontSize: 12,
                  alignItems: "start",
                }}
              >
                <div>
                  <Badge style={{ background: TRACK_COLOR[row.key], color: colors.textWhite }}>
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
                <div>
                  {row.crest ? (
                    <Text size="sm" style={{ borderLeft: `3px solid ${CREST_COLOR[row.crest] ?? colors.textSecondary}`, paddingLeft: 8 }}>
                      {row.crest}
                    </Text>
                  ) : (
                    <Text size="sm" color={colors.textDisabled}>—</Text>
                  )}
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
  description: "Table of upgrade tracks with their loot sources and required crest",
  ports: {
    inputs: [
      { prop: "tracks", label: "Tracks (object)", type: "record" },
      { prop: "title", label: "Title", type: "string" },
    ],
    outputs: [],
  },
};
