#!/usr/bin/env bash
# Pre-publish check: personal paths, emails, tokens and keys in tracked files.
#   bash scripts/pii-scan.sh                 scan
#   PII_EXTRA="name1,name2" bash scripts/pii-scan.sh   also look for these words (case-insensitive)
#   PII_ALLOW="regex"       ignore matching lines (e.g. your public GitHub handle in URLs)
# Always allowed: the copyright line in LICENSE.
set -u
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  FILES="$(git ls-files --cached --others --exclude-standard)"
else
  FILES="$(find . -type f \
    -not -path './node_modules/*' -not -path './.git/*' -not -path './reports/*' -not -path './runs/*' \
    -not -path './state/*' -not -path './logs/*' -not -path './builds/*' | sed 's#^\./##' \
    | grep -vE '^config/[^/]+\.yaml$|\.example\.yaml$' ; ls config/*.example.yaml 2>/dev/null)"
fi
FILES="$(printf '%s\n' "$FILES" | grep -vE '^(scripts/pii-scan\.sh|package-lock\.json)$' | sort -u)"

PATTERNS=(
  '/Users/[A-Za-z0-9._-]+'
  '/home/[a-z][A-Za-z0-9._-]+'
  '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
  'sk-ant-[A-Za-z0-9_-]{10,}'
  'gh[pousr]_[A-Za-z0-9]{20,}'
  'AKIA[0-9A-Z]{16}'
  'xox[baprs]-[A-Za-z0-9-]{10,}'
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
)
IFS=',' read -r -a EXTRA <<<"${PII_EXTRA:-}"

# Drop allowed lines; succeed only if something is left.
allow() {
  local out
  out="$(grep -v '^LICENSE:[0-9]*:Copyright (c)')"
  [ -n "${PII_ALLOW:-}" ] && out="$(printf '%s\n' "$out" | grep -vE -e "$PII_ALLOW")"
  [ -n "$out" ] && printf '%s\n' "$out"
}

found=0
while IFS= read -r f; do
  [ -f "$f" ] || continue
  for p in "${PATTERNS[@]}"; do
    hits="$(grep -nEH -e "$p" "$f" 2>/dev/null | allow)" && { echo "$hits"; found=1; }
  done
  for w in "${EXTRA[@]}"; do
    [ -z "$w" ] && continue
    hits="$(grep -niFH -e "$w" "$f" 2>/dev/null | allow)" && { echo "$hits"; found=1; }
  done
done <<<"$FILES"

if [ "$found" = 1 ]; then echo "✗ personal data or secrets found (see above)"; exit 1; fi
echo "✓ no personal paths, emails, tokens or keys found ($(printf '%s\n' "$FILES" | grep -c .) files)"
