// --- Armor type per class ---

const CLASS_ARMOR: Record<string, string> = {
  Warrior: "Plate",
  Paladin: "Plate",
  "Death Knight": "Plate",
  Hunter: "Mail",
  Shaman: "Mail",
  Evoker: "Mail",
  Rogue: "Leather",
  Monk: "Leather",
  "Demon Hunter": "Leather",
  Druid: "Leather",
  Mage: "Cloth",
  Warlock: "Cloth",
  Priest: "Cloth",
};

// --- Primary stats each class can use (across all specs) ---

const CLASS_PRIMARY_STATS: Record<string, Set<string>> = {
  Warrior:        new Set(["Strength"]),
  Paladin:        new Set(["Strength", "Intellect"]),
  "Death Knight": new Set(["Strength"]),
  Hunter:         new Set(["Agility"]),
  Shaman:         new Set(["Agility", "Intellect"]),
  Evoker:         new Set(["Intellect"]),
  Rogue:          new Set(["Agility"]),
  Monk:           new Set(["Agility", "Intellect"]),
  "Demon Hunter": new Set(["Agility"]),
  Druid:          new Set(["Agility", "Intellect"]),
  Mage:           new Set(["Intellect"]),
  Warlock:        new Set(["Intellect"]),
  Priest:         new Set(["Intellect"]),
};

// --- Weapon types each class can equip ---
// Keys are item_subclass names from the Blizzard API.

const CLASS_WEAPONS: Record<string, Set<string>> = {
  Warrior:        new Set(["Sword", "Mace", "Axe", "Dagger", "Fist Weapon", "Polearm", "Staff", "Bow", "Gun", "Crossbow"]),
  Paladin:        new Set(["Sword", "Mace", "Axe", "Polearm"]),
  "Death Knight": new Set(["Sword", "Mace", "Axe", "Polearm"]),
  Hunter:         new Set(["Sword", "Axe", "Dagger", "Fist Weapon", "Polearm", "Staff", "Bow", "Gun", "Crossbow"]),
  Shaman:         new Set(["Mace", "Axe", "Dagger", "Fist Weapon", "Staff"]),
  Evoker:         new Set(["Sword", "Mace", "Axe", "Dagger", "Fist Weapon", "Staff"]),
  Rogue:          new Set(["Sword", "Mace", "Axe", "Dagger", "Fist Weapon", "Bow", "Gun", "Crossbow"]),
  Monk:           new Set(["Sword", "Mace", "Axe", "Dagger", "Fist Weapon", "Polearm", "Staff"]),
  "Demon Hunter": new Set(["Sword", "Axe", "Dagger", "Fist Weapon", "Warglaives"]),
  Druid:          new Set(["Mace", "Dagger", "Fist Weapon", "Polearm", "Staff"]),
  Mage:           new Set(["Sword", "Dagger", "Staff", "Wand"]),
  Warlock:        new Set(["Sword", "Dagger", "Staff", "Wand"]),
  Priest:         new Set(["Mace", "Dagger", "Staff", "Wand"]),
};

// --- Spec → primary stat ---
// Every spec in the game mapped to its single primary stat.

const SPEC_PRIMARY_STAT: Record<string, Record<string, string>> = {
  Warrior:        { Arms: "Strength", Fury: "Strength", Protection: "Strength" },
  Paladin:        { Holy: "Intellect", Protection: "Strength", Retribution: "Strength" },
  "Death Knight": { Blood: "Strength", Frost: "Strength", Unholy: "Strength" },
  Hunter:         { "Beast Mastery": "Agility", Marksmanship: "Agility", Survival: "Agility" },
  Shaman:         { Elemental: "Intellect", Enhancement: "Agility", Restoration: "Intellect" },
  Evoker:         { Devastation: "Intellect", Preservation: "Intellect", Augmentation: "Intellect" },
  Rogue:          { Assassination: "Agility", Outlaw: "Agility", Subtlety: "Agility" },
  Monk:           { Brewmaster: "Agility", Mistweaver: "Intellect", Windwalker: "Agility" },
  "Demon Hunter": { Havoc: "Agility", Vengeance: "Agility" },
  Druid:          { Balance: "Intellect", Feral: "Agility", Guardian: "Agility", Restoration: "Intellect" },
  Mage:           { Arcane: "Intellect", Fire: "Intellect", Frost: "Intellect" },
  Warlock:        { Affliction: "Intellect", Demonology: "Intellect", Destruction: "Intellect" },
  Priest:         { Discipline: "Intellect", Holy: "Intellect", Shadow: "Intellect" },
};

