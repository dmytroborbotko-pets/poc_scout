# Changelog

## 0.1.0 — unreleased

First public version.

- Three interchangeable setup modes over one schema-validated config: technical (terminal questions + files), quick (`/poc-setup` with Claude), non-technical (local browser UI, EN/UK).
- Pipeline: `pocscout-scanner` → `pocscout-judge` → `pocscout-reporter`; per-run report folders with `OVERVIEW.md` and a global `reports/INDEX.md`.
- Configurable no-go rules, score weights, custom score axes, `tool_first: suggest | strict`, tool suggestions per run and `/poc-tools`.
- `/poc-verify-sources` freshness checks (recommended / unverified / stale / manual).
- `/poc-build` with an explicit confirmation step and isolated `builds/<idea>/`.
- Scheduling via launchd (macOS), systemd user timers or cron (Linux), with a login check.
- Source presets: general-startups, eu-deep-tech, ai-ml-challenges.
