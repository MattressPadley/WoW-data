import React, { useMemo } from "react";
import { colors, Stack, SectionHeader, EmptyState, Text, useTooltip } from "@tome/ui";
import { qualityColor } from "./lib/quality";
import { GearItemTooltip, type GearItem } from "./lib/ItemTooltip";

interface TrackInfo {
  min_ilvl: number;
  max_ilvl: number;
  ranks: number;
  crest?: string;
  sources?: string[];
}

interface CraftedRange {
  min_ilvl: number;
  max_ilvl: number;
}

interface Props {
  tracks?: Record<string, TrackInfo>;
  gear?: GearItem[];
  crafted?: { rare?: CraftedRange; epic?: CraftedRange };
  title?: string;
  changedFields?: string[];
}

// Track names are fixed presentation keys (the same palette CrestSources and
// TrackSources use); which tracks exist and their order come from `tracks`.
const TRACK_COLOR: Record<string, string> = {
  myth: colors.chart5,
  hero: colors.chart2,
  champion: colors.chart3,
  veteran: colors.chart1,
  adventurer: colors.chart4,
  crafted: colors.chart6,
};

// Tracks a season adds beyond the named palette still get a distinct colour.
const FALLBACK_COLORS = [colors.chart6, colors.chart1, colors.chart4, colors.chart3];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function axisTicks(min: number, max: number, count: number): number[] {
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(min + step * i));
}

function ItemIcon({ item, size = 24 }: { item: GearItem; size?: number }) {
  const { triggerRef, triggerProps, Tooltip } = useTooltip({ side: "top", gap: 6 });
  const borderColor = qualityColor(item.quality);

  return (
    <div ref={triggerRef} {...triggerProps} style={{ cursor: "pointer" }}>
      {item.icon ? (
        <img src={item.icon} alt={item.name} width={size} height={size}
          style={{ borderRadius: 3, border: `2px solid ${borderColor}`, display: "block" }} />
      ) : (
        <div style={{
          width: size, height: size, borderRadius: 3, border: `2px solid ${borderColor}`,
          background: colors.bgTertiary, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, color: colors.textDisabled,
        }}>?</div>
      )}
      <Tooltip><GearItemTooltip item={item} /></Tooltip>
    </div>
  );
}

