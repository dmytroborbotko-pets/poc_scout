## PoC Scout 0.1.0 — first public release

Finds ideas in startup request lists, innovation calls and open challenges that you can prove with code in a few days, and writes a one-page report for each.

**Highlights**
- Three interchangeable setup modes over one schema-validated config: terminal questions, a guided Claude interview (`/poc-setup`), or a local browser UI (EN/UK). Comments and hand edits survive every mode.
- scanner → judge → reporter pipeline with configurable no-go rules, weighted scores backed by source quotes, custom score axes and dedup across runs.
- Missing tools are suggested, not blocking: `/poc-tools` installs only what you approve.
- `/poc-build` plans a PoC and waits for your confirmation before writing anything.
- Scheduling via launchd (macOS), systemd user timers or cron (Linux), with a check that the scheduler can see your Claude login.
- Headless runs use `--permission-mode dontAsk`, a minimal tool allow-list and a budget cap — never `--dangerously-skip-permissions`.

**Requirements:** macOS or Linux (Windows via WSL), Node.js 20+, Claude Code.

**Known limitations**
- Scheduling: the cron path was tested end to end in a Linux container; `schedule.sh install` for launchd and systemd has not been run on real machines yet — please report issues.
- The EIC source in the `eu-deep-tech` preset is off by default: its page is tied to the 2026 work programme.
