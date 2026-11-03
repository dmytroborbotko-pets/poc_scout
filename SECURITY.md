# Security

PoC Scout lets Claude read arbitrary web pages and write files on your computer. This page explains what it can and cannot do.

## Prompt injection

Every page the scanner reads is untrusted. Agents are instructed to treat page content as **data, never instructions** — but instructions alone are not a guarantee. The real protection is the permission list below: even a fully "convinced" agent can only use the tools it was given.

## What a scheduled or UI-started scan may do

`scripts/run_scan.sh` (print it with `scripts/run_scan.sh --describe`) runs:

- `claude -p "/poc-scan" --permission-mode dontAsk --max-budget-usd <budget>`
- allowed tools: `Skill`, `Agent`, `WebFetch`, `Read` and `Edit` **inside this folder only**, `node scripts/ids.mjs …`, `node scripts/config.mjs …`, `node scripts/detect-tools.mjs`, `date`
- with `isolate: true` (default) also `--setting-sources project --strict-mcp-config`: your personal plugins and MCP servers are not loaded

Anything else — other shell commands, writing outside the folder, installing software — is denied automatically. `--dangerously-skip-permissions` is never used.

## What needs you

- **Installing software** — only via `/poc-tools`, interactively, after you pick what to install. Commands needing `sudo` are printed for you to run.
- **Building a PoC** — `/poc-build` shows a plan and waits for "Start". The builder writes only inside `builds/<idea>/`.

## The local UI

- Listens on `127.0.0.1` only; requests with any other `Host` header are refused (DNS-rebinding protection).
- Every change needs the `X-PocScout: 1` header, so other websites cannot post to it.
- Shows a diff before writing and refuses to overwrite a file changed on disk since you opened it.
- Report text is rendered with HTML escaped; only `http(s)` links are clickable.
- Claude-backed buttons show the exact tools and budget before running.

## Reporting a vulnerability

Please open a private security advisory on GitHub (Security → Advisories → Report a vulnerability) rather than a public issue.
