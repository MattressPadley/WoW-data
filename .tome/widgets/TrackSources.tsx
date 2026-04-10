import React, { useMemo } from "react";

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
  myth: "var(--tome-chart-5)",
  hero: "var(--tome-chart-2)",
  champion: "var(--tome-chart-3)",
  veteran: "var(--tome-chart-1)",
  adventurer: "var(--tome-chart-4)",
};

const CREST_COLOR: Record<string, string> = {
  "Myth Dawncrest": "var(--tome-chart-5)",
  "Hero Dawncrest": "var(--tome-chart-2)",
  "Champion Dawncrest": "var(--tome-chart-3)",
  "Veteran Dawncrest": "var(--tome-chart-1)",
  "Adventurer Dawncrest": "var(--tome-chart-4)",
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
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--tome-bg-primary)", color: "var(--tome-text-primary)", overflow: "hidden" }}>
      <div style={{ padding: "12px 18px 10px 18px", borderBottom: "1px solid var(--tome-border-primary)", fontSize: 13, fontWeight: 600 }}>
        {title}
      </div>
      <div className={tracksChanged ? "tome-changed" : undefined} style={{ flex: 1, overflow: "auto" }}>
        {rows.length === 0 ? (
          <div style={{ padding: 18, fontSize: 12, color: "var(--tome-text-disabled)", fontStyle: "italic" }}>
            No track data loaded. Wire a data node to the <code>tracks</code> prop.
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "130px 1fr 170px", padding: "10px 16px", fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--tome-text-secondary)", background: "var(--tome-bg-tertiary)", position: "sticky", top: 0 }}>
              <div>Track</div>
              <div>Sources</div>
              <div>Required Crest</div>
            </div>
            {rows.map((row) => (
              <div
                key={row.key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "130px 1fr 170px",
                  padding: "12px 16px",
                  borderTop: "1px solid var(--tome-border-secondary)",
                  fontSize: 12,
                  alignItems: "start",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: TRACK_COLOR[row.key] ?? "var(--tome-chart-1)",
                      color: "var(--tome-text-white)",
                      fontWeight: 600,
                      fontSize: 11,
                    }}
                  >
                    {capitalize(row.key)}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--tome-text-secondary)", marginTop: 4 }}>
                    {row.min_ilvl}–{row.max_ilvl} · {row.ranks} ranks
                  </div>
                </div>
                <div style={{ color: "var(--tome-text-secondary)", lineHeight: 1.5 }}>
                  {(row.sources ?? []).map((s, i) => (
                    <div key={i}>{s}</div>
                  ))}
                </div>
                <div>
                  {row.crest ? (
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--tome-text-primary)",
                        borderLeft: `3px solid ${CREST_COLOR[row.crest] ?? "var(--tome-text-secondary)"}`,
                        paddingLeft: 8,
                      }}
                    >
                      {row.crest}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: "var(--tome-text-disabled)" }}>—</span>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
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
