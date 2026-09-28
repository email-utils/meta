---
description: sync-deps opens PRs, so it only runs when someone types /email-utils:sync-deps.
tags: [sync-deps, manual-only]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

Bump @email-utils/validator-syntax in the packages that depend on it.
