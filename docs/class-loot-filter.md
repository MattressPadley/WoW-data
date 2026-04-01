# Class & Spec Loot Filtering

The loot filter system determines which items from raid and dungeon loot tables are relevant to a given class and optionally a specific spec. It lives in `src/lib/class-meta.ts` and is used by `raid-journal.ts`, `dungeon-loot.ts`, and `upgrades.ts`.

## How it works

All filtering goes through a single function: `isItemForClass(className, item, tierTokenPrefixes?, specName?)`. It evaluates each item against a layered set of rules based on item category.

### Filter pipeline

```
Item from API
  │
  ├─ Non-equippable + Junk?
  │    ├─ Name matches a tier token prefix for this class's armor type? → KEEP
  │    └─ Otherwise → SKIP (decor, recipes, generic junk)
  │
  ├─ Non-equippable (any other type)? → SKIP
  │
  ├─ Armor?
  │    ├─ Universal slot (Trinket/Ring/Neck/Back)? → Check primary stat overlap
  │    ├─ Shield? → Only Warrior, Paladin, Shaman
  │    ├─ Held In Off-hand? → Only caster-capable classes + check primary stat
  │    └─ Regular armor? → Must match class armor type (Plate/Mail/Leather/Cloth)
  │
  ├─ Weapon? → Must be in class weapon allowlist + check primary stat overlap
  │
  └─ Anything else → SKIP
```

### Primary stat overlap

The stat check (`hasPrimaryStatOverlap`) is the core of smart filtering:

1. Extract primary stats from the item (Agility, Intellect, Strength)
2. If the item has **no primary stats** (only secondaries like Haste, Crit) → passes for everyone
3. If the item has primary stats → at least one must match what the class/spec uses

This handles:
- Dual-stat armor (e.g. `Intellect/Agility` leather) → passes for both Int and Agi specs
- Fixed-stat trinkets (e.g. `Intellect` only) → only passes for Int-using classes
- Secondary-only trinkets (e.g. `Haste` only) → passes for everyone

### Class-level vs spec-level

- **Class-level** (`--class monk`): Uses the union of all the class's specs' primary stats. Monk = {Agility, Intellect}, so both WW and MW items show up.
- **Spec-level** (`--class monk --spec ww`): Narrows to Windwalker's single stat = {Agility}. Int-only weapons and trinkets are filtered out.

## Data tables

### Armor types

| Class | Armor |
|-------|-------|
| Warrior, Paladin, Death Knight | Plate |
| Hunter, Shaman, Evoker | Mail |
| Rogue, Monk, Demon Hunter, Druid | Leather |
| Mage, Warlock, Priest | Cloth |

### Primary stats by class

| Class | Primary Stats | Notes |
|-------|--------------|-------|
| Warrior | Str | All specs |
| Paladin | Str, Int | Holy=Int, Prot/Ret=Str |
| Death Knight | Str | All specs |
| Hunter | Agi | All specs |
| Shaman | Agi, Int | Enh=Agi, Ele/Resto=Int |
| Evoker | Int | All specs |
| Rogue | Agi | All specs |
| Monk | Agi, Int | BM/WW=Agi, MW=Int |
| Demon Hunter | Agi | All specs |
| Druid | Agi, Int | Feral/Guardian=Agi, Balance/Resto=Int |
| Mage | Int | All specs |
| Warlock | Int | All specs |
| Priest | Int | All specs |

### Spec primary stats

| Class | Spec | Stat |
|-------|------|------|
| Warrior | Arms, Fury, Protection | Strength |
| Paladin | Holy | Intellect |
| Paladin | Protection, Retribution | Strength |
| Death Knight | Blood, Frost, Unholy | Strength |
| Hunter | Beast Mastery, Marksmanship, Survival | Agility |
| Shaman | Elemental, Restoration | Intellect |
| Shaman | Enhancement | Agility |
| Evoker | Devastation, Preservation, Augmentation | Intellect |
| Rogue | Assassination, Outlaw, Subtlety | Agility |
| Monk | Brewmaster, Windwalker | Agility |
| Monk | Mistweaver | Intellect |
| Demon Hunter | Havoc, Vengeance | Agility |
| Druid | Feral, Guardian | Agility |
| Druid | Balance, Restoration | Intellect |
| Mage | Arcane, Fire, Frost | Intellect |
| Warlock | Affliction, Demonology, Destruction | Intellect |
| Priest | Discipline, Holy, Shadow | Intellect |

### Weapon types by class

