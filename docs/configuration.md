# Configuration reference

Each file in `config/` has a schema in `schema/` (the descriptions there are the source of truth; this page is a summary). Check everything with `node scripts/config.mjs validate`.

## profile.yaml

| Field | Meaning |
|---|---|
| `report_language` | language code for reports (`en`, `uk`, …) |
| `interests.priority` | areas you want most; empty = anything not excluded |
| `interests.excluded` | areas rejected by the `excluded-area` rule |
| `interests.exceptions` | narrow topics allowed despite an exclusion |
| `custom_axes[]` | your own 1–5 scores: `name`, `question`, `enabled`, `affects_selection` |

## sources.yaml

`sources[]`: `id`, `name`, `url`, `access` (rss/html/pdf), `enabled`, plus what verification fills in: `status` (recommended / unverified / stale / manual), `last_verified`, `last_seen_update` (never a future date), `date_source`, `update_frequency`, `notes`.

## tools.yaml

`tools[]`: `name`, `domain`, `control` (how code drives it), `installed` (set by `scripts/detect-tools.mjs`), `detect` (`commands`, `paths`), `install_cmd` (`macos`, `linux`), `can_simulate`.

## rubric.yaml

| Field | Meaning |
|---|---|
| `tool_first` | `suggest` (default): keep ideas, list tools to install · `strict`: reject when a key tool is missing |
| `max_poc_days` | longer estimates are rejected |
| `no_go[]` | `id`, `text`, `enabled` — one match rejects; defaults: `hardware-no-sim`, `closed-data`, `too-long`, `gui-only`, `excluded-area` |
| `scores.<name>` | `question`, `weight` (0 = off) |
| `selection.top_n` | full reports per run |
| `selection.min_sum` | minimum weighted total |

## run.yaml

| Field | Meaning |
|---|---|
| `schedule` | `enabled`, `frequency` (monthly/weekly), `day_of_month` (1–28), `weekday` (0 = Sunday), `hour`, `minute` |
| `budget_usd` | `--max-budget-usd` per scan |
| `notify` | desktop notification after scheduled scans |
| `isolate` | run without personal plugins/MCP servers |
| `models` | `scanner`, `judge`, `reporter`, `builder`: sonnet / opus / haiku |