// Spec name aliases for user input normalization
const SPEC_ALIASES: Record<string, string> = {
  bm: "Beast Mastery",
  "beast mastery": "Beast Mastery",
  beastmastery: "Beast Mastery",
  mm: "Marksmanship",
  marks: "Marksmanship",
  surv: "Survival",
  ele: "Elemental",
  enh: "Enhancement",
  enhance: "Enhancement",
  resto: "Restoration",
  rest: "Restoration",
  dev: "Devastation",
  pres: "Preservation",
  preserve: "Preservation",
  aug: "Augmentation",
  sin: "Assassination",
  assa: "Assassination",
  assassin: "Assassination",
  sub: "Subtlety",
  brew: "Brewmaster",
  mw: "Mistweaver",
  ww: "Windwalker",
  bear: "Guardian",
  cat: "Feral",
  boom: "Balance",
  boomkin: "Balance",
  boomy: "Balance",
  moonkin: "Balance",
  prot: "Protection",
  ret: "Retribution",
  disc: "Discipline",
  shadow: "Shadow",
  holy: "Holy",
  havoc: "Havoc",
  veng: "Vengeance",
  vdh: "Vengeance",
  blood: "Blood",
  frost: "Frost",
  unholy: "Unholy",
  fury: "Fury",
  arms: "Arms",
  fire: "Fire",
  arcane: "Arcane",
  demo: "Demonology",
  destro: "Destruction",
  aff: "Affliction",
  affl: "Affliction",
};

// --- Off-hand eligibility ---

const SHIELD_CLASSES = new Set(["Warrior", "Paladin", "Shaman"]);
const HELD_OFFHAND_CLASSES = new Set([
  "Mage", "Warlock", "Priest", "Druid", "Shaman", "Paladin", "Evoker", "Monk",
]);

// --- Universal slots (always potentially relevant regardless of armor type) ---

const UNIVERSAL_SLOTS = new Set([
  "Finger",
  "Trinket",
  "Neck",
  "Back",
]);

// --- Class name normalization ---

const CLASS_ALIASES: Record<string, string> = {
  dk: "Death Knight",
  "death knight": "Death Knight",
  deathknight: "Death Knight",
  dh: "Demon Hunter",
  "demon hunter": "Demon Hunter",
  demonhunter: "Demon Hunter",
};

// --- Exports ---

/** Normalize user input like "dk", "monk", "death knight" → canonical class name */
export function normalizeClass(input: string): string {
  const lower = input.toLowerCase();
  return CLASS_ALIASES[lower] ?? input.charAt(0).toUpperCase() + input.slice(1).toLowerCase();
}

/** Normalize user input like "ww", "brew", "resto" → canonical spec name */
export function normalizeSpec(input: string): string {
  const lower = input.toLowerCase();
  return SPEC_ALIASES[lower] ?? input.charAt(0).toUpperCase() + input.slice(1).toLowerCase();
}

/** Get the primary stat for a specific spec. Throws if class/spec combo is invalid. */
export function getSpecPrimaryStat(className: string, specName: string): string {
  const specs = SPEC_PRIMARY_STAT[className];
  if (!specs) throw new Error(`Unknown class: ${className}`);
  const stat = specs[specName];
  if (!stat) throw new Error(`Unknown spec "${specName}" for ${className}. Valid: ${Object.keys(specs).join(", ")}`);
  return stat;
}