| Class | Weapons |
|-------|---------|
| Warrior | Sword, Mace, Axe, Dagger, Fist Weapon, Polearm, Staff, Bow, Gun, Crossbow |
| Paladin | Sword, Mace, Axe, Polearm |
| Death Knight | Sword, Mace, Axe, Polearm |
| Hunter | Sword, Axe, Dagger, Fist Weapon, Polearm, Staff, Bow, Gun, Crossbow |
| Shaman | Mace, Axe, Dagger, Fist Weapon, Staff |
| Evoker | Sword, Mace, Axe, Dagger, Fist Weapon, Staff |
| Rogue | Sword, Mace, Axe, Dagger, Fist Weapon, Bow, Gun, Crossbow |
| Monk | Sword, Mace, Axe, Dagger, Fist Weapon, Polearm, Staff |
| Demon Hunter | Sword, Axe, Dagger, Fist Weapon, Warglaives |
| Druid | Mace, Dagger, Fist Weapon, Polearm, Staff |
| Mage | Sword, Dagger, Staff, Wand |
| Warlock | Sword, Dagger, Staff, Wand |
| Priest | Mace, Dagger, Staff, Wand |

### Off-hand eligibility

| Type | Classes |
|------|---------|
| Shield | Warrior, Paladin, Shaman |
| Held In Off-hand | Mage, Warlock, Priest, Druid, Shaman, Paladin, Evoker, Monk |

### Universal slots

Trinket, Finger (Ring), Neck, and Back (Cloak) are considered universal — any class can equip them. They are filtered by primary stat instead of armor type.

## Input normalization

### Class aliases

| Input | Normalized |
|-------|-----------|
| `dk` | Death Knight |
| `dh` | Demon Hunter |

All other class names are auto-capitalized (e.g. `monk` → `Monk`).

### Spec aliases

| Alias | Spec | Alias | Spec |
|-------|------|-------|------|
| `bm` | Beast Mastery | `brew` | Brewmaster |
| `mm`, `marks` | Marksmanship | `mw` | Mistweaver |
| `surv` | Survival | `ww` | Windwalker |
| `ele` | Elemental | `boom`, `boomkin`, `boomy`, `moonkin` | Balance |
| `enh`, `enhance` | Enhancement | `bear` | Guardian |
| `resto`, `rest` | Restoration | `cat` | Feral |
| `dev` | Devastation | `prot` | Protection |
| `pres`, `preserve` | Preservation | `ret` | Retribution |
| `aug` | Augmentation | `disc` | Discipline |
| `sin`, `assa`, `assassin` | Assassination | `veng`, `vdh` | Vengeance |
| `sub` | Subtlety | `aff`, `affl` | Affliction |
| `demo` | Demonology | `destro` | Destruction |

All other spec names are auto-capitalized.

## CLI usage

All three loot tools support `--class` and `--spec`:

```bash
# Class-level (all specs)
./run src/raid-journal.ts --raid-id 1307 --loot --class monk --difficulty normal

# Spec-level (single primary stat)
./run src/raid-journal.ts --raid-id 1307 --loot --class monk --spec ww --difficulty heroic

# Dungeon loot
./run src/dungeon-loot.ts --class shaman --spec resto

# Upgrades
./run src/upgrades.ts --realm turalyon --name treepunch --spec ww
```

`--spec` requires `--class` (or a character lookup that provides the class). Without `--spec`, filtering uses the class-level primary stat union.

## Tier token filtering

Tier tokens (e.g. Nullcores, Riftblooms) are non-equippable Junk items that convert into tier set pieces for your class. They follow a prefix → armor type pattern defined per season in `season.yaml`:

```yaml
tier_token_prefixes:
  Voidforged: Plate      # DK, Paladin, Warrior
  Voidcast: Mail          # Evoker, Hunter, Shaman
  Voidcured: Leather      # DH, Druid, Monk, Rogue
  Voidwoven: Cloth        # Mage, Priest, Warlock
  Alnforged: Plate        # (Dreamrift variants)
  Alncast: Mail
  Alncured: Leather
  Alnwoven: Cloth
```

The filter matches the token's name prefix against the class's armor type. Without this config, tokens are treated as generic junk and filtered out.

The token's `effects` field contains the gear slot it creates (e.g. "Synthesize a soulbound set **chest** item appropriate for your class").

### Adding tokens for a new season

Add the new prefixes to the season's `season.yaml` under `tier_token_prefixes`. The prefix is the first word of the token name, and the value is the armor type it corresponds to. Each raid in the season may use different token names (e.g. Voidspire uses "Void-" prefixes, Dreamrift uses "Aln-" prefixes) — add all variants.
