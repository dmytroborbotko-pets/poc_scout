---
description: Review tools that recent ideas need and install the ones you approve
---

Help the user install tools that PoC Scout ideas need, from the project root.

1. Run `node scripts/detect-tools.mjs` to refresh what is installed.
2. Read the newest `runs/*-tools-suggested.md` (and older ones if the user asks). Drop tools that are now installed.
3. If nothing is missing, say so and stop.
4. Show a short table: tool, how many ideas need it (and which), install command for this OS (`uname` → Darwin = macOS, Linux = linux), whether it needs sudo or a large download.
5. Ask with AskUserQuestion (multi-select) which ones to install. Default: none.
6. For each approved tool, run its install command. If it needs a password (sudo) or an interactive installer, do not run it — print the command for the user to run in their own terminal.
7. Run `node scripts/detect-tools.mjs` again and report what changed. If a tool is not in `config/tools.yaml` yet, add an entry (name, domain, control, installed, detect, install_cmd, can_simulate) with the Edit tool and run `node scripts/config.mjs validate tools`.

Never install anything the user did not explicitly approve in step 5.
