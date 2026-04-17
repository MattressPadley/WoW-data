import React, { useMemo, useState } from "react";
import { colors, Stack, SectionHeader, EmptyState, Text, useTooltip, usePopover, ListItem } from "@tome/ui";

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

interface CharacterOption {
  value: string;
  label: string;
  class?: string;
  spec?: string;
  realm?: string;
  level?: number;
  avatar?: string;
  equipped_ilvl?: number;
}

interface RawCharacterRow {
  name?: string;
  realm?: string;
  class?: string;
  spec?: string;
  region?: string;
  _source?: string;
}

interface Props {
  character?: CharacterInfo;
  gear?: GearItem[];
  title?: string;
  characters?: (CharacterOption | RawCharacterRow)[];
  selected?: string;
  changedFields?: string[];
  emit: (action: string, payload: unknown) => void;
  savedState?: Record<string, unknown>;
  saveState?: (patch: Record<string, unknown>) => void;
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

const LEFT_SLOTS = ["Head", "Neck", "Shoulders", "Back", "Chest", "Wrist"];
const RIGHT_SLOTS = ["Hands", "Waist", "Legs", "Feet", "Ring 1", "Ring 2"];
const BOTTOM_SLOTS = ["Main Hand", "Trinket 1", "Trinket 2", "Off Hand"];

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
    <div style={{ minWidth: 220, maxWidth: 300 }}>
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

/* ── Slot cell ── */

function SlotCell({ item, side, size = 40 }: { item?: GearItem; side: "left" | "right" | "top"; size?: number }) {
  const tooltipSide = side === "left" ? "left" : side === "right" ? "right" : "top";
  const { triggerRef, triggerProps, Tooltip } = useTooltip({ side: tooltipSide, gap: 8 });
  const slotName = item?.slot ?? "";
  const borderColor = item ? (QUALITY_COLOR[item.quality ?? "Common"] ?? "#fff") : "#333";

  return (
    <div ref={triggerRef} {...triggerProps} style={{ cursor: item ? "pointer" : "default" }}>
      {item?.icon ? (
        <img src={item.icon} alt={item.name} width={size} height={size}
          style={{ borderRadius: 4, border: `2px solid ${borderColor}`, display: "block" }} />
      ) : (
        <div style={{
          width: size, height: size, borderRadius: 4, border: `2px solid ${borderColor}`,
          background: "rgba(255,255,255,0.03)", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, color: colors.textDisabled,
        }}>
          {SLOT_ABBR[slotName] ?? "?"}
        </div>
      )}
      {item && <Tooltip><ItemTooltip item={item} /></Tooltip>}
    </div>
  );
}

/* ── Slot row (icon + label + ilvl) ── */

function SlotRow({ item, side, iconSize }: { item?: GearItem; side: "left" | "right"; iconSize: number }) {
  const ilvlColor = item ? (QUALITY_COLOR[item.quality ?? "Common"] ?? "#fff") : colors.textDisabled;
  const label = item?.slot ?? "";

  if (side === "left") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SlotCell item={item} side="left" size={iconSize} />
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <Text size="xs" color={colors.textDisabled} style={{ lineHeight: 1 }}>{label}</Text>
          {item && <Text size="sm" weight={600} color={ilvlColor} style={{ lineHeight: 1.3 }}>{item.ilvl}</Text>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexDirection: "row-reverse" }}>
      <SlotCell item={item} side="right" size={iconSize} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", minWidth: 0 }}>
        <Text size="xs" color={colors.textDisabled} style={{ lineHeight: 1 }}>{label}</Text>
        {item && <Text size="sm" weight={600} color={ilvlColor} style={{ lineHeight: 1.3 }}>{item.ilvl}</Text>}
      </div>
    </div>
  );
}

/* ── Character info bar (shared by top bar and dropdown rows) ── */

interface InfoBarFields {
  name?: string;
  class?: string;
  spec?: string;
  realm?: string;
  level?: number;
  avatar?: string;
  equipped_ilvl?: number;
}

