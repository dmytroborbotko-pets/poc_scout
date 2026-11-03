<!-- Real output of a test scan on 2026-11-03 (sources: YC RFS + a16z Big Ideas, top 2). Unedited. -->
---
title: AI for City Hall
source: YC Requests for Startups (yc-rfs) — https://www.ycombinator.com/rfs#ai-for-city-hall
date_found: 2026-11-03
scores: {code_controllability: 4, data_availability: 4, simulation_fit: 4}
total: 12
poc_days_estimate: 3
status: new
---
## Summary
Permitting delays cost cities revenue, and staff do much of the work by hand. The source asks for AI for permits, 311, public records, licensing and inspections across about 19,000 US cities. The PoC is an LLM pipeline that triages 311 requests and pre-checks permit applications against municipal code.

## Why the PoC is realistic
- Code controllability 4/5: "AI for permits, 311, public records, licensing" are document and ticket workflows that run fully in code. "Inspections" are physical and stay out of scope, so the score is not 5.
- Data availability 4/5: "311, public records" are public by nature. Many cities publish 311 requests and permit records as open data, and municipal codes are public text. Real submitted applications with attachments are less available.
- Simulation fit 4/5: no physical simulation is needed. "Staff do much work by hand" on paperwork, which installed Python 3 and Node.js (dashboard) can rebuild end to end, with Claude as the model.

## Stack
- Python 3 (installed): ingestion, triage and pre-check pipeline.
- Node.js (installed): small review dashboard.
- Claude as the LLM. Specific libraries: unknown, to be chosen during the build.

## What is missing
- All tools from tools.yaml are installed, so no installs are needed.
- Data: real submitted permit applications with attachments are scarce. The PoC would use open 311 and permit datasets plus a public municipal code. The specific city and dataset are unknown.
- Access: LLM API access for Claude. The judge's evidence does not say whether this is set up.

## PoC scope: what it demonstrates and what it deliberately does NOT do
Demonstrates:
- Triage of 311 requests into categories and priorities.
- A permit pre-check that flags likely gaps against municipal code text.
- A simple dashboard showing results.

Does NOT:
- Cover physical inspections.
- Integrate with real city systems.
- Handle real applicant attachments.
- Make binding legal decisions.

## First step
Find one city's open 311 dataset (CSV), save it as `data/311_sample.csv`, and write `triage.py`. The script should send 20 rows to Claude and print a category and priority for each.
