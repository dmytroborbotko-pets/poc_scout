#!/usr/bin/env bash
# Install / remove / inspect the automatic scan for this copy of the repo.
#   scripts/schedule.sh install | uninstall | status
# macOS → launchd (runs a missed job after wake), Linux → systemd user timer (Persistent=true), else cron.
# Reads config/run.yaml → schedule.
set -u

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="${POCSCOUT_ROOT:-$REPO}"
NODE="$(command -v node || true)"
CLAUDE="$(command -v claude || true)"
[ -z "$NODE" ] && { echo "node not found on PATH — install Node.js 20+ (https://nodejs.org)"; exit 1; }

cfg() { "$NODE" "$REPO/scripts/config.mjs" get run "$1" 2>/dev/null; }
if command -v shasum >/dev/null; then ID="$(printf '%s' "$ROOT" | shasum -a 256 | cut -c1-8)"; else ID="$(printf '%s' "$ROOT" | sha256sum | cut -c1-8)"; fi
LABEL="io.github.pocscout.$ID"
RUN="$REPO/scripts/run_scan.sh"

# The scheduler starts with an almost empty environment: pass the dirs of node and claude explicitly.
SCHED_PATH="/usr/bin:/bin:/usr/sbin:/sbin"
for d in "$(dirname "$NODE")" ${CLAUDE:+"$(dirname "$CLAUDE")"} /opt/homebrew/bin /usr/local/bin; do
  case ":$SCHED_PATH:" in *":$d:"*) ;; *) [ -d "$d" ] && SCHED_PATH="$d:$SCHED_PATH" ;; esac
done
ME="$(id -un)"

PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT="pocscout-$ID"
has_systemd_user() { command -v systemctl >/dev/null && systemctl --user show-environment >/dev/null 2>&1; }

install() {
  if [ "$(cfg schedule.enabled)" != "true" ]; then
    echo "schedule.enabled is false in config/run.yaml — nothing to install. (Use 'uninstall' to remove an existing schedule.)"
    exit 1
  fi
  local freq hour minute dom wd
  freq="$(cfg schedule.frequency)"; hour="$(cfg schedule.hour)"; minute="$(cfg schedule.minute)"
  dom="$(cfg schedule.day_of_month)"; dom="${dom:-1}"; wd="$(cfg schedule.weekday)"; wd="${wd:-1}"
  mkdir -p "$ROOT/logs"

  if [ "$(uname)" = Darwin ]; then
    local when
    if [ "$freq" = weekly ]; then when="<key>Weekday</key><integer>$wd</integer>"; else when="<key>Day</key><integer>$dom</integer>"; fi
    mkdir -p "$(dirname "$PLIST")"
    cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$RUN</string></array>
  <key>StartCalendarInterval</key><dict>$when<key>Hour</key><integer>$hour</integer><key>Minute</key><integer>$minute</integer></dict>
  <key>EnvironmentVariables</key><dict>
    <key>HOME</key><string>$HOME</string>
    <key>USER</key><string>$ME</string>
    <key>LOGNAME</key><string>$ME</string>
    <key>PATH</key><string>$SCHED_PATH</string>
    <key>POCSCOUT_ROOT</key><string>$ROOT</string>
  </dict>
  <key>StandardOutPath</key><string>$ROOT/logs/scheduler.out.log</string>
  <key>StandardErrorPath</key><string>$ROOT/logs/scheduler.err.log</string>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
EOF
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST" && echo "installed launchd job $LABEL ($freq at $(printf '%02d:%02d' "$hour" "$minute"))"
  elif has_systemd_user; then
    local cal
    local days=(Sun Mon Tue Wed Thu Fri Sat)
    if [ "$freq" = weekly ]; then cal="${days[$wd]} *-*-* $hour:$minute:00"; else cal="*-*-$dom $hour:$minute:00"; fi
    mkdir -p "$UNIT_DIR"
    cat >"$UNIT_DIR/$UNIT.service" <<EOF
[Unit]
Description=PoC Scout scan ($ROOT)

[Service]
Type=oneshot
Environment="HOME=$HOME" "USER=$ME" "LOGNAME=$ME" "PATH=$SCHED_PATH" "POCSCOUT_ROOT=$ROOT"
ExecStart=/bin/bash "$RUN"
EOF
    cat >"$UNIT_DIR/$UNIT.timer" <<EOF
[Unit]
Description=PoC Scout schedule ($ROOT)

[Timer]
OnCalendar=$cal
Persistent=true

[Install]
WantedBy=timers.target
EOF
    systemctl --user daemon-reload && systemctl --user enable --now "$UNIT.timer" && echo "installed systemd user timer $UNIT ($cal)"
    echo "note: user timers run only while you are logged in, unless you run: loginctl enable-linger $ME"
  else
    local line
    if [ "$freq" = weekly ]; then line="$minute $hour * * $wd"; else line="$minute $hour $dom * *"; fi
    line="$line HOME='$HOME' USER='$ME' LOGNAME='$ME' PATH='$SCHED_PATH' POCSCOUT_ROOT='$ROOT' /bin/bash '$RUN' # pocscout-$ID"
    { crontab -l 2>/dev/null | grep -v "# pocscout-$ID\$"; echo "$line"; } | crontab - && echo "installed cron entry (# pocscout-$ID)"
    echo "note: cron does not run jobs missed while the computer was off."
  fi
}