function CharacterInfoBar({
  char, nameSlot,
}: {
  char: InfoBarFields;
  /** If provided, replaces the plain name <Text> (used for the clickable trigger on the top bar). */
  nameSlot?: React.ReactNode;
}) {
  const classColor = CLASS_COLOR[char.class ?? ""] ?? colors.textPrimary;
  const initial = (char.name ?? "?").charAt(0).toUpperCase();
  return (
    <div style={{
      padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 16, width: "100%",
    }}>
      {char.avatar ? (
        <img src={char.avatar} alt="" width={32} height={32}
          style={{ borderRadius: 4, border: `2px solid ${classColor}` }} />
      ) : (
        <div style={{
          width: 32, height: 32, borderRadius: 4, border: `2px solid ${classColor}`,
          background: colors.bgTertiary, display: "flex", alignItems: "center", justifyContent: "center",
          color: classColor, fontWeight: 700, fontSize: 14, flexShrink: 0,
        }}>{initial}</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {nameSlot ?? <Text size="md" weight={700} color={classColor}>{char.name}</Text>}
        <Text size="sm" color={colors.textSecondary}>
          {[char.level, char.spec, char.class].filter(Boolean).join(" ")}
          {char.realm ? ` — ${char.realm}` : ""}
        </Text>
      </div>
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "4px 12px", borderRadius: 6, background: colors.bgSecondary,
        opacity: char.equipped_ilvl ? 1 : 0.35,
      }}>
        <Text size="lg" weight={700}>{char.equipped_ilvl ?? "—"}</Text>
        <Text size="xs" color={colors.textSecondary} uppercase>ilvl</Text>
      </div>
    </div>
  );
}

/* ── Character info bar dropdown (whole bar = trigger) ── */

function CharacterInfoBarSelector({
  char, characters, selected, onSelect,
}: {
  char: InfoBarFields;
  characters?: CharacterOption[];
  selected?: string;
  onSelect: (value: string) => void;
}) {
  const { triggerRef, triggerProps, Popover, close } = usePopover({ side: "bottom", gap: 6 });
  const others = (characters ?? []).filter((o) => o.value !== selected);
  const classColor = CLASS_COLOR[char.class ?? ""] ?? colors.textPrimary;

  if (others.length === 0) {
    return <CharacterInfoBar char={char} />;
  }

  return (
    <>
      <div
        ref={triggerRef as React.RefObject<HTMLDivElement>}
        {...triggerProps}
        style={{ cursor: "pointer", userSelect: "none", position: "relative" }}
      >
        <CharacterInfoBar
          char={char}
          nameSlot={
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Text size="md" weight={700} color={classColor}>{char.name ?? "—"}</Text>
              <span style={{ fontSize: 10, color: classColor, opacity: 0.6, lineHeight: 1 }}>▾</span>
            </div>
          }
        />
      </div>
      <Popover>
        <div style={{
          minWidth: 320, padding: 4, background: colors.bgSecondary,
          border: `1px solid ${colors.borderPrimary}`, borderRadius: 6,
        }}>
          {others.map((opt) => (
            <ListItem
              key={opt.value}
              onClick={() => { onSelect(opt.value); close(); }}
            >
              <CharacterInfoBar char={opt} />
            </ListItem>
          ))}
        </div>
      </Popover>
    </>
  );
}

/* ── Main component ── */

