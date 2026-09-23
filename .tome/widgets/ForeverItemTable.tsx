import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChipGroup,
  DataGrid,
  EmptyState,
  SectionHeader,
  Select,
  Stack,
  Text,
  TextInput,
  colors,
  useTooltip,
  type ColumnDef,
} from "@tome/ui";
import { qualityColor, qualityRank } from "./lib/quality";
import { ItemTooltipCard, TooltipLine, TOOLTIP_EFFECT, TOOLTIP_FLAVOR, TOOLTIP_MUTED, TOOLTIP_TEXT } from "./lib/ItemTooltip";

/* ── The `forever/catalog/items-view.json` row shape ── */

interface ForeverWeapon {
  damage_curve: string;
  speed: number;
  min_damage: number;
  max_damage: number;
  dps: number;
  damage_type_id: number;
}

interface ForeverItemStat {
  stat: string | null;
  value: number | null;
  unknown?: string;
}

interface ForeverItemEffect {
  spell_name: string | null;
  spell_description: string | null;
  trigger_type: number;
  cooldown_ms: number;
}

/** Fields are omitted, not nulled, by the projection — everything optional is genuinely absent. */
interface ForeverItem {
  id: number;
  name: string;
  /** Null only on a datamined gap item upstream gives no value for. */
  item_level: number | null;
  required_level: number | null;
  icon?: string;
  quality?: string;
  inventory_type?: string;
  item_class?: string;
  item_subclass?: string;
  binding?: string;
  flavor?: string;
  allowable_classes?: string[];
  allowable_races?: string[];
  armor?: number;
  armor_unknown?: string;
  weapon?: ForeverWeapon;
  weapon_unknown?: string;
  stats?: ForeverItemStat[];
  effects?: ForeverItemEffect[];
  item_set?: { id: number; name: string };
  sockets?: (string | null)[];
  /** Set on gap items: the build has no stats row, so this row is datamined (wowtbc.gg). */
  data_source?: string;
  /** Gap items only: upstream's stat blocks, raw — never build-computed. */
  upstream_stats?: Record<string, Record<string, number | string>>;
  /** Drop/quest sources, each stamped with where it came from. Absent = none known. */
  drop_sources?: {
    dungeon: string;
    kind: "boss" | "trash" | "quest";
    name?: string;
    source: string;
    discovered: boolean | null;
    fetched_at: string;
  }[];
}

interface ViewMeta {
  build?: string;
  item_count?: number;
  gap_item_count?: number;
  /** The catalogue's own sentence about when a drop source is (not) shown. Rendered verbatim. */
  drop_sources_unknown?: string;
}

interface Props {
  items?: ForeverItem[];
  meta?: ViewMeta;
  title?: string;
  changedFields?: string[];
  emit: (action: string, payload: unknown) => void;
  savedState?: Record<string, unknown>;
  saveState?: (patch: Record<string, unknown>) => void;
}

/* ── Icons ── */

/**
 * The catalogue stores icon *names*; the URL is composed here.
 *
 * This is a third-party CDN (Wowhead's), the one place this repo reaches
 * outside its own cached data. An item with no icon name renders the
 * placeholder tile — never another item's art.
 */
const ICON_BASE = "https://wow.zamimg.com/images/wow/icons/large";
const ICON_SIZE = 24;

function iconUrl(icon: string): string {
  return `${ICON_BASE}/${icon}.jpg`;
}

function ItemIcon({ item, size = ICON_SIZE }: { item: ForeverItem; size?: number }) {
  const [failed, setFailed] = useState(false);
  const border = `1px solid ${qualityColor(item.quality)}`;

  if (!item.icon || failed) {
    return (
      <div
        title={item.icon ? "icon failed to load" : "no icon in this build"}
        style={{
          width: size, height: size, borderRadius: 3, border, background: colors.bgTertiary,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, color: colors.textDisabled, flexShrink: 0,
        }}
      >
        ?
      </div>
    );
  }
  return (
    <img
      src={iconUrl(item.icon)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ borderRadius: 3, border, display: "block", flexShrink: 0 }}
    />
  );
}

/* ── Tooltip body ── */

function triggerLabel(effect: ForeverItemEffect): string {
  // `ItemEffect.TriggerType`: 0 is on-use, everything else is passive/equipped.
  return effect.trigger_type === 0 ? "Use:" : "Equip:";
}

