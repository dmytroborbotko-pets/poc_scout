---
description: Plan a PoC from a report, ask for confirmation, then build it in builds/<slug>/
argument-hint: "<path to report .md>"
---

Start a PoC from a PoC Scout report, from the project root. Report: <report>$ARGUMENTS</report>

1. Read the report, `config/tools.yaml`, `config/rubric.yaml` (`max_poc_days`) and `config/run.yaml` (`models.builder`). If the report does not exist, or its `status` is not `new`, say so and stop.
2. Draft a plan:
   - goal — what the demo proves
   - explicit non-goals
   - milestones that fit `poc_days_estimate` (never above `max_poc_days`)
   - stack from tools.yaml; data source; how success is measured
   - installs needed, with commands — they are never run without the user's approval (`/poc-tools`)
3. Show the plan and ask with AskUserQuestion: **Start** / **Adjust** / **Cancel**. Do nothing else until the user picks Start. On Adjust, revise and ask again.
4. On Start:
   - Create `builds/<slug>/` (slug = report file name without `.md`) with `PLAN.md` — the approved plan plus a link to the report.
   - Change the report's front matter `status: new` → `status: in-progress`, and the matching row in `reports/INDEX.md`.
   - Start agent `pocscout-builder` (model from config) with the slug and `builds/<slug>/PLAN.md` for milestone 1.
5. Relay the builder's result: what was built, how to run it, blockers, the next milestone. Ask before starting the next milestone.
