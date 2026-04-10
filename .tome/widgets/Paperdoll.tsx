import React, { useState, useRef, useLayoutEffect, useMemo } from "react";

interface GearStat {
  name: string;
  value: number;
  is_equip_bonus?: boolean;
}

interface GearSocket {
  type?: string;
  gem?: string | null;
  display?: string | null;
  empty?: boolean;
}

interface GearSpell {
  name?: string | null;
  description?: string | null;
}

interface GearItem {
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

interface CharacterInfo {
  name?: string;
  realm?: string;
  level?: number;
  class?: string;
  spec?: string;
  armor_type?: string;
  average_ilvl?: number;
  equipped_ilvl?: number;
  render?: string;
  inset?: string;
  avatar?: string;
}

interface Props {
  character?: CharacterInfo;
  gear?: GearItem[];
  title?: string;
  changedFields?: string[];
  emit: (action: string, payload: unknown) => void;
}

const QUALITY_COLOR: Record<string, string> = {
  Poor: "#9d9d9d",
  Common: "#ffffff",
  Uncommon: "#1eff00",
  Rare: "#0070dd",
  Epic: "#a335ee",
  Legendary: "#ff8000",
};

const CLASS_COLOR: Record<string, string> = {
  "Death Knight": "#C41E3A",
  "Demon Hunter": "#A330C9",
  Druid: "#FF7C0A",
  Evoker: "#33937F",
  Hunter: "#AAD372",
  Mage: "#3FC7EB",
  Monk: "#00FF98",
  Paladin: "#F48CBA",
  Priest: "#FFFFFF",
  Rogue: "#FFF468",
  Shaman: "#0070DD",
  Warlock: "#8788EE",
  Warrior: "#C69B6D",
};

// WoW paperdoll slot layout — left column, right column, bottom row
const LEFT_SLOTS = ["Head", "Neck", "Shoulders", "Back", "Chest", "Wrist"];
const RIGHT_SLOTS = ["Hands", "Waist", "Legs", "Feet", "Ring 1", "Ring 2"];
const BOTTOM_SLOTS = ["Main Hand", "Trinket 1", "Trinket 2", "Off Hand"];

// Fallback slot icons (single-char abbreviations for empty slots)
const SLOT_ABBR: Record<string, string> = {
  Head: "He", Neck: "Nk", Shoulders: "Sh", Back: "Bk", Chest: "Ch", Wrist: "Wr",
  Hands: "Hn", Waist: "Wa", Legs: "Lg", Feet: "Ft", "Ring 1": "R1", "Ring 2": "R2",
  "Main Hand": "MH", "Off Hand": "OH", "Trinket 1": "T1", "Trinket 2": "T2",
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ── Tooltip ── */

function ItemTooltip({ item }: { item: GearItem }) {
  const qualityColor = QUALITY_COLOR[item.quality ?? "Common"] ?? "#ffffff";
  return (
    <div style={{
      background: "#1a1a2e", border: "1px solid #444", borderRadius: 4,
      padding: "10px 12px", minWidth: 220, maxWidth: 300,
      boxShadow: "0 6px 20px rgba(0,0,0,0.7)", fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: qualityColor, lineHeight: 1.2 }}>{item.name}</div>
      <div style={{ fontSize: 12, color: "#ffd100", marginTop: 4 }}>Item Level {item.ilvl}</div>
      {item.source && <div style={{ fontSize: 11, color: "#1eff00", marginTop: 2 }}>{item.source}</div>}
      {item.track && (
        <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>
          {capitalize(item.track)} {item.rank}/{item.max_rank}
        </div>
      )}
      {item.binding && <div style={{ fontSize: 11, color: "#fff", marginTop: 4 }}>{item.binding}</div>}
      {item.unique && <div style={{ fontSize: 11, color: "#fff" }}>{item.unique}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 11, color: "#fff" }}>{item.slot}</span>
        {item.armor_type && <span style={{ fontSize: 11, color: "#fff" }}>{item.armor_type}</span>}
      </div>
      {item.armor != null && item.armor > 0 && (
        <div style={{ fontSize: 11, color: "#fff", marginTop: 2 }}>{item.armor} Armor</div>
      )}
      {item.stats && item.stats.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {item.stats.map((s, i) => (
            <div key={i} style={{ fontSize: 11, color: s.is_equip_bonus ? "#1eff00" : "#fff" }}>
              +{s.value} {s.name}
            </div>
          ))}
        </div>
      )}
      {item.sockets && item.sockets.length > 0 && (
        <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
          {item.sockets.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" style={{ flexShrink: 0 }}>
                <rect x="2" y="2" width="8" height="8" rx="1" transform="rotate(45 6 6)"
                  fill={s.empty ? "none" : "#1eff00"} stroke={s.empty ? "#666" : "#1eff00"} strokeWidth="1.2" />
              </svg>
              <span style={{ fontSize: 11, color: s.empty ? "#ff4444" : "#1eff00" }}>
                {s.empty ? "Empty Socket" : `${s.gem ?? "Gem"}${s.display ? ` — ${s.display}` : ""}`}
              </span>
            </div>
          ))}
        </div>
      )}
      {item.spells && item.spells.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {item.spells.map((sp, i) => (
            <div key={i} style={{ fontSize: 11, color: "#1eff00", lineHeight: 1.3 }}>{sp.description}</div>
          ))}
        </div>
      )}
      {item.limit_category && <div style={{ fontSize: 11, color: "#fff", marginTop: 4 }}>{item.limit_category}</div>}
      {item.flavor_text && (
        <div style={{ fontSize: 11, color: "#ffd100", fontStyle: "italic", marginTop: 4, lineHeight: 1.3 }}>
          &ldquo;{item.flavor_text}&rdquo;
        </div>
      )}
    </div>
  );
}

