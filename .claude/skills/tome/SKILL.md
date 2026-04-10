---
name: tome-viewport
description: Control the Tome viewport — a visual display surface running in the browser. Use this skill when the user asks you to show, display, or visualize data, open files in the viewport, manage spaces, or query project files through the indexer.
---

# Tome Viewport

A browser-based viewport is running alongside Claude Code for this project. You can control what's displayed on screen by editing scene files and using a small set of `tome` CLI commands.

## When to Use This

- User says "show me", "display", "visualize", "put up", "pull up" → edit a space file (see below) or use `tome open`
- User wants to see a file visually → `tome open <path>`
- User asks what data files exist → `tome query files`
- User wants to switch context → `tome space switch <name>`
- You want to notify the user of something important → `tome notify`
- You've finished generating data and want to show it → edit `.tome/spaces/<name>.json` to lay out widgets around it

## Scene files are the API

Scenes live in `.tome/spaces/<name>.json` (one file per space). The server **watches the spaces directory** — when you write a file, the viewport reloads automatically. To build or modify a scene, edit the file directly. There is no "scene" CLI verb anymore.

The active space is whichever one is selected in `_meta.json`. Use `tome space list` to see what exists and `tome space switch <name>` to change focus.

## Scene file format

Each `.tome/spaces/<name>.json` looks like this:

```json
{
  "name": "Dev",
  "scene": {
    "root": {
      "direction": "h",
      "ratio": 0.25,
      "children": [
        {
          "id": "files-1",
          "type": "files",
          "props": { "root": "src", "search": true },
          "links": { "select": { "target": "editor-1", "prop": "file" } }
        },
        {
          "direction": "v",
          "ratio": 0.7,
          "children": [
            {
              "id": "editor-1",
              "type": "editor",
              "props": { "file": "src/index.ts" }
            },
            {
              "id": "table-1",
              "type": "table",
              "props": {}
            }
          ]
        }
      ]
    },
    "dataNodes": [
      {
        "id": "data-1",
        "expression": "'data/power.csv'",
        "filePath": "data/power.csv",
        "drillPath": "",
        "outputType": "table",
        "position": { "x": 100, "y": 100 },
        "links": { "output": { "target": "table-1", "prop": "data" } }
      }
    ]
  }
}
```

### Type reference

```ts
interface Scene {
  root: TreeNode;
  dataNodes?: DataNode[];
}

type TreeNode = WidgetInstance | SplitNode;

interface WidgetInstance {
  id: string;                          // unique within the scene
  type: string;                        // e.g. "editor", "files", "table"
  props: Record<string, unknown>;
  links?: Record<string, LinkTarget | LinkTarget[]>;
}

interface SplitNode {
  direction: "h" | "v";                // horizontal or vertical split
  ratio: number;                       // strictly between 0 and 1
  children: [TreeNode, TreeNode];      // exactly two children
}

interface DataNode {
  id: string;
  expression: string;                  // human-readable, e.g. "'power.csv'.amps"
  sourceType?: "file" | "tool";        // default "file"
  filePath: string;                    // empty for tool nodes
  drillPath: string;                   // e.g. "amps" or "" for whole file
  outputType: "string" | "number" | "boolean" | "datetime"
            | "file-path" | "record" | "list" | "table";
  position: { x: number; y: number };
  links?: Record<string, LinkTarget | LinkTarget[]>;
  // Tool-source fields:
  toolName?: string;
  toolCommand?: string;
  toolArgs?: string;                   // e.g. "--realm=turalyon--name=treepunch"
}

interface LinkTarget { target: string; prop: string; }
```

### Rules and gotchas

- **BSP tree:** every split has exactly two children. Use nested splits to build grids.
- **Ratios** must be strictly between 0 and 1.
- **`dataNodes`** are the only way to wire file or tool data into widget props. Their `links` connect a data-node output (typically `"output"`) to a widget input prop. The legacy `$bind` syntax has been removed.
- **Widget IDs** must be unique within a scene. Link targets reference these IDs.
- **Persistence:** the server saves to disk on its own (debounced). After your write, the viewport will reload within ~200ms.

## Validating your work

After editing **any** custom artifact in `.tome/` (spaces, widgets, tools, commands), run:

```bash
tome validate                  # validate everything
tome validate spaces           # only space files
tome validate widgets          # only custom widgets
tome validate tools            # only tool configs
tome validate commands         # only the commands button file
tome validate spaces dev       # validate one specific artifact
```

Exit code is `0` if everything is well-formed and `1` if anything is broken. Errors include the file path, the field path inside the JSON, and what was wrong, e.g.:

```
spaces:
  FAIL  dev                       .tome/spaces/dev.json
        - Invalid input — expected at least 0.001 at scene.root.ratio
```

If you write an invalid scene file, the server logs a warning, sends a toast to the viewport, and **leaves the previous good state in place** — your edit is rejected, not applied. Run `tome validate spaces` to see the same error and fix it.

## Quick CLI reference