export default function Paperdoll({ character, gear, title, characters, selected, changedFields, emit, savedState, saveState }: Props) {
  const normalizedCharacters: CharacterOption[] = useMemo(() => {
    if (!characters) return [];
    return characters.map((raw) => {
      if ("value" in raw && raw.value) return raw as CharacterOption;
      const source = (raw as RawCharacterRow)._source ?? "";
      const slug = source ? source.split("/").pop()!.replace(/\.ya?ml$/i, "") : (raw.name ?? "").toLowerCase();
      const realm = raw.realm ? raw.realm.charAt(0).toUpperCase() + raw.realm.slice(1) : undefined;
      return {
        value: slug,
        label: raw.name ?? slug,
        class: raw.class,
        spec: raw.spec,
        realm,
      };
    });
  }, [characters]);
  const [activeSelected, setActiveSelected] = useState<string | undefined>(() => {
    if (savedState?.selected && typeof savedState.selected === "string") return savedState.selected;
    return selected;
  });
  const effectiveSelected = activeSelected ?? (() => {
    if (character?.name && normalizedCharacters.length) {
      const match = normalizedCharacters.find((c) => c.label.toLowerCase() === character.name!.toLowerCase());
      if (match) return match.value;
    }
    return undefined;
  })();
  const handleSelect = (value: string) => {
    setActiveSelected(value);
    saveState?.({ selected: value });
    emit("selectCharacter", value);
  };
  const handleRefresh = () => { emit("refresh", null); };
  const gearMap = useMemo(() => {
    const map: Record<string, GearItem> = {};
    if (gear) for (const g of gear) map[g.slot] = g;
    return map;
  }, [gear]);

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

  const classColor = CLASS_COLOR[character?.class ?? ""] ?? colors.textPrimary;
  const hasData = gear && gear.length > 0;
  const changed = changedFields?.includes("gear") || changedFields?.includes("character");
  const iconSize = 40;

  return (
    <Stack style={{ height: "100%", overflow: "hidden" }}>
      {title && <SectionHeader>{title}</SectionHeader>}

      <div
        className={changed ? "tome-changed" : undefined}
        style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        {!hasData ? (
          <EmptyState>No gear data loaded. Wire a data node to the gear and character props.</EmptyState>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            {/* Character info bar */}
            <div style={{ position: "relative", borderBottom: `1px solid ${colors.borderSecondary}` }}>
              <CharacterInfoBarSelector
                char={character ?? {}}
                characters={normalizedCharacters}
                selected={effectiveSelected}
                onSelect={handleSelect}
              />
              <button
                onClick={handleRefresh}
                title="Refresh character data"
                style={{
                  position: "absolute", top: 6, right: 6,
                  width: 24, height: 24, padding: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "transparent", border: `1px solid ${colors.borderSecondary}`,
                  borderRadius: 4, cursor: "pointer", color: colors.textSecondary,
                  fontSize: 12, lineHeight: 1,
                }}
              >↻</button>
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
                    src={character.render} alt={character.name ?? "Character"}
                    style={{
                      width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center",
                      filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.6))",
                    }}
                  />
                ) : character?.inset ? (
                  <img
                    src={character.inset} alt={character.name ?? "Character"}
                    style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", borderRadius: 8 }}
                  />
                ) : (
                  <div style={{ fontSize: 48, color: colors.textDisabled, opacity: 0.2, fontWeight: 700, userSelect: "none" }}>?</div>
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
              gap: 16, padding: "8px 16px", borderTop: `1px solid ${colors.borderSecondary}`,
            }}>
              {BOTTOM_SLOTS.map((slot) => {
                const item = gearMap[slot];
                return (
                  <div key={slot} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <SlotCell item={item} side="top" size={iconSize} />
                    <Text size="xs" color={colors.textDisabled}>{slot}</Text>
                    {item && (
                      <Text size="sm" weight={600} color={QUALITY_COLOR[item.quality ?? "Common"] ?? "#fff"}>
                        {item.ilvl}
                      </Text>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Gems & Enchants summary */}
            <div style={{
              display: "flex", gap: 12, padding: "8px 16px 10px",
              borderTop: `1px solid ${colors.borderSecondary}`, overflowX: "auto", flexShrink: 0,
            }}>
              {/* Gems */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text size="xs" weight={600} color={colors.textSecondary} uppercase style={{ marginBottom: 4 }}>
                  Gems ({socketSummary.filter(s => !s.empty).length}/{socketSummary.length})
                </Text>
                {socketSummary.length === 0 ? (
                  <Text size="sm" color={colors.textDisabled} style={{ fontStyle: "italic" }}>No sockets</Text>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {socketSummary.map((s, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <svg width="10" height="10" viewBox="0 0 12 12" style={{ flexShrink: 0 }}>
                          <rect x="2" y="2" width="8" height="8" rx="1" transform="rotate(45 6 6)"
                            fill={s.empty ? "none" : "#1eff00"} stroke={s.empty ? "#666" : "#1eff00"} strokeWidth="1.2" />
                        </svg>
                        <span style={{
                          fontSize: 11, color: s.empty ? "#ff4444" : colors.textPrimary,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          <span style={{ color: colors.textDisabled }}>{s.slot}:</span>{" "}
                          {s.empty ? "Empty" : s.gem}
                          {s.display && !s.empty && (
                            <span style={{ color: colors.textSecondary }}> ({s.display})</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Enchants */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text size="xs" weight={600} color={colors.textSecondary} uppercase style={{ marginBottom: 4 }}>
                  Enchants ({enchantSummary.filter(e => e.enchanted).length}/{enchantSummary.length})
                </Text>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {enchantSummary.map((e) => (
                    <div key={e.slot} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                        background: e.enchanted ? "#1eff00" : "#ff4444",
                        opacity: e.enchanted ? 1 : 0.6,
                      }} />
                      <span style={{
                        fontSize: 11, color: e.enchanted ? colors.textPrimary : "#ff4444",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        <span style={{ color: colors.textDisabled }}>{e.slot}:</span>{" "}
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
    </Stack>
  );
}

export const meta = {
  type: "paperdoll",
  description: "WoW character sheet paperdoll with gear slots and character model",
  ports: {
    inputs: [
      { prop: "character", label: "Character Info", type: "record" },
      { prop: "gear", label: "Gear Items", type: "list" },
      { prop: "characters", label: "Character Options", type: ["table", "list"] },
      { prop: "selected", label: "Selected Slug", type: "string" },
      { prop: "title", label: "Title", type: "string" },
    ],
    outputs: [
      { action: "selectCharacter", label: "Selected Character", type: "string" },
      { action: "refresh", label: "Refresh", type: "trigger" },
    ],
  },
};
