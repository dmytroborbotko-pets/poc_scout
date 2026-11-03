#!/usr/bin/env bash
# PoC Scout — single entry point. Safe to run again: it never overwrites your config.
#   ./setup.sh                     interactive
#   ./setup.sh --mode technical|quick|ui [--no-open]   skip the first question
set -u
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1

MODE=""; OPEN="--open"
while [ $# -gt 0 ]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift ;;
    --no-open) OPEN="" ;;
    -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
  esac
  shift
done

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n✗ %s\n' "$*" >&2; exit 1; }
ask() { local a; read -r -p "$1 " a; echo "${a:-$2}"; }

# ---------- prerequisites ----------
case "$(uname)" in
  Darwin|Linux) ;;
  *) fail "Unsupported OS. On Windows use WSL: see docs/windows-wsl.md" ;;
esac
command -v node >/dev/null || fail "Node.js 20+ is required. Install it from https://nodejs.org (one installer), then run ./setup.sh again."
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || fail "Node.js 20+ is required, found $(node --version). Update from https://nodejs.org"
command -v claude >/dev/null || fail "Claude Code is required. Install: https://docs.claude.com/en/docs/claude-code/setup — then run ./setup.sh again."
claude auth status 2>/dev/null | grep -q '"loggedIn": *true' || fail "Claude Code is not logged in. Run 'claude' once and log in, then run ./setup.sh again."
if [ ! -d node_modules ]; then
  echo "Installing dependencies (one time)…"
  npm ci --no-audit --no-fund --silent || fail "npm ci failed — check your internet connection and try again."
fi
echo "✓ $(uname) · node $(node --version) · claude $(claude --version 2>/dev/null | cut -d' ' -f1) · logged in"

remember() { mkdir -p state; printf '{"mode":"%s","date":"%s"}\n' "$1" "$(date +%F)" > state/setup.json; }

run_ui() {
  echo; bold "Opening the configurator in your browser. Press Ctrl+C here to stop it."
  exec node ui/server.mjs $OPEN
}
run_quick() {
  node scripts/config.mjs init >/dev/null
  remember quick
  echo; bold "Starting Claude. It will ask a few questions and check sources for you."
  exec claude "/poc-setup"
}
run_technical() {
  node scripts/config.mjs init >/dev/null
  remember technical
  exec node scripts/setup-technical.mjs
}
run_nontech_first() {
  node scripts/config.mjs init >/dev/null
  node scripts/config.mjs preset general-startups >/dev/null
  node scripts/detect-tools.mjs >/dev/null
  remember ui
  echo; echo "Default settings are ready (sources: general-startups preset). You can change everything in the browser."
  if [ -z "$MODE" ]; then [ "$(ask 'Open the browser configurator now? [Y/n]' y)" != n ] || exit 0; fi
  run_ui
}

# ---------- already set up? ----------
if [ -f config/profile.yaml ] && [ -f config/sources.yaml ]; then
  case "$MODE" in
    ui) run_ui ;; quick) run_quick ;; technical) run_technical ;;
  esac
  echo; bold "PoC Scout is already set up here. What now?"
  echo "  1) Open the browser configurator"
  echo "  2) Re-run the guided setup with Claude"
  echo "  3) Technical setup (questions in the terminal)"
  echo "  4) Check my config for errors"
  echo "  5) Exit"
  case "$(ask 'Choose [1]:' 1)" in
    1) run_ui ;; 2) run_quick ;; 3) run_technical ;;
    4) exec node scripts/config.mjs validate ;;
    *) exit 0 ;;
  esac
fi

# ---------- first run ----------
if [ -z "$MODE" ]; then
  echo; bold "How do you want to set up PoC Scout?"
  echo "  1) Technical — answer detailed questions here; edit files later"
  echo "  2) Technical but quick — Claude asks a few questions and finds sources for you"
  echo "  3) Non-technical — sensible defaults, then a simple page in your browser"
  case "$(ask 'Choose [3]:' 3)" in
    1) MODE=technical ;; 2) MODE=quick ;; *) MODE=ui ;;
  esac
  FIRST_ASKED=1
fi
case "$MODE" in
  technical) run_technical ;;
  quick) run_quick ;;
  ui) [ -n "${FIRST_ASKED:-}" ] && MODE=""; run_nontech_first ;;
  *) fail "unknown mode: $MODE (use technical, quick or ui)" ;;
esac
