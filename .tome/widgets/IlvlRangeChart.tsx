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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function axisTicks(min: number, max: number, count: number): number[] {
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(min + step * i));
}

export default function IlvlRangeChart({ tracks, title = "Item Level by Track", changedFields }: Props) {
  const rows = useMemo(() => {
    if (!tracks) return [];
    return TRACK_ORDER.filter((k) => tracks[k]).map((k) => ({ key: k, ...tracks[k] }));
  }, [tracks]);

  const { chartMin, chartMax } = useMemo(() => {
    if (rows.length === 0) return { chartMin: 200, chartMax: 300 };
    const lo = Math.min(...rows.map((r) => r.min_ilvl));
    const hi = Math.max(...rows.map((r) => r.max_ilvl));
    const pad = Math.max(4, Math.round((hi - lo) * 0.08));
    return { chartMin: lo - pad, chartMax: hi + pad };
  }, [rows]);

  const tracksChanged = changedFields?.includes("tracks");
  const labelWidth = 110;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--tome-bg-primary)", color: "var(--tome-text-primary)", overflow: "hidden" }}>
      <div style={{ padding: "12px 18px 10px 18px", borderBottom: "1px solid var(--tome-border-primary)", fontSize: 13, fontWeight: 600 }}>
        {title}
      </div>
      <div className={tracksChanged ? "tome-changed" : undefined} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "18px 18px 12px 18px" }}>
        {rows.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--tome-text-disabled)", fontStyle: "italic" }}>
            No track data loaded. Wire a data node to the <code>tracks</code> prop.
          </div>
        ) : (
          <>
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "space-around" }}>
              {rows.map((row) => (
                <DumbbellRow
                  key={row.key}
                  label={capitalize(row.key)}
                  min={row.min_ilvl}
                  max={row.max_ilvl}
                  chartMin={chartMin}
                  chartMax={chartMax}
                  color={TRACK_COLOR[row.key] ?? "var(--tome-chart-1)"}
                  labelWidth={labelWidth}
                />
              ))}
            </div>
            <div style={{ display: "flex", marginTop: 10, flexShrink: 0 }}>
              <div style={{ width: labelWidth }} />
              <div style={{ flex: 1, display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--tome-text-secondary)", paddingTop: 4, borderTop: "1px solid var(--tome-border-secondary)" }}>
                {axisTicks(chartMin, chartMax, 5).map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 10, color: "var(--tome-text-secondary)", textAlign: "center", marginTop: 4, flexShrink: 0 }}>
              Item Level
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DumbbellRow({
  label, min, max, chartMin, chartMax, color, labelWidth,
}: {
  label: string; min: number; max: number; chartMin: number; chartMax: number; color: string; labelWidth: number;
}) {
  const span = chartMax - chartMin;
  const leftPct = ((min - chartMin) / span) * 100;
  const widthPct = ((max - min) / span) * 100;

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div style={{ width: labelWidth, fontSize: 11, color: "var(--tome-text-secondary)", textAlign: "right", paddingRight: 10 }}>
        {label}
      </div>
      <div style={{ flex: 1, position: "relative", height: 18 }}>
        <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "var(--tome-border-secondary)", transform: "translateY(-50%)" }} />
        <div style={{ position: "absolute", top: "50%", left: `${leftPct}%`, width: `${widthPct}%`, height: 3, background: color, transform: "translateY(-50%)", borderRadius: 2 }} />
        <div style={{ position: "absolute", top: "50%", left: `${leftPct}%`, width: 9, height: 9, borderRadius: "50%", background: color, transform: "translate(-50%, -50%)" }} />
        <div style={{ position: "absolute", top: "50%", left: `${leftPct}%`, transform: "translate(-50%, -150%)", fontSize: 9, color: "var(--tome-text-secondary)", whiteSpace: "nowrap" }}>
          {min}
        </div>
        <div style={{ position: "absolute", top: "50%", left: `${leftPct + widthPct}%`, width: 9, height: 9, borderRadius: "50%", background: color, transform: "translate(-50%, -50%)" }} />
        <div style={{ position: "absolute", top: "50%", left: `${leftPct + widthPct}%`, transform: "translate(-50%, -150%)", fontSize: 9, color: "var(--tome-text-primary)", fontWeight: 600, whiteSpace: "nowrap" }}>
          {max}
        </div>
      </div>
    </div>
  );
}

export const meta = {
  type: "ilvl-range-chart",
  description: "Dumbbell chart of item level ranges per upgrade track",
  ports: {
    inputs: [
      { prop: "tracks", label: "Tracks (object)", type: "record" },
      { prop: "title", label: "Title", type: "string" },
    ],
    outputs: [],
  },
};