export function getArmorType(className: string): string {
  const type = CLASS_ARMOR[className];
  if (!type) throw new Error(`Unknown class: ${className}`);
  return type;
}

export function isUniversalSlot(slot: string): boolean {
  return UNIVERSAL_SLOTS.has(slot);
}

export function getPrimaryStats(className: string): Set<string> {
  const stats = CLASS_PRIMARY_STATS[className];
  if (!stats) throw new Error(`Unknown class: ${className}`);
  return stats;
}

/**
 * Determine whether a specific item is relevant to a class (and optionally a spec).
 *
 * @param className  Normalized class name (e.g. "Monk")
 * @param item       Item metadata from the Blizzard API
 * @param options    Optional: tierTokenPrefixes (season map) and specName for narrower filtering
 */
export function isItemForClass(
  className: string,
  item: {
    itemClass: string;       // item_class.name  — "Armor", "Weapon", "Miscellaneous", etc.
    itemSubclass: string;    // item_subclass.name — "Leather", "Sword", "Junk", etc.
    slot: string;            // inventory_type.name — "Head", "Trinket", "Non-equippable", etc.
    stats: string[];         // primary stat names present on the item (e.g. ["Agility", "Intellect"])
    name: string;            // item name — used for tier token detection
  },
  tierTokenPrefixes?: Record<string, string>,
  specName?: string,
): boolean {
  const { itemClass, itemSubclass, slot, stats, name } = item;
  const armorType = getArmorType(className);
  // When a spec is provided, narrow to that spec's single primary stat
  const primaryStats = specName
    ? new Set([getSpecPrimaryStat(className, specName)])
    : getPrimaryStats(className);

  // --- Tier tokens (e.g. Nullcores) ---
  // Non-equippable Junk items with a season-specific prefix that maps to an armor type
  if (tierTokenPrefixes && slot === "Non-equippable" && itemSubclass === "Junk") {
    for (const [prefix, tokenArmorType] of Object.entries(tierTokenPrefixes)) {
      if (name.startsWith(prefix) && tokenArmorType === armorType) return true;
    }
    return false;
  }

  // --- Skip all other non-equippable items (decor, recipes, generic junk) ---
  if (slot === "Non-equippable") return false;

  // --- Armor pieces ---
  if (itemClass === "Armor") {
    // Universal slots: filter by primary stat
    if (UNIVERSAL_SLOTS.has(slot)) {
      return hasPrimaryStatOverlap(stats, primaryStats);
    }

    // Shield
    if (itemSubclass === "Shield") {
      return SHIELD_CLASSES.has(className);
    }

    // Held In Off-hand (caster off-hands)
    if (slot === "Held In Off-hand") {
      return HELD_OFFHAND_CLASSES.has(className) && hasPrimaryStatOverlap(stats, primaryStats);
    }

    // Regular armor — must match class armor type
    return itemSubclass === armorType;
  }

  // --- Weapons ---
  if (itemClass === "Weapon") {
    const weapons = CLASS_WEAPONS[className];
    if (!weapons) return false;
    return weapons.has(itemSubclass) && hasPrimaryStatOverlap(stats, primaryStats);
  }

  // --- Anything else (e.g. Miscellaneous class items) — skip ---
  return false;
}

/**
 * Check if an item's primary stats overlap with what the class can use.
 * Items with NO primary stats (only secondaries) are considered usable by anyone.
 */
function hasPrimaryStatOverlap(itemStats: string[], classPrimaryStats: Set<string>): boolean {
  const PRIMARY = new Set(["Agility", "Intellect", "Strength"]);
  const itemPrimary = itemStats.filter((s) => PRIMARY.has(s));
  // No primary stat on the item → usable by anyone (pure secondary stat items)
  if (itemPrimary.length === 0) return true;
  // At least one primary stat must match
  return itemPrimary.some((s) => classPrimaryStats.has(s));
}
