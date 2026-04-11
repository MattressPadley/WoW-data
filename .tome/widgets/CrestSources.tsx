import React, { useMemo } from "react";
import { colors, Stack, ScrollArea, SectionHeader, EmptyState, Text } from "@tome/ui";

interface Props {
  crestSources?: Record<string, string[]>;
  title?: string;
  changedFields?: string[];
}

const CREST_ORDER = [
  "Myth Dawncrest",
  "Hero Dawncrest",
  "Champion Dawncrest",
  "Veteran Dawncrest",
  "Adventurer Dawncrest",
];

const CREST_COLOR: Record<string, string> = {
  "Myth Dawncrest": colors.chart5,
  "Hero Dawncrest": colors.chart2,
  "Champion Dawncrest": colors.chart3,
  "Veteran Dawncrest": colors.chart1,
  "Adventurer Dawncrest": colors.chart4,
};

export default function CrestSources({ crestSources, title = "Crest Sources", changedFields }: Props) {
  const rows = useMemo(() => {
    if (!crestSources) return [];
    return CREST_ORDER.filter((c) => crestSources[c]).map((c) => ({ crest: c, sources: crestSources[c] }));
  }, [crestSources]);

  const crestsChanged = changedFields?.includes("crestSources");

  return (
    <Stack style={{ height: "100%" }}>
      <SectionHeader>{title}</SectionHeader>
      <ScrollArea className={crestsChanged ? "tome-changed" : undefined} style={{ flex: 1 }}>
        {rows.length === 0 ? (
          <EmptyState>No crest data loaded. Wire a data node to the crestSources prop.</EmptyState>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "170px 1fr", padding: "10px 16px", background: colors.bgTertiary, position: "sticky", top: 0 }}>
              <Text size="xs" weight={600} color={colors.textSecondary} uppercase>Crest</Text>
              <Text size="xs" weight={600} color={colors.textSecondary} uppercase>Sources</Text>
            </div>
            {rows.map((row) => (
              <div
                key={row.crest}
                style={{
                  display: "grid",
                  gridTemplateColumns: "170px 1fr",
                  padding: "12px 16px",
                  borderTop: `1px solid ${colors.borderSecondary}`,
                  fontSize: 12,
                  alignItems: "start",
                }}
              >
                <Text size="sm" weight={600} style={{ borderLeft: `3px solid ${CREST_COLOR[row.crest] ?? colors.textSecondary}`, paddingLeft: 8 }}>
                  {row.crest}
                </Text>
                <div style={{ color: colors.textSecondary, lineHeight: 1.5 }}>
                  {row.sources.map((s, i) => (
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
  type: "crest-sources",
  description: "Table of crests with the activities that award them",
  ports: {
    inputs: [
      { prop: "crestSources", label: "Crest Sources (object)", type: "record" },
      { prop: "title", label: "Title", type: "string" },
    ],
    outputs: [],
  },
};