```bash
# Operational
tome status                                  # Is the server up?
tome open <path> [--readonly]                # Open a file in the editor widget
tome clear                                   # Reset the active scene
tome notify "<title>" --severity info|warning|error|success

# Spaces (containers for scenes)
tome space list                              # List all spaces (active marked with *)
tome space switch <name|index>               # Switch active space
tome space create "<name>"                   # Create a new (empty) space — does NOT switch to it
tome space delete "<name>"

# Validation
tome validate [spaces|widgets|tools|commands] [<name>]

# Query the indexer
tome query files [--type csv]
tome query data <file> [--path "<jpath>"]
tome query search "<text>" --in <dir>
tome query schema <file>
tome query tail <file> [--lines N]

# Custom widgets
tome widgets                                 # List available widget types
tome widgets create <name>                   # Scaffold a new custom widget
tome widgets refresh                         # Rebuild and validate (delegates to validator + builder)
```

## Tips

- **Edit `.tome/spaces/<name>.json` directly** to build a scene. The server watches the file and reloads the viewport automatically. Run `tome validate spaces` after to confirm.
- **`tome space create` does not auto-switch.** This is deliberate so a script can create a scratch space without clobbering the user's current view. If you want to make it active, follow up with `tome space switch`.
- After creating/modifying data files, the viewport updates automatically (file watcher).
- Use `tome notify` for transient alerts; build/edit a space scene for persistent displays.
- The viewport has a chat widget — the user might be talking to you through it.
- The `editor` widget auto-detects `.md` files and shows a rendered preview. Users can press Cmd+E to toggle edit mode.

## Widget Types Available

Run `tome widgets` to see the full list. Core types:

- `stat` — single metric card (label, value, trend)
- `chart` — line/bar/area/scatter chart
- `table` — sortable data table
- `markdown` — rendered markdown
- `editor` — Monaco code editor (with git integration)
- `files` — scoped file browser tree
- `chat` — conversation panel or popover
- `code` — syntax-highlighted code block
- `terminal` — scrolling log output
- `image` — image with caption
- `json` — collapsible JSON tree viewer
- `timeline` — ordered event timeline
- `progress` — progress bar
- `alert` — notification card

Run `tome widgets` to see the full list including any custom widgets.

## CLI Tool Data Sources

Beyond project files, the viewport can use **CLI tools** as data sources for widgets. A tool is any command that emits JSON on stdout. Once registered, it shows up in the data node search popup with an `@` prefix and can be wired into widgets the same way a CSV or JSON file would be.

After creating a tool config, run `tome validate tools` to confirm the JSON shape is right.

### When to register a tool

- The user wants a widget driven by live data from an API, shell command, or script
- The user wants something that file-based data nodes can't provide (auth, query params, dynamic results)
- The user explicitly says "register a tool", "add a tool", "wire up `<command>` as a data source"

### How to register a tool

Tool configs live in `.tome/tools/` — **one JSON file per tool**. Create `.tome/tools/<tool-name>.json`:

```json
{
  "name": "weather",
  "path": "/abs/path/to/weather-tool",
  "runner": "./run",
  "description": "Local weather data",
  "refreshInterval": 60000,
  "commands": [
    {
      "name": "current",
      "file": "src/current.ts",
      "description": "Current conditions",
      "flags": [
        { "name": "--city", "required": true, "description": "City name" },
        { "name": "--units", "description": "metric or imperial", "default": "metric" }
      ]
    }
  ]
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Short identifier — appears as `@<name>` in the data node popup |
| `path` | yes | Absolute working directory the runner is invoked from |
| `runner` | yes | Command that takes `<file> <args...>` (e.g. `./run`, `bun run`, `python`, `node`) |
| `commands[]` | yes | Subcommands the tool exposes |
| `commands[].file` | yes | Script passed to the runner, relative to `path` |
| `commands[].flags[]` | no | Declared flags surfaced in the data node search popup |
| `refreshInterval` | no | TTL in ms for cached output (`0` = no cache). Per-command overrides per-tool |
| `description` | no | Shown in the data node popup |

### Requirements for the tool itself

- **Must print JSON to stdout.** Anything else is rejected as "invalid JSON".
- **Exit code 0 on success.** Non-zero exits surface as errors in the popup.
- **Should be reasonably fast.** There is a 15s execution timeout per call.
- Errors and logs should go to **stderr**, not stdout.

### After creating the file

The server watches `.tome/tools/` and hot-reloads on add/edit/remove — no restart needed. Run `tome validate tools` to confirm the file parses, then notify the user that the tool is ready and tell them to:

1. Press `L` to enter link mode
2. Press `N` to open the data node search popup
3. Type `@<tool-name>` to find it, pick a command, fill in flags, and drill into the JSON

If you want to confirm the tool runs, you can call its runner directly from the shell (it's just a normal command).

## Custom Widgets

Custom widgets live in `.tome/widgets/`. They automatically inherit the app's theme via CSS variables. After editing a widget, run `tome validate widgets` to surface schema and build errors. `tome widgets refresh` does the same and additionally rebuilds the cached transpile.

### Creating a Custom Widget

```bash
tome widgets create <name>        # Scaffold a new widget from template
```

Or create manually in `.tome/widgets/`:

```tsx
// .tome/widgets/ActivityLog.tsx
import React, { useState, useMemo } from "react";

