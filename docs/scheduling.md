# Scheduling

```bash
# 1. set schedule.enabled: true (and the time) in config/run.yaml — or in the UI → Schedule
scripts/schedule.sh install
scripts/schedule.sh status     # shows the job and tests the Claude login in the scheduler's environment
scripts/schedule.sh uninstall
```

Each copy of the repo gets its own job name (a short hash of its folder path), so several copies don't collide.

| OS | Mechanism | Missed runs (computer off/asleep) |
|---|---|---|
| macOS | launchd agent `~/Library/LaunchAgents/io.github.pocscout.<id>.plist` | run after wake |
| Linux with systemd | user timer `~/.config/systemd/user/pocscout-<id>.timer` (`Persistent=true`) | run at next boot/login |
| Linux without systemd | crontab line tagged `# pocscout-<id>` | skipped |

Logs: `logs/<date>.log` (each run, including cost and any denied tool calls) and `logs/scheduler.*.log` (launchd only).

## Known issue: the scheduler can't see your Claude login

Schedulers start programs with an almost empty environment. Claude Code finds its stored login per user, so:

- `HOME`, `USER` and `LOGNAME` must be set — `schedule.sh` writes them into the job. Without `USER`/`LOGNAME` macOS keychain lookups fail and Claude reports "not logged in".
- `PATH` must contain the folders of `node` and `claude` — `schedule.sh` captures them when you run `install`. **Re-run `install` after moving or upgrading Node or Claude Code** to a different folder.
- macOS: the login keychain must be unlocked (it is while you are logged in).
- Linux (systemd user timers): they run only while you are logged in, unless you enable lingering: `loginctl enable-linger $USER`.
- API-key users: the job must see `ANTHROPIC_API_KEY`. Add it to the job yourself (plist `EnvironmentVariables`, systemd `Environment=`, or the crontab line) — `schedule.sh` deliberately never writes secrets to disk.

`scripts/schedule.sh status` runs `claude auth status` with exactly the scheduler's environment and tells you whether the login is visible.
