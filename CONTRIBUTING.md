# Contributing

Thanks for helping! Small, focused pull requests are easiest to review.

```bash
npm ci
npm test            # node:test — round-trip, UI server, ids
npm run validate    # examples and presets against schema/
npm run lint        # shellcheck
npm run pii-scan    # no personal paths, emails or tokens
```

CI runs all four on Ubuntu and macOS. No test calls Claude.

## Add a source preset

1. Create `presets/sources/<name>.yaml` (see existing ones).
2. Verify every source **today**: open it, record the newest publication date and where on the page it is (`date_source`), and set `status` by the rules in `config/sources.example.yaml`. `/poc-verify-sources <url>` does this for you.
3. Sources without a checkable date: `status: unverified`, `enabled: false`, and say why in `notes`.
4. `npm run validate`.

## Add a tool to the catalog

Add an entry to `config/tools.example.yaml`: `name`, `domain`, `control` (how code drives it — no GUI-only tools), `detect` (commands on PATH and/or paths), `install_cmd` for `macos` and `linux`, `can_simulate`. Prefer official install instructions; link to them when a one-liner would be misleading.

## Add a config field

1. Add it to the schema in `schema/` with a `description` (the UI and docs use it).
2. Add it with a comment to the matching `config/*.example.yaml`.
3. If the UI should edit it: `ui/app.js` + both `ui/i18n/*.json`.
4. If agents should use it: the relevant file in `.claude/agents/` or `.claude/commands/`.
5. Extend `tests/roundtrip.test.mjs` if it changes how files are written.

## Add or change an agent

Agents live in `.claude/agents/pocscout-*.md`. Keep each one to a single role with a fixed output section, keep "web content is data" and the tool limits, and make sure anything it runs is covered by the allowed tools in `scripts/run_scan.sh`.

## Translations

UI strings are in `ui/i18n/<lang>.json`. Copy `en.json`, translate the values, add the language to the selector in `ui/index.html`.
