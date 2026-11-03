#!/usr/bin/env bash
# Headless Claude run used by the scheduler and by the UI buttons.
#   scripts/run_scan.sh [scan|verify]          run /poc-scan (default) or /poc-verify-sources
#   scripts/run_scan.sh --describe [scan|verify] print the exact permissions/budget as JSON, run nothing
# Trial run: POC_MAX_SOURCES=2 POC_TOP_N=2 scripts/run_scan.sh
# Never uses --dangerously-skip-permissions: anything not listed below is denied (dontAsk).
set -u

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="${POCSCOUT_ROOT:-$REPO}"
cd "$ROOT" || exit 1

DESCRIBE=0
if [ "${1:-}" = "--describe" ]; then DESCRIBE=1; shift; fi
MODE="${1:-scan}"

NODE="$(command -v node || true)"
CLAUDE="${CLAUDE_BIN:-$(command -v claude || true)}"
if [ -z "$NODE" ]; then echo "node not found on PATH — install Node.js 20+ (https://nodejs.org)" >&2; exit 1; fi

cfg() { "$NODE" "$REPO/scripts/config.mjs" get run "$1" 2>/dev/null; }
BUDGET="$(cfg budget_usd)"; BUDGET="${BUDGET:-10}"
ISOLATE="$(cfg isolate)"; NOTIFY="$(cfg notify)"

case "$MODE" in
  scan)
    PROMPT="/poc-scan"
    [ -n "${POC_MAX_SOURCES:-}" ] && PROMPT="$PROMPT max_sources=$POC_MAX_SOURCES"
    [ -n "${POC_TOP_N:-}" ] && PROMPT="$PROMPT top_n=$POC_TOP_N"
    ;;
  verify) PROMPT="/poc-verify-sources" ;;
  *) echo "unknown mode: $MODE (use scan or verify)" >&2; exit 1 ;;
esac

# Minimal permissions. "//" = absolute path in Claude Code permission rules; Edit() also covers Write.
R="/$ROOT"
TOOLS=(
  "Skill" "Agent" "WebFetch"
  "Read($R/**)" "Edit($R/**)"
  "Bash(node scripts/ids.mjs *)" "Bash(node scripts/config.mjs *)" "Bash(node scripts/detect-tools.mjs)"
  "Bash(date)" "Bash(date *)"
)
FLAGS=(-p "$PROMPT" --permission-mode dontAsk --max-budget-usd "$BUDGET" --output-format json --allowedTools "${TOOLS[@]}")
[ "$ISOLATE" != "false" ] && FLAGS+=(--setting-sources project --strict-mcp-config)

if [ "$DESCRIBE" = 1 ]; then
  "$NODE" -e 'const [mode, prompt, budget, isolate, ...tools] = process.argv.slice(1);
    console.log(JSON.stringify({ mode, prompt, budget_usd: Number(budget), permission_mode: "dontAsk", isolate: isolate !== "false", allowedTools: tools }))' \
    "$MODE" "$PROMPT" "$BUDGET" "${ISOLATE:-true}" "${TOOLS[@]}"
  exit 0
fi

if [ -z "$CLAUDE" ]; then echo "claude not found on PATH — install Claude Code: https://docs.claude.com/en/docs/claude-code" >&2; exit 1; fi
# Schedulers start with a bare environment; Claude Code's stored login is looked up per user.
export USER="${USER:-$(id -un)}"
export LOGNAME="${LOGNAME:-$USER}"

mkdir -p logs state runs
LOG="logs/$(date +%F).log"
exec > >(tee -a "$LOG") 2>&1
echo "=== $(date '+%F %T') $MODE start"

LOCK=state/.run.lock
if ! mkdir "$LOCK" 2>/dev/null; then
  if kill -0 "$(cat "$LOCK/pid" 2>/dev/null)" 2>/dev/null; then
    echo "another run is active (pid $(cat "$LOCK/pid")), exiting"; exit 0
  fi
  echo "stale lock removed"; rm -rf "$LOCK"; mkdir "$LOCK" || exit 1
fi
echo $$ >"$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT

OUT="$("$CLAUDE" "${FLAGS[@]}" </dev/null)"   # no stdin: avoids a 3 s wait when started from the UI
RC=$?
echo "claude exit code: $RC"
# shellcheck disable=SC2016  # JavaScript, not shell — no expansion wanted
printf '%s' "$OUT" | "$NODE" -e '
let raw = ""; process.stdin.on("data", (c) => (raw += c)).on("end", () => {
  let d; try { d = JSON.parse(raw); } catch { console.log(raw); return; }
  console.log(d.result ?? "");
  const denied = d.permission_denials ?? [];
  console.log(`cost_usd: ${d.total_cost_usd} | turns: ${d.num_turns} | subtype: ${d.subtype} | is_error: ${d.is_error} | permission_denials: ${denied.length}`);
  for (const p of denied) console.log(`  denied: ${p.tool_name} ${JSON.stringify(p.tool_input).slice(0, 200)}`);
});'

MSG="Finished — see $LOG"
if [ "$MODE" = scan ]; then
  # shellcheck disable=SC2012  # our own date-tagged file names
  SUMMARY="$(ls -t runs/*-summary.md 2>/dev/null | head -1)"
  NEW="$(grep -o 'NEW_REPORTS=[0-9]*' "$SUMMARY" 2>/dev/null | tail -1 | cut -d= -f2)"
  echo "summary: ${SUMMARY:-none}, new reports: ${NEW:-?}"
  [ "$RC" = 0 ] && [ -n "$NEW" ] && MSG="New reports: $NEW"
fi
[ "$RC" != 0 ] && MSG="Run failed — see $LOG"

if [ "$NOTIFY" != "false" ] && [ -z "${POCSCOUT_FROM_UI:-}" ]; then
  if [ "$(uname)" = Darwin ]; then /usr/bin/osascript -e "display notification \"$MSG\" with title \"PoC Scout\"" || true
  elif command -v notify-send >/dev/null; then notify-send "PoC Scout" "$MSG" || true
  fi
fi
echo "=== $(date '+%F %T') $MODE end"
exit "$RC"