const SOURCE_LABEL: Record<string, string> = { "wowtbc-warcraftforever": "wowtbc.gg, datamined" };

function sourceLine(s: NonNullable<ForeverItem["drop_sources"]>[number]): string {
  const where = s.kind === "trash" ? `${s.dungeon} trash` : s.kind === "quest" ? `Quest: ${s.name} (${s.dungeon})` : `${s.name} — ${s.dungeon}`;
  return `${where} [${SOURCE_LABEL[s.source] ?? s.source}]`;
}

function ForeverItemTooltip({ item, dropSourceNote }: { item: ForeverItem; dropSourceNote?: string }) {
  const stats = item.stats ?? [];
  const effects = item.effects ?? [];
  const upstream = Object.values(item.upstream_stats ?? {}).flatMap((block) => Object.entries(block));
  return (
    <ItemTooltipCard name={item.name} quality={item.quality} itemLevel={item.item_level}>
      {item.binding && <TooltipLine top={4}>{item.binding}</TooltipLine>}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, gap: 12 }}>
        <span style={{ fontSize: 11, color: TOOLTIP_TEXT }}>{item.inventory_type ?? ""}</span>
        <span style={{ fontSize: 11, color: TOOLTIP_TEXT }}>{item.item_subclass ?? item.item_class ?? ""}</span>
      </div>

      {item.armor != null && <TooltipLine top={2}>{item.armor} Armor</TooltipLine>}
      {item.armor_unknown && <TooltipLine color={TOOLTIP_MUTED} top={2}>Armor unknown — {item.armor_unknown}</TooltipLine>}

      {item.weapon && (
        <div style={{ marginTop: 2 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontSize: 11, color: TOOLTIP_TEXT }}>
              {item.weapon.min_damage} – {item.weapon.max_damage} Damage
            </span>
            <span style={{ fontSize: 11, color: TOOLTIP_TEXT }}>Speed {item.weapon.speed.toFixed(2)}</span>
          </div>
          <TooltipLine color={TOOLTIP_MUTED}>({item.weapon.dps.toFixed(1)} damage per second)</TooltipLine>
        </div>
      )}
      {item.weapon_unknown && <TooltipLine color={TOOLTIP_MUTED} top={2}>Damage unknown — {item.weapon_unknown}</TooltipLine>}

      {stats.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {stats.map((s, i) =>
            s.value != null ? (
              <TooltipLine key={i}>+{s.value} {s.stat ?? "Unknown stat"}</TooltipLine>
            ) : (
              <TooltipLine key={i} color={TOOLTIP_MUTED}>
                {s.stat ?? "Unknown stat"} — value unknown{s.unknown ? ` (${s.unknown})` : ""}
              </TooltipLine>
            ),
          )}
        </div>
      )}

      {upstream.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {upstream.map(([k, v], i) => (
            <TooltipLine key={i} color={TOOLTIP_MUTED}>{k}: {String(v)} (upstream)</TooltipLine>
          ))}
        </div>
      )}

      {(item.required_level ?? 0) > 0 && <TooltipLine top={4}>Requires Level {item.required_level}</TooltipLine>}
      {item.allowable_classes && <TooltipLine>Classes: {item.allowable_classes.join(", ")}</TooltipLine>}
      {item.allowable_races && <TooltipLine>Races: {item.allowable_races.join(", ")}</TooltipLine>}

      {effects.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {effects.map((e, i) => (
            <TooltipLine key={i} color={TOOLTIP_EFFECT}>
              {triggerLabel(e)} {e.spell_description ?? e.spell_name ?? "unknown effect"}
              {e.cooldown_ms > 0 ? ` (${Math.round(e.cooldown_ms / 1000)} sec cooldown)` : ""}
            </TooltipLine>
          ))}
        </div>
      )}

      {item.item_set && <TooltipLine color={TOOLTIP_MUTED} top={4}>{item.item_set.name}</TooltipLine>}
      {item.flavor && (
        <TooltipLine color={TOOLTIP_FLAVOR} italic top={4}>
          &ldquo;{item.flavor}&rdquo;
        </TooltipLine>
      )}
      {item.data_source && (
        <TooltipLine color={TOOLTIP_MUTED} top={6}>
          Not in this build&apos;s stats table — name and upstream stats are datamined ({SOURCE_LABEL[item.data_source] ?? item.data_source})
        </TooltipLine>
      )}
      {item.drop_sources ? (
        <div style={{ marginTop: 6 }}>
          {item.drop_sources.map((s, i) => (
            <TooltipLine key={i} color={TOOLTIP_MUTED}>{sourceLine(s)}</TooltipLine>
          ))}
        </div>
      ) : (
        dropSourceNote && <TooltipLine color={TOOLTIP_MUTED} top={6}>No drop source — {dropSourceNote}</TooltipLine>
      )}
    </ItemTooltipCard>
  );
}

