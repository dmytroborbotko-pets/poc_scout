# Troubleshooting

| Symptom | Fix |
|---|---|
| `setup.sh`: "Claude Code is not logged in" | run `claude` once and log in |
| Scheduled run did nothing | `scripts/schedule.sh status`, then read `logs/<date>.log` |
| Log says `subtype: error_max_budget_usd` | raise `budget_usd` in `config/run.yaml`; keep `isolate: true` |
| Log lists `denied: …` | an agent tried a tool outside the allowed list; see `docs/technical.md` → permissions |
| UI: "changed on disk since you opened it" | someone (or you) edited the file by hand — reload the page; your manual change is kept |
| UI port busy | the server tries the next 10 ports; or set `PORT=5000 npm run ui` |
| A source keeps failing | `claude "/poc-verify-sources <url>"`; if it is `manual`, open it yourself or disable it |
| Same idea reported twice | the title changed a lot between scans; mark it `done` in the UI — `state/seen.json` handles exact and cut-off titles |
| `config.mjs validate` errors | the message names the field and the rule; schemas in `schema/` explain every field |
| Reset everything | delete `config/*.yaml` (not the examples), `state/`, `reports/`, `runs/` and run `./setup.sh` |