function PositionedTooltip({ item, anchorRef, side }: { item: GearItem; anchorRef: React.RefObject<HTMLDivElement | null>; side: "left" | "right" | "bottom" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({
    position: "fixed", zIndex: 9999, pointerEvents: "none", visibility: "hidden",
    top: -9999, left: -9999,
  });

  useLayoutEffect(() => {
    if (!ref.current || !anchorRef.current) return;
    const anchor = anchorRef.current.getBoundingClientRect();
    const tip = ref.current.getBoundingClientRect();
    const gap = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let x: number;
    let y: number;

    if (side === "left") {
      // Try placing left of anchor, fall back to right
      x = anchor.left - tip.width - gap;
      if (x < 4) x = anchor.right + gap;
      y = anchor.top + anchor.height / 2 - tip.height / 2;
    } else if (side === "right") {
      // Try placing right of anchor, fall back to left
      x = anchor.right + gap;
      if (x + tip.width > vw - 4) x = anchor.left - tip.width - gap;
      y = anchor.top + anchor.height / 2 - tip.height / 2;
    } else {
      // Bottom slots — try above, fall back below
      x = anchor.left + anchor.width / 2 - tip.width / 2;
      y = anchor.top - tip.height - gap;
      if (y < 4) y = anchor.bottom + gap;
    }

    // Clamp to viewport
    if (x < 4) x = 4;
    if (x + tip.width > vw - 4) x = vw - 4 - tip.width;
    if (y < 4) y = 4;
    if (y + tip.height > vh - 4) y = vh - 4 - tip.height;

    setPos({ position: "fixed", zIndex: 9999, pointerEvents: "none", visibility: "visible", top: y, left: x });
  }, [side, anchorRef]);

  return (
    <div ref={ref} style={pos}>
      <ItemTooltip item={item} />
    </div>
  );
}

/* ── Slot cell ── */

function SlotCell({ item, side, size = 40 }: { item?: GearItem; side: "left" | "right" | "bottom"; size?: number }) {
  const [hover, setHover] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const slotName = item?.slot ?? "";
  const borderColor = item ? (QUALITY_COLOR[item.quality ?? "Common"] ?? "#fff") : "#333";

  return (
    <div
      ref={cellRef}
      style={{ position: "relative", cursor: item ? "pointer" : "default" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {item?.icon ? (
        <img
          src={item.icon} alt={item.name} width={size} height={size}
          style={{ borderRadius: 4, border: `2px solid ${borderColor}`, display: "block" }}
        />
      ) : (
        <div style={{
          width: size, height: size, borderRadius: 4,
          border: `2px solid ${borderColor}`,
          background: "rgba(255,255,255,0.03)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, color: "var(--tome-text-disabled)",
        }}>
          {SLOT_ABBR[slotName] ?? "?"}
        </div>
      )}
      {hover && item && <PositionedTooltip item={item} anchorRef={cellRef} side={side} />}
    </div>
  );
}

/* ── Slot row (icon + label + ilvl) ── */

function SlotRow({ item, side, iconSize }: { item?: GearItem; side: "left" | "right"; iconSize: number }) {
  const ilvlColor = item ? (QUALITY_COLOR[item.quality ?? "Common"] ?? "#fff") : "var(--tome-text-disabled)";
  const label = item?.slot ?? "";

  if (side === "left") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SlotCell item={item} side="left" size={iconSize} />
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ fontSize: 10, color: "var(--tome-text-disabled)", lineHeight: 1 }}>{label}</div>
          {item && (
            <div style={{ fontSize: 12, fontWeight: 600, color: ilvlColor, lineHeight: 1.3 }}>{item.ilvl}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexDirection: "row-reverse" }}>
      <SlotCell item={item} side="right" size={iconSize} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", minWidth: 0 }}>
        <div style={{ fontSize: 10, color: "var(--tome-text-disabled)", lineHeight: 1 }}>{label}</div>
        {item && (
          <div style={{ fontSize: 12, fontWeight: 600, color: ilvlColor, lineHeight: 1.3 }}>{item.ilvl}</div>
        )}
      </div>
    </div>
  );
}

