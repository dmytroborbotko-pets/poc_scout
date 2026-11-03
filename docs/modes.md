# Setup modes

There is one configuration — the YAML files in `config/` — and three ways to edit it. The mode you pick in `./setup.sh` only decides which questions you get first; it never locks you in.

| | Technical | Technical but quick | Non-technical |
|---|---|---|---|
| Start | `./setup.sh` → 1 | `./setup.sh` → 2 | `./setup.sh` → 3 |
| Same thing later | `node scripts/setup-technical.mjs` or edit files | `claude "/poc-setup"` | `npm run ui` |
| Edits | `config/*.yaml`, `.claude/agents/`, `.claude/commands/` | `config/*.yaml` | `config/*.yaml` |
| Questions | everything: interests, custom scores, every no-go rule, weights, models, budget, isolation, schedule, global install | the essentials, plus Claude searches and verifies sources for you | none — defaults from the `general-startups` preset |

## Why switching is safe

- Every write — UI, CLI questions, Claude — goes through `scripts/lib/config.mjs`, which validates against `schema/` and updates the YAML **node by node**. Comments, blank lines and fields the tools don't know about stay where you put them.
- The UI remembers the version of each file it loaded. If you edit a file by hand while the UI is open, the UI refuses to overwrite it and asks you to reload.
- Before saving, the UI shows a line-by-line diff of what will change.
- `tests/roundtrip.test.mjs` checks all of this on every change (CI).

## Typical paths

- *Non-technical → more control*: open `config/rubric.yaml` in any editor; your UI settings are there with comments explaining each field.
- *Technical → quick review*: `npm run ui` shows the same settings with plain-language hints, plus report browsing.
- *Anyone → better sources*: `claude "/poc-setup"` only to redo the sources block, or `claude "/poc-verify-sources https://…"` for a single URL.