/** The name cell doubles as the tooltip trigger, so hovering anywhere on it opens the card. */
function NameCell({ item, dropSourceNote }: { item: ForeverItem; dropSourceNote?: string }) {
  const { triggerRef, triggerProps, Tooltip } = useTooltip({ side: "right", gap: 10, delay: 120 });
  return (
    <div
      ref={triggerRef as React.RefObject<HTMLDivElement>}
      {...triggerProps}
      style={{
        display: "flex", alignItems: "center", gap: 8, minWidth: 0,
        color: qualityColor(item.quality), fontWeight: 600,
      }}
    >
      <ItemIcon item={item} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
      <Tooltip><ForeverItemTooltip item={item} dropSourceNote={dropSourceNote} /></Tooltip>
    </div>
  );
}

/* ── Sorting ── */

type SortKey = "name" | "item_level" | "required_level" | "quality" | "inventory_type" | "item_subclass" | "armor" | "dps" | "stat";
type SortDirection = "asc" | "desc";

/**
 * Sort value for a row. `null` means "this row has no such value" and always
 * sorts last, in both directions — an item with no armor is not the *lightest*
 * item, it is an item the question does not apply to.
 */
function sortValue(item: ForeverItem, key: SortKey, statName: string): string | number | null {
  switch (key) {
    case "name": return item.name.toLowerCase();
    case "item_level": return item.item_level;
    case "required_level": return item.required_level;
    case "quality": return qualityRank(item.quality);
    case "inventory_type": return item.inventory_type?.toLowerCase() ?? null;
    case "item_subclass": return item.item_subclass?.toLowerCase() ?? null;
    case "armor": return item.armor ?? null;
    case "dps": return item.weapon?.dps ?? null;
    case "stat": return item.stats?.find((s) => s.stat === statName)?.value ?? null;
  }
}

function compareRows(a: ForeverItem, b: ForeverItem, key: SortKey, direction: SortDirection, statName: string): number {
  const left = sortValue(a, key, statName);
  const right = sortValue(b, key, statName);
  if (left === null && right === null) return a.id - b.id;
  if (left === null) return 1;
  if (right === null) return -1;
  let result = 0;
  if (typeof left === "number" && typeof right === "number") result = left - right;
  else result = String(left).localeCompare(String(right));
  if (result === 0) return a.id - b.id;
  return direction === "asc" ? result : -result;
}

function SortableHeader({
  label, columnKey, sortKey, direction, onSort,
}: {
  label: string;
  columnKey: SortKey;
  sortKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === columnKey;
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => onSort(columnKey)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSort(columnKey); } }}
      style={{ cursor: "pointer", userSelect: "none", color: active ? colors.textPrimary : undefined }}
    >
      {label}
      <span style={{ opacity: active ? 0.9 : 0.25, marginLeft: 4 }}>{active && direction === "desc" ? "▾" : "▴"}</span>
    </span>
  );
}

/**
 * A column before its header is wrapped for sorting.
 *
 * `ColumnDef.header` is typed `string`, but DataGrid renders it as children, so
 * an interactive header element is fine at runtime — this keeps the cast to a
 * single place instead of scattering it over every column.
 */
type RichColumn = Omit<ColumnDef<ForeverItem>, "key" | "header"> & { key: SortKey; header: string };

/* ── Row windowing ── */

/**
 * Fixed row height, so the window can be derived from `scrollTop` without
 * measuring 19k rows. It has to match what a row actually renders at: a
 * {@link ICON_SIZE} icon plus DataGrid's own 6px cell padding.
 */
const ROW_HEIGHT = ICON_SIZE + 14;
const OVERSCAN = 10;

