# CLI Reference

All tools are run via `./run src/<tool>.ts [flags]`. Output is JSON by default.

## Global Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--region` | API region (us, eu, kr, tw) | `us` |
| `--pretty` | Pretty-print JSON output | off |

---

## search.ts — Search items by name

```bash
./run src/search.ts --name "Spark" [--limit 100] [--page 1] [--pretty]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--name` | Yes | Item name to search for |
| `--limit` | No | Results per page (default: 100) |
| `--page` | No | Page number (default: 1) |

---

## item.ts — Get item data

```bash
./run src/item.ts --id 190453 [--pretty]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--id` | Yes | Item ID |

---

## item-media.ts — Get item icon/media

```bash
./run src/item-media.ts --id 190453 [--pretty]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--id` | Yes | Item ID |

---

## professions.ts — Professions index or detail

```bash
./run src/professions.ts [--pretty]                    # list all
./run src/professions.ts --id 164 [--pretty]           # get one
./run src/professions.ts --id 164 --media [--pretty]   # get media
```

| Flag | Required | Description |
|------|----------|-------------|
| `--id` | No | Profession ID (omit for index) |
| `--media` | No | Get media instead of details (requires --id) |

---

## profession-tier.ts — Profession skill tier

```bash
./run src/profession-tier.ts --profession 164 --tier 2871 [--pretty]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--profession` | Yes | Profession ID |
| `--tier` | Yes | Skill tier ID |

---

## recipe.ts — Recipe details

```bash
./run src/recipe.ts --id 12345 [--pretty]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--id` | Yes | Recipe ID |

---

## recipe-media.ts — Recipe icon/media

```bash
./run src/recipe-media.ts --id 12345 [--pretty]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--id` | Yes | Recipe ID |

---

## item-class.ts — Item classes and subclasses

```bash
./run src/item-class.ts [--pretty]                        # list all classes
./run src/item-class.ts --id 2 [--pretty]                 # get class
./run src/item-class.ts --id 2 --subclass 5 [--pretty]    # get subclass
```

| Flag | Required | Description |
|------|----------|-------------|
| `--id` | No | Item class ID (omit for index) |
| `--subclass` | No | Item subclass ID (requires --id) |

---

## item-set.ts — Item sets

```bash
./run src/item-set.ts [--pretty]           # list all sets
./run src/item-set.ts --id 1 [--pretty]    # get specific set
```

| Flag | Required | Description |
|------|----------|-------------|
| `--id` | No | Item set ID (omit for index) |

---

## commodities.ts — Auction house commodities

```bash
./run src/commodities.ts [--pretty]
```

Returns all commodity auction data. This is a large response.

---

## crafting.ts — Modified crafting system

```bash
./run src/crafting.ts [--pretty]                        # crafting index
./run src/crafting.ts --categories [--pretty]            # list categories
./run src/crafting.ts --category-id 1 [--pretty]         # get category
./run src/crafting.ts --slot-types [--pretty]             # list slot types
./run src/crafting.ts --slot-type-id 1 [--pretty]        # get slot type
```

| Flag | Required | Description |
|------|----------|-------------|
| `--categories` | No | List all crafting categories |
| `--category-id` | No | Get specific category |
| `--slot-types` | No | List all reagent slot types |
| `--slot-type-id` | No | Get specific slot type |

---

## oauth.ts — Token refresh

```bash
./run src/oauth.ts
```

Starts an HTTP server on port 8000. Visit `http://localhost:8000/auth` to initiate the OAuth flow. The new access token is printed to stdout on success.