uninstall() {
  local done=0
  if [ -f "$PLIST" ]; then launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null; rm -f "$PLIST"; echo "removed launchd job $LABEL"; done=1; fi
  if [ -f "$UNIT_DIR/$UNIT.timer" ]; then
    systemctl --user disable --now "$UNIT.timer" 2>/dev/null; rm -f "$UNIT_DIR/$UNIT.timer" "$UNIT_DIR/$UNIT.service"
    systemctl --user daemon-reload 2>/dev/null; echo "removed systemd timer $UNIT"; done=1
  fi
  if crontab -l 2>/dev/null | grep -q "# pocscout-$ID\$"; then
    crontab -l | grep -v "# pocscout-$ID\$" | crontab -; echo "removed cron entry"; done=1
  fi
  [ "$done" = 0 ] && echo "no schedule installed for this folder"
  return 0
}

status() {
  echo "folder: $ROOT"
  if [ -f "$PLIST" ]; then
    echo "scheduler: launchd job $LABEL"
    launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | grep -E '^\s+(state|runs|last exit code) =' || echo "  (plist exists but job not loaded — run install again)"
  elif [ -f "$UNIT_DIR/$UNIT.timer" ]; then
    echo "scheduler: systemd user timer $UNIT"; systemctl --user list-timers "$UNIT.timer" --no-pager 2>/dev/null
  elif crontab -l 2>/dev/null | grep -q "# pocscout-$ID\$"; then
    echo "scheduler: cron"; crontab -l | grep "# pocscout-$ID\$"
  else
    echo "scheduler: not installed"
  fi

  # Trial: can Claude Code see your login with the scheduler's bare environment?
  if [ -z "$CLAUDE" ]; then echo "auth check: claude not found on PATH"; return 1; fi
  if env -i HOME="$HOME" USER="$ME" LOGNAME="$ME" PATH="$SCHED_PATH" claude auth status 2>/dev/null | grep -q '"loggedIn": *true'; then
    echo "auth check: OK — scheduled runs can use your Claude Code login"
  else
    echo "auth check: FAILED — with the scheduler's environment Claude Code is not logged in."
    echo "  Try: run 'claude' once in a terminal and log in; on macOS make sure the login keychain is unlocked."
    echo "  If you use an API key, the scheduler must see ANTHROPIC_API_KEY (see docs/scheduling.md)."
    return 1
  fi
}

case "${1:-status}" in
  install) install ;;
  uninstall) uninstall ;;
  status) status ;;
  *) echo "usage: scripts/schedule.sh install | uninstall | status"; exit 1 ;;
esac