interface LogEntry {
  type: string;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

interface Props {
  entries?: LogEntry[];
  title?: string;
  changedFields?: string[];
  emit: (action: string, payload: unknown) => void;
  savedState?: Record<string, unknown>;
  saveState?: (patch: Record<string, unknown>) => void;
}

export default function ActivityLog({ entries = [], title = "Activity", changedFields, emit, savedState, saveState }: Props) {
  const [filter, setFilter] = useState((savedState?.filter as string) || "all");

  const types = useMemo(() => [...new Set(entries.map(e => e.type))], [entries]);
  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    return entries.filter(e => e.type === filter);
  }, [entries, filter]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--tome-bg-primary)" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--tome-border-primary)", display: "flex", gap: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--tome-text-primary)", marginRight: 8 }}>{title}</span>
        {["all", ...types].map(t => (
          <button key={t} onClick={() => { setFilter(t); saveState?.({ filter: t }); }}
            style={{
              padding: "2px 8px", borderRadius: 10, fontSize: 11, cursor: "pointer", border: "1px solid var(--tome-border-secondary)",
              background: filter === t ? "var(--tome-interactive-focus)" : "transparent",
              color: filter === t ? "var(--tome-text-white)" : "var(--tome-text-secondary)",
            }}>{t}</button>
        ))}
      </div>
      <div className={changedFields?.includes("entries") ? "tome-changed" : undefined} style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }}>
        {filtered.map((e, i) => (
          <div key={i} onClick={() => emit("select", e)}
            style={{ padding: "6px 10px", marginBottom: 2, borderRadius: 6, cursor: "pointer", borderLeft: "3px solid var(--tome-chart-1)" }}>
            <div style={{ fontSize: 13, color: "var(--tome-text-primary)" }}>{e.message}</div>
            <div style={{ fontSize: 11, color: "var(--tome-text-secondary)" }}>{new Date(e.timestamp).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const meta = {
  type: "activity-log",
  description: "Filterable activity log from JSON data",
  ports: {
    inputs: [
      { prop: "entries", label: "Log Entries", type: "table" },
      { prop: "title", label: "Title", type: "string" },
    ],
    outputs: [
      { action: "select", label: "Selected Entry", type: "record" },
    ],
  },
};
```

### Widget Contract

- **Default export**: React function component. Receives all props from the scene definition plus `emit`, `savedState`, `saveState`, `changedFields`.
- **Named export `meta`**: `{ type: string, description: string, ports?: {...} }`. Type must be kebab-case and not conflict with built-in types. **`type` must be the first property in the meta object** (the server validates via regex).
- **Available imports**: `react` only (all hooks: useState, useEffect, useCallback, useMemo, useRef, etc.). No npm packages.
- **Styling**: Use inline styles with CSS variables (see Theme Variables below). The widget fills its container (`height: 100%`).
- **Emitting actions**: Call `emit("action-name", payload)` to trigger widget links.
- **Persisting state**: Call `saveState({ key: value })`. Read from `savedState`.
- **Change signals**: `changedFields` is an array of prop names that just updated via links (auto-clears after 1.5s). Apply the `tome-changed` CSS class to flash elements: `className={changedFields?.includes("value") ? "tome-changed" : ""}`.

### Theme Variables

Custom widgets inherit CSS variables from the Tome theme. Always use these instead of hardcoded colors:

**Backgrounds:** `var(--tome-bg-primary)`, `var(--tome-bg-secondary)`, `var(--tome-bg-tertiary)`, `var(--tome-bg-input)`
**Text:** `var(--tome-text-primary)`, `var(--tome-text-secondary)`, `var(--tome-text-disabled)`, `var(--tome-text-white)`
**Borders:** `var(--tome-border-primary)`, `var(--tome-border-secondary)`
**Status:** `var(--tome-status-success)`, `var(--tome-status-error)`, `var(--tome-status-warning)`, `var(--tome-status-info)`
**Interactive:** `var(--tome-interactive-focus)`, `var(--tome-interactive-primary)`, `var(--tome-interactive-danger)`
**Chart palette:** `var(--tome-chart-1)` through `var(--tome-chart-8)`

All variables follow the convention `--tome-{category}-{name}`.

### Workflow

1. Run `tome widgets create <name>` to scaffold a new widget
2. Edit the generated `.tsx` file in `.tome/widgets/`
3. Run `tome validate widgets` (or `tome widgets refresh`) to catch errors
4. Fix any errors reported, then re-run
5. Add the widget to a scene by editing `.tome/spaces/<name>.json` and adding a `WidgetInstance` with `type: "<your-meta.type>"`