/* ── Widget ── */

const ALL = "__all__";

export default function ForeverItemTable({ items, meta, title = "Forever Items", changedFields, savedState, saveState }: Props) {
  const rows = useMemo(() => items ?? [], [items]);

  const [query, setQuery] = useState(() => (savedState?.query as string) ?? "");
  const [qualities, setQualities] = useState<string[]>(() => (savedState?.qualities as string[]) ?? []);
  const [slots, setSlots] = useState<string[]>(() => (savedState?.slots as string[]) ?? []);
  const [statName, setStatName] = useState(() => (savedState?.statName as string) ?? ALL);
  const [sortKey, setSortKey] = useState<SortKey>(() => (savedState?.sortKey as SortKey) ?? "item_level");
  const [direction, setDirection] = useState<SortDirection>(() => (savedState?.sortDirection as SortDirection) ?? "desc");

  const handleSort = useCallback((key: SortKey) => {
    // First click on a new column sorts descending — the interesting end for
    // item level, armor and DPS — then toggles.
    setSortKey((previousKey) => {
      setDirection((previousDirection) => (previousKey === key ? (previousDirection === "asc" ? "desc" : "asc") : "desc"));
      return key;
    });
  }, []);

  useEffect(() => {
    saveState?.({ query, qualities, slots, statName, sortKey, sortDirection: direction });
  }, [query, qualities, slots, statName, sortKey, direction, saveState]);

  /* Facets, counted off the data rather than assumed. */
  const qualityOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of rows) if (item.quality) counts.set(item.quality, (counts.get(item.quality) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => qualityRank(a[0]) - qualityRank(b[0]))
      .map(([value, count]) => ({ value, label: value, count }));
  }, [rows]);

  const slotOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of rows) if (item.inventory_type) counts.set(item.inventory_type, (counts.get(item.inventory_type) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, label: value, count }));
  }, [rows]);

  const statOptions = useMemo(() => {
    const names = new Set<string>();
    for (const item of rows) for (const stat of item.stats ?? []) if (stat.stat) names.add(stat.stat);
    return [{ value: ALL, label: "Stat column…" }, ...[...names].sort().map((n) => ({ value: n, label: n }))];
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const qualitySet = new Set(qualities);
    const slotSet = new Set(slots);
    const filtered = rows.filter((item) => {
      if (needle && !item.name.toLowerCase().includes(needle)) return false;
      if (qualitySet.size > 0 && (!item.quality || !qualitySet.has(item.quality))) return false;
      if (slotSet.size > 0 && (!item.inventory_type || !slotSet.has(item.inventory_type))) return false;
      return true;
    });
    return [...filtered].sort((a, b) => compareRows(a, b, sortKey, direction, statName));
  }, [rows, query, qualities, slots, sortKey, direction, statName]);

  /* Windowing: only the visible slice is handed to DataGrid. */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const measure = () => setViewportHeight(node.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // A filter or sort change invalidates the current scroll offset.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setScrollTop(0);
  }, [query, qualities, slots, sortKey, direction, statName]);

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const windowSize = Math.ceil((viewportHeight || 600) / ROW_HEIGHT) + OVERSCAN * 2;
  const end = Math.min(visible.length, start + windowSize);
  const windowed = useMemo(() => visible.slice(start, end), [visible, start, end]);

  const dropSourceNote = meta?.drop_sources_unknown;

  const columns = useMemo<ColumnDef<ForeverItem>[]>(() => {
    const defs: RichColumn[] = [
      {
        key: "name",
        header: "Item",
        width: "minmax(220px, 1fr)",
        render: (item) => <NameCell item={item} dropSourceNote={dropSourceNote} />,
      },
      { key: "item_level", header: "ilvl", width: "64px", align: "right", render: (i) => i.item_level || "—" },
      { key: "required_level", header: "Req", width: "56px", align: "right", render: (i) => i.required_level || "—" },
      { key: "quality", header: "Quality", width: "96px", render: (i) => i.quality ?? "—" },
      { key: "inventory_type", header: "Slot", width: "120px", render: (i) => i.inventory_type ?? "—" },
      { key: "item_subclass", header: "Type", width: "120px", render: (i) => i.item_subclass ?? i.item_class ?? "—" },
      {
        key: "armor",
        header: "Armor",
        width: "72px",
        align: "right",
        // A dash is "this item has no armor", not "zero armor".
        render: (i) => (i.armor != null ? i.armor : <span style={{ color: colors.textDisabled }}>—</span>),
      },
      {
        key: "dps",
        header: "DPS",
        width: "72px",
        align: "right",
        render: (i) => (i.weapon ? i.weapon.dps.toFixed(1) : <span style={{ color: colors.textDisabled }}>—</span>),
      },
    ];
    if (statName !== ALL) {
      defs.push({
        key: "stat",
        header: statName,
        width: "110px",
        align: "right",
        render: (i) => {
          const stat = i.stats?.find((s) => s.stat === statName);
          if (!stat) return <span style={{ color: colors.textDisabled }}>—</span>;
          if (stat.value == null) return <span style={{ color: colors.textDisabled }} title={stat.unknown}>?</span>;
          return stat.value;
        },
      });
    }
    // Headers are interactive, so they are wrapped once the column list settles.
    return defs.map((def) => ({
      ...def,
      header: (
        <SortableHeader
          label={def.header}
          columnKey={def.key}
          sortKey={sortKey}
          direction={direction}
          onSort={handleSort}
        />
      ),
    })) as unknown as ColumnDef<ForeverItem>[];
  }, [statName, sortKey, direction, handleSort, dropSourceNote]);

  const hasData = rows.length > 0;

  return (
    <Stack style={{ height: "100%", overflow: "hidden" }}>
      {title && <SectionHeader>{title}</SectionHeader>}

      {!hasData ? (
        <EmptyState>
          No Forever item view loaded. Wire a data node over
          {" "}<code>forever/catalog/items-view.json</code> to the items prop
          {" "}(generate it with <code>bun run src/forever.ts --ingest</code>).
        </EmptyState>
      ) : (
        <div
          className={changedFields?.includes("items") ? "tome-changed" : undefined}
          style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}
        >
          {/* Filters */}
          <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 8, borderBottom: `1px solid ${colors.borderSecondary}` }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <TextInput
                  placeholder="Search item names…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div style={{ width: 170, flexShrink: 0 }}>
                <Select options={statOptions} value={statName} onChange={(e) => setStatName(e.target.value)} />
              </div>
            </div>
            <ChipGroup aria-label="Quality" options={qualityOptions} value={qualities} onChange={setQualities} />
            <div style={{ maxHeight: 62, overflowY: "auto" }}>
              <ChipGroup aria-label="Slot" options={slotOptions} value={slots} onChange={setSlots} />
            </div>
          </div>

          {/* Windowed grid */}
          <div
            ref={scrollRef}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            style={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative" }}
          >
            {visible.length === 0 ? (
              <EmptyState>No item matches these filters.</EmptyState>
            ) : (
              <>
                <div style={{ height: start * ROW_HEIGHT }} />
                <DataGrid
                  columns={columns}
                  rows={windowed}
                  rowKey={(item) => String(item.id)}
                  rowStyle={() => ({ height: ROW_HEIGHT, alignItems: "center" })}
                />
                <div style={{ height: (visible.length - end) * ROW_HEIGHT }} />
              </>
            )}
          </div>

          {/* Footer — counts, and the honesty note the catalogue ships with */}
          <div style={{ padding: "6px 12px", borderTop: `1px solid ${colors.borderSecondary}`, display: "flex", gap: 12, alignItems: "baseline" }}>
            <Text size="xs" color={colors.textSecondary}>
              {visible.length.toLocaleString()} of {rows.length.toLocaleString()} items
              {meta?.build ? ` · build ${meta.build}` : ""}
            </Text>
            {dropSourceNote && (
              <Text size="xs" color={colors.textDisabled} truncate title={dropSourceNote}>
                Drop sources: {dropSourceNote}
              </Text>
            )}
          </div>
        </div>
      )}
    </Stack>
  );
}

export const meta = {
  type: "forever-item-table",
  description: "Sortable, windowed browser over the Forever item catalogue with icons and full tooltips",
  ports: {
    inputs: [
      { prop: "items", label: "Items", type: "table" },
      { prop: "meta", label: "View Meta", type: "record" },
      { prop: "title", label: "Title", type: "string" },
    ],
  },
};