export default function IlvlRangeChart({ tracks, gear, crafted, title = "Item Level by Track", changedFields }: Props) {
  const rows = useMemo(() => {
    if (!tracks) return [];
    // Highest track first, ordered by the season's own ilvl ranges.
    return Object.entries(tracks)
      .map(([k, t]) => ({ key: k, ...t }))
      .sort((a, b) => b.max_ilvl - a.max_ilvl || b.min_ilvl - a.min_ilvl);
  }, [tracks]);

  const trackFloor = useMemo(() => {
    const mins = rows.map((r) => r.min_ilvl).filter((n): n is number => typeof n === "number");
    return mins.length ? Math.min(...mins) : undefined;
  }, [rows]);

  const craftedRows = useMemo(() => {
    if (!crafted) return [];
    const out: { key: string; label: string; min_ilvl: number; max_ilvl: number }[] = [];
    if (crafted.epic) out.push({ key: "crafted-epic", label: "Epic Crafted", ...crafted.epic });
    if (crafted.rare) out.push({ key: "crafted-rare", label: "Rare Crafted", ...crafted.rare });
    return out;
  }, [crafted]);

  const visibleGear = useMemo(() => {
    if (!gear) return [];
    return gear.filter((g) => g.ilvl > 0 && (trackFloor === undefined || g.ilvl >= trackFloor));
  }, [gear, trackFloor]);

  const allRanges = useMemo(() => {
    const ranges = rows.map((r) => ({ min: r.min_ilvl, max: r.max_ilvl }));
    craftedRows.forEach((c) => ranges.push({ min: c.min_ilvl, max: c.max_ilvl }));
    visibleGear.forEach((g) => ranges.push({ min: g.ilvl, max: g.ilvl }));
    return ranges;
  }, [rows, craftedRows, visibleGear]);

  const { chartMin, chartMax } = useMemo(() => {
    // Placeholder axis only — never shown, since no ranges means the empty state renders.
    if (allRanges.length === 0) return { chartMin: 200, chartMax: 300 };
    const lo = Math.min(...allRanges.map((r) => r.min));
    const hi = Math.max(...allRanges.map((r) => r.max));
    const pad = Math.max(4, Math.round((hi - lo) * 0.08));
    return { chartMin: lo - pad, chartMax: hi + pad };
  }, [allRanges]);

  const gearByTrack = useMemo(() => {
    const map: Record<string, GearItem[]> = {};
    for (const g of visibleGear) {
      if (!g.ilvl) continue;
      let key: string | null = null;
      if (g.crafted) {
        if (crafted?.epic && g.ilvl >= crafted.epic.min_ilvl) key = "crafted-epic";
        else if (crafted?.rare) key = "crafted-rare";
      } else if (g.track) {
        key = g.track.toLowerCase();
      }
      if (!key) continue;
      if (!map[key]) map[key] = [];
      map[key].push(g);
    }
    return map;
  }, [visibleGear, crafted]);

  const tracksChanged = changedFields?.includes("tracks") || changedFields?.includes("gear");
  const labelWidth = 110;
  const hasGear = gear && gear.length > 0;
  const rowHeight = hasGear ? 72 : 18;

  return (
    <Stack style={{ height: "100%", overflow: "visible" }}>
      <SectionHeader>{title}</SectionHeader>
      <div className={tracksChanged ? "tome-changed" : undefined} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "18px 18px 12px 18px", overflow: "visible" }}>
        {rows.length === 0 ? (
          <EmptyState>No track data loaded. Wire a data node to the tracks prop.</EmptyState>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-around", flex: 1, minHeight: 0 }}>
              {rows.map((row, i) => (
                <DumbbellRow
                  key={row.key}
                  label={capitalize(row.key)}
                  min={row.min_ilvl}
                  max={row.max_ilvl}
                  chartMin={chartMin}
                  chartMax={chartMax}
                  color={TRACK_COLOR[row.key] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]!}
                  labelWidth={labelWidth}
                  gearItems={gearByTrack[row.key]}
                  rowHeight={rowHeight}
                />
              ))}
              {craftedRows.length > 0 && (
                <div style={{ borderTop: `1px dashed ${colors.borderSecondary}`, marginTop: 4, paddingTop: 4 }}>
                  {craftedRows.map((row) => (
                    <DumbbellRow
                      key={row.key}
                      label={row.label}
                      min={row.min_ilvl}
                      max={row.max_ilvl}
                      chartMin={chartMin}
                      chartMax={chartMax}
                      color={TRACK_COLOR.crafted}
                      labelWidth={labelWidth}
                      gearItems={gearByTrack[row.key]}
                      rowHeight={rowHeight}
                    />
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", marginTop: 10, flexShrink: 0 }}>
              <div style={{ width: labelWidth }} />
              <div style={{ flex: 1, display: "flex", justifyContent: "space-between", fontSize: 10, color: colors.textSecondary, paddingTop: 4, borderTop: `1px solid ${colors.borderSecondary}` }}>
                {axisTicks(chartMin, chartMax, 5).map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            </div>
            <Text size="xs" color={colors.textSecondary} style={{ textAlign: "center", marginTop: 4, flexShrink: 0 }}>
              Item Level
            </Text>
          </>
        )}
      </div>
    </Stack>
  );
}

function DumbbellRow({
  label, min, max, chartMin, chartMax, color, labelWidth, gearItems, rowHeight = 18,
}: {
  label: string; min: number; max: number; chartMin: number; chartMax: number;
  color: string; labelWidth: number; gearItems?: GearItem[]; rowHeight?: number;
}) {
  const span = chartMax - chartMin;
  const leftPct = ((min - chartMin) / span) * 100;
  const widthPct = ((max - min) / span) * 100;
  const hasGear = gearItems && gearItems.length > 0;

  const sortedGear = useMemo(() => {
    if (!gearItems) return [];
    return [...gearItems].sort((a, b) => a.ilvl - b.ilvl);
  }, [gearItems]);

  const gearStacks = useMemo(() => {
    if (sortedGear.length === 0) return [];
    const groups: { pct: number; items: GearItem[] }[] = [];
    for (const item of sortedGear) {
      const pct = ((item.ilvl - chartMin) / span) * 100;
      const last = groups[groups.length - 1];
      if (last && Math.abs(pct - last.pct) < 1) {
        last.items.push(item);
      } else {
        groups.push({ pct, items: [item] });
      }
    }
    return groups;
  }, [sortedGear, chartMin, span]);

  const barY = hasGear ? rowHeight - 12 : rowHeight / 2;

  return (
    <div style={{ display: "flex", alignItems: "flex-end", height: rowHeight, marginBottom: hasGear ? 2 : 0 }}>
      <Text size="sm" color={colors.textSecondary} style={{ width: labelWidth, textAlign: "right", paddingRight: 10, paddingBottom: hasGear ? 2 : 0 }}>
        {label}
      </Text>
      <div style={{ flex: 1, position: "relative", height: rowHeight, overflow: "visible" }}>
        {/* Baseline */}
        <div style={{ position: "absolute", top: barY, left: 0, right: 0, height: 1, background: colors.borderSecondary }} />
        {/* Range bar */}
        <div style={{ position: "absolute", top: barY - 1, left: `${leftPct}%`, width: `${widthPct}%`, height: 3, background: color, borderRadius: 2 }} />
        {/* Min dot + label */}
        <div style={{ position: "absolute", top: barY - 4, left: `${leftPct}%`, width: 9, height: 9, borderRadius: "50%", background: color, transform: "translateX(-50%)" }} />
        <div style={{ position: "absolute", top: barY - 16, left: `${leftPct}%`, transform: "translateX(-50%)", fontSize: 9, color: colors.textSecondary, whiteSpace: "nowrap" }}>
          {min}
        </div>
        {/* Max dot + label */}
        <div style={{ position: "absolute", top: barY - 4, left: `${leftPct + widthPct}%`, width: 9, height: 9, borderRadius: "50%", background: color, transform: "translateX(-50%)" }} />
        <div style={{ position: "absolute", top: barY - 16, left: `${leftPct + widthPct}%`, transform: "translateX(-50%)", fontSize: 9, color: colors.textPrimary, fontWeight: 600, whiteSpace: "nowrap" }}>
          {max}
        </div>
        {/* Gear markers */}
        {gearStacks.map((stack, si) => (
          <div
            key={`stack-${si}`}
            style={{
              position: "absolute", left: `${stack.pct}%`, bottom: rowHeight - barY,
              transform: "translateX(-50%)", display: "flex", flexDirection: "column-reverse",
              alignItems: "center", zIndex: 10,
            }}
          >
            <div style={{ width: 1, height: 4, background: colors.textDisabled, opacity: 0.6 }} />
            <Text size="sm" weight={600} style={{ whiteSpace: "nowrap", lineHeight: 1, marginBottom: 2 }}>
              {stack.items[0].ilvl}
            </Text>
            {stack.items.map((item, ii) => (
              <div key={`${item.slot}-${ii}`} style={{ marginBottom: 1 }}>
                <ItemIcon item={item} size={24} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export const meta = {
  type: "ilvl-range-chart",
  description: "Dumbbell chart of item level ranges per upgrade track with gear overlay",
  ports: {
    inputs: [
      { prop: "tracks", label: "Tracks (object)", type: "record" },
      { prop: "gear", label: "Gear Items (array)", type: "list" },
      { prop: "crafted", label: "Crafted Ranges (object)", type: "record" },
      { prop: "title", label: "Title", type: "string" },
    ],
    outputs: [],
  },
};