/* ── Main component ── */

export default function Paperdoll({ character, gear, title, changedFields }: Props) {
  const gearMap = useMemo(() => {
    const map: Record<string, GearItem> = {};
    if (gear) for (const g of gear) map[g.slot] = g;
    return map;
  }, [gear]);

  // Enchantable slots in TWW
  const ENCHANTABLE_SLOTS = ["Back", "Chest", "Wrist", "Legs", "Feet", "Ring 1", "Ring 2", "Main Hand"];

  const enchantSummary = useMemo(() => {
    return ENCHANTABLE_SLOTS.map((slot) => {
      const item = gearMap[slot];
      const enchant = item?.enchantments?.[0]?.name ?? null;
      return { slot, enchanted: !!enchant, name: enchant };
    });
  }, [gearMap]);

  const socketSummary = useMemo(() => {
    if (!gear) return [];
    const out: { slot: string; gem: string | null; display: string | null; empty: boolean }[] = [];
    for (const g of gear) {
      if (!g.sockets) continue;
      for (const s of g.sockets) {
        out.push({ slot: g.slot, gem: s.gem ?? null, display: s.display ?? null, empty: !!s.empty });
      }
    }
    return out;
  }, [gear]);

  const classColor = CLASS_COLOR[character?.class ?? ""] ?? "var(--tome-text-primary)";
  const hasData = gear && gear.length > 0;
  const changed = changedFields?.includes("gear") || changedFields?.includes("character");
  const iconSize = 40;

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      background: "var(--tome-bg-primary)", color: "var(--tome-text-primary)", overflow: "hidden",
    }}>
      {/* Header */}
      {title && (
        <div style={{
          padding: "10px 16px", borderBottom: "1px solid var(--tome-border-primary)",
          fontSize: 13, fontWeight: 600,
        }}>
          {title}
        </div>
      )}

      {/* Body */}
      <div
        className={changed ? "tome-changed" : undefined}
        style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        {!hasData ? (
          <div style={{ padding: 20, fontSize: 12, color: "var(--tome-text-disabled)", fontStyle: "italic" }}>
            No gear data loaded. Wire a data node to the <code>gear</code> and <code>character</code> props.
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            {/* Character info bar */}
            <div style={{
              padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 16,
              borderBottom: "1px solid var(--tome-border-secondary)",
            }}>
              {character?.avatar && (
                <img src={character.avatar} alt="" width={32} height={32}
                  style={{ borderRadius: 4, border: `2px solid ${classColor}` }} />
              )}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: classColor }}>{character?.name}</div>
                <div style={{ fontSize: 11, color: "var(--tome-text-secondary)" }}>
                  {character?.level} {character?.spec} {character?.class} — {character?.realm}
                </div>
              </div>
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                padding: "4px 12px", borderRadius: 6,
                background: "var(--tome-bg-secondary)",
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--tome-text-primary)" }}>
                  {character?.equipped_ilvl}
                </div>
                <div style={{ fontSize: 9, color: "var(--tome-text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  ilvl
                </div>
              </div>
            </div>

            {/* Paperdoll grid */}
            <div style={{
              flex: 1, minHeight: 0, display: "flex", justifyContent: "center", alignItems: "stretch",
              padding: "12px 12px 8px",
            }}>
              {/* Left column */}
              <div style={{
                display: "flex", flexDirection: "column", justifyContent: "space-between",
                width: 120, flexShrink: 0, paddingTop: 4, paddingBottom: 4,
              }}>
                {LEFT_SLOTS.map((slot) => (
                  <SlotRow key={slot} item={gearMap[slot]} side="left" iconSize={iconSize} />
                ))}
              </div>

              {/* Center — character render */}
              <div style={{
                flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "center",
                overflow: "hidden", position: "relative",
              }}>
                {character?.render ? (
                  <img
                    src={character.render}
                    alt={character.name ?? "Character"}
                    style={{
                      width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center",
                      filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.6))",
                    }}
                  />
                ) : character?.inset ? (
                  <img
                    src={character.inset}
                    alt={character.name ?? "Character"}
                    style={{
                      width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center",
                      borderRadius: 8,
                    }}
                  />
                ) : (
                  <div style={{
                    fontSize: 48, color: "var(--tome-text-disabled)", opacity: 0.2,
                    fontWeight: 700, userSelect: "none",
                  }}>
                    ?
                  </div>
                )}
              </div>

              {/* Right column */}
              <div style={{
                display: "flex", flexDirection: "column", justifyContent: "space-between",
                width: 120, flexShrink: 0, paddingTop: 4, paddingBottom: 4,
              }}>
                {RIGHT_SLOTS.map((slot) => (
                  <SlotRow key={slot} item={gearMap[slot]} side="right" iconSize={iconSize} />
                ))}
              </div>
            </div>

            {/* Bottom row — weapons + trinkets */}
            <div style={{
              display: "flex", justifyContent: "center", alignItems: "center",
              gap: 16, padding: "8px 16px",
              borderTop: "1px solid var(--tome-border-secondary)",
            }}>
              {BOTTOM_SLOTS.map((slot) => {
                const item = gearMap[slot];
                return (
                  <div key={slot} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <SlotCell item={item} side="bottom" size={iconSize} />
                    <div style={{ fontSize: 9, color: "var(--tome-text-disabled)" }}>{slot}</div>
                    {item && (
                      <div style={{
                        fontSize: 11, fontWeight: 600,
                        color: QUALITY_COLOR[item.quality ?? "Common"] ?? "#fff",
                      }}>
                        {item.ilvl}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Gems & Enchants summary */}
            <div style={{
              display: "flex", gap: 12, padding: "8px 16px 10px",
              borderTop: "1px solid var(--tome-border-secondary)",
              overflowX: "auto", flexShrink: 0,
            }}>
              {/* Gems */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 10, fontWeight: 600, color: "var(--tome-text-secondary)",
                  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4,
                }}>
                  Gems ({socketSummary.filter(s => !s.empty).length}/{socketSummary.length})
                </div>
                {socketSummary.length === 0 ? (
                  <div style={{ fontSize: 11, color: "var(--tome-text-disabled)", fontStyle: "italic" }}>No sockets</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {socketSummary.map((s, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <svg width="10" height="10" viewBox="0 0 12 12" style={{ flexShrink: 0 }}>
                          <rect x="2" y="2" width="8" height="8" rx="1" transform="rotate(45 6 6)"
                            fill={s.empty ? "none" : "#1eff00"} stroke={s.empty ? "#666" : "#1eff00"} strokeWidth="1.2" />
                        </svg>
                        <span style={{
                          fontSize: 11, color: s.empty ? "#ff4444" : "var(--tome-text-primary)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          <span style={{ color: "var(--tome-text-disabled)" }}>{s.slot}:</span>{" "}
                          {s.empty ? "Empty" : s.gem}
                          {s.display && !s.empty && (
                            <span style={{ color: "var(--tome-text-secondary)" }}> ({s.display})</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Enchants */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 10, fontWeight: 600, color: "var(--tome-text-secondary)",
                  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4,
                }}>
                  Enchants ({enchantSummary.filter(e => e.enchanted).length}/{enchantSummary.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {enchantSummary.map((e) => (
                    <div key={e.slot} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                        background: e.enchanted ? "#1eff00" : "#ff4444",
                        opacity: e.enchanted ? 1 : 0.6,
                      }} />
                      <span style={{
                        fontSize: 11, color: e.enchanted ? "var(--tome-text-primary)" : "#ff4444",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        <span style={{ color: "var(--tome-text-disabled)" }}>{e.slot}:</span>{" "}
                        {e.enchanted ? e.name : "Missing"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const meta = {
  type: "paperdoll",
  description: "WoW character sheet paperdoll with gear slots and character model",
  ports: {
    inputs: [
      { prop: "character", label: "Character Info", type: "record" },
      { prop: "gear", label: "Gear Items", type: "list" },
      { prop: "title", label: "Title", type: "string" },
    ],
    outputs: [],
  },
};
