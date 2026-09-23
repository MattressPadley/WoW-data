// Shared item-tooltip pieces.
//
// Two things live here, and the split is deliberate. `ItemTooltipCard` is a
// presentational *shell* — width, the quality-coloured name and the item-level
// line — with no opinion about what an item is; widgets over different item
// shapes compose their own body into it. `GearItemTooltip` is the body for the
// Blizzard-profile `GearItem` shape, shared by the two widgets that use it.
//
// Imported by sibling widgets via `./lib/ItemTooltip`.

import React from "react";
import { qualityColor } from "./quality";

/* ── Shared tooltip atoms ── */

export const TOOLTIP_TEXT = "#ffffff";
export const TOOLTIP_ITEM_LEVEL = "#ffd100";
export const TOOLTIP_FLAVOR = "#ffd100";
export const TOOLTIP_EFFECT = "#1eff00";
export const TOOLTIP_MUTED = "#aaaaaa";

/** One line of tooltip body text, at the tooltip's own type scale. */
export function TooltipLine({
  color = TOOLTIP_TEXT,
  italic,
  top,
  children,
}: {
  color?: string;
  italic?: boolean;
  /** Extra margin above the line, for separating groups. */
  top?: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{ fontSize: 11, color, marginTop: top, fontStyle: italic ? "italic" : undefined, lineHeight: 1.3 }}>
      {children}
    </div>
  );
}

/**
 * The tooltip card shell: fixed width bounds, the quality-coloured item name,
 * and an optional item-level line. The body is whatever the caller passes.
 */
export function ItemTooltipCard({
  name,
  quality,
  itemLevel,
  children,
}: {
  name: string;
  quality?: string | null;
  itemLevel?: number | null;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ minWidth: 220, maxWidth: 320 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: qualityColor(quality), lineHeight: 1.2 }}>{name}</div>
      {itemLevel != null && itemLevel > 0 && (
        <div style={{ fontSize: 12, color: TOOLTIP_ITEM_LEVEL, marginTop: 4 }}>Item Level {itemLevel}</div>
      )}
      {children}
    </div>
  );
}

/** A socket row — filled or explicitly empty, never silently omitted. */
export function SocketLine({ gem, display, empty }: { gem?: string | null; display?: string | null; empty?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <svg width="12" height="12" viewBox="0 0 12 12" style={{ flexShrink: 0 }}>
        <rect
          x="2" y="2" width="8" height="8" rx="1" transform="rotate(45 6 6)"
          fill={empty ? "none" : TOOLTIP_EFFECT} stroke={empty ? "#666666" : TOOLTIP_EFFECT} strokeWidth="1.2"
        />
      </svg>
      <span style={{ fontSize: 11, color: empty ? "#ff4444" : TOOLTIP_EFFECT }}>
        {empty ? "Empty Socket" : `${gem ?? "Gem"}${display ? ` — ${display}` : ""}`}
      </span>
    </div>
  );
}

/* ── The Blizzard-profile GearItem shape ── */

export interface GearStat {
  name: string;
  value: number;
  is_equip_bonus?: boolean;
}

export interface GearSocket {
  type?: string;
  gem?: string | null;
  display?: string | null;
  empty?: boolean;
}

export interface GearSpell {
  name?: string | null;
  description?: string | null;
}

export interface GearItem {
  slot: string;
  name: string;
  ilvl: number;
  quality?: string;
  track?: string;
  rank?: number;
  max_rank?: number;
  crafted?: boolean;
  source?: string;
  icon?: string;
  binding?: string;
  armor?: number;
  armor_type?: string;
  stats?: GearStat[];
  sockets?: GearSocket[];
  spells?: GearSpell[];
  enchantments?: { name?: string | null; id?: number | null }[];
  unique?: string;
  limit_category?: string;
  flavor_text?: string;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Full tooltip for an equipped `GearItem` from the character profile. */
export function GearItemTooltip({ item }: { item: GearItem }) {
  return (
    <ItemTooltipCard name={item.name} quality={item.quality} itemLevel={item.ilvl}>
      {item.source && <TooltipLine color={TOOLTIP_EFFECT} top={2}>{item.source}</TooltipLine>}
      {item.track && (
        <TooltipLine color={TOOLTIP_MUTED} top={2}>
          {capitalize(item.track)} {item.rank}/{item.max_rank}
        </TooltipLine>
      )}
      {item.binding && <TooltipLine top={4}>{item.binding}</TooltipLine>}
      {item.unique && <TooltipLine>{item.unique}</TooltipLine>}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 11, color: TOOLTIP_TEXT }}>{item.slot}</span>
        {item.armor_type && <span style={{ fontSize: 11, color: TOOLTIP_TEXT }}>{item.armor_type}</span>}
      </div>
      {item.armor != null && item.armor > 0 && <TooltipLine top={2}>{item.armor} Armor</TooltipLine>}
      {item.stats && item.stats.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {item.stats.map((s, i) => (
            <TooltipLine key={i} color={s.is_equip_bonus ? TOOLTIP_EFFECT : TOOLTIP_TEXT}>
              +{s.value} {s.name}
            </TooltipLine>
          ))}
        </div>
      )}
      {item.sockets && item.sockets.length > 0 && (
        <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
          {item.sockets.map((s, i) => (
            <SocketLine key={i} gem={s.gem} display={s.display} empty={s.empty} />
          ))}
        </div>
      )}
      {item.spells && item.spells.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {item.spells.map((sp, i) => (
            <TooltipLine key={i} color={TOOLTIP_EFFECT}>{sp.description}</TooltipLine>
          ))}
        </div>
      )}
      {item.limit_category && <TooltipLine top={4}>{item.limit_category}</TooltipLine>}
      {item.flavor_text && (
        <TooltipLine color={TOOLTIP_FLAVOR} italic top={4}>
          &ldquo;{item.flavor_text}&rdquo;
        </TooltipLine>
      )}
    </ItemTooltipCard>
  );
}
