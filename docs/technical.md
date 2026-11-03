# Technical guide

## Layout

| Path | What |
|---|---|
| `config/*.yaml` | your settings (git-ignored); `*.example.yaml` are the templates |
| `schema/*.schema.json` | JSON Schema for each config file — field descriptions double as docs |
| `presets/sources/` | ready-made source lists |
| `.claude/agents/pocscout-*.md` | scanner, judge, reporter, builder |
| `.claude/commands/poc-*.md` | slash commands |
| `.claude/settings.json` | project permissions for interactive sessions |
| `scripts/lib/config.mjs` | the only code that reads/writes config |
| `scripts/config.mjs` | CLI: `init`, `validate`, `get`, `set`, `patch`, `preset` |
| `scripts/ids.mjs` | idea ids and dedup (`state/seen.json`) |
| `scripts/run_scan.sh` | headless runs (scheduler + UI buttons) |
| `scripts/schedule.sh` | install / uninstall / status of the schedule |

Runtime output (all git-ignored): `state/` (inbox, seen ids, verification results), `runs/<tag>-{summary,rejected,judged,tools-suggested}`, `reports/<tag>/`, `reports/INDEX.md`, `logs/`, `builds/`.

## Config CLI

```bash
node scripts/config.mjs validate                   # all files
node scripts/config.mjs get run schedule.hour      # one value
node scripts/config.mjs patch rubric changes.json  # deep-merge JSON, keep comments
node scripts/config.mjs preset eu-deep-tech        # add a source preset
```

## Models and budget

`config/run.yaml → models` sets the model per agent (sonnet / opus / haiku); `/poc-scan` passes it when starting each agent. `budget_usd` becomes `--max-budget-usd`. Claude Code has no max-turns flag in headless mode — the budget is the cap.

On a subscription the reported cost is notional, but the cap is still enforced. Your personal plugins and MCP servers make every call more expensive; `isolate: true` (default) runs scans with `--setting-sources project --strict-mcp-config` to avoid that.

## Permissions of headless runs

```bash
scripts/run_scan.sh --describe scan     # JSON: prompt, budget, permission mode, allowed tools
```

If an agent needs another tool, add it to `TOOLS` in `scripts/run_scan.sh` — keep it as narrow as possible (e.g. `Bash(node scripts/x.mjs *)`, not `Bash`). Denied calls are listed in the log (`permission_denials`).

## Global install

`node scripts/setup-technical.mjs` → last question copies agents and commands to `~/.claude/` (never overwriting). Commands still need to run from the repo folder, because `config/` and `scripts/` are relative to it.

## Custom score axes

```yaml
# config/profile.yaml
custom_axes:
  - name: thesis_potential
    question: Could this be a master's thesis topic (novelty, measurable result, open data)?
    enabled: true
    affects_selection: false   # info only
```

The judge scores each enabled axis 1–5 with a quote, the reporter shows it in the front matter.
