---
type: llm
---

PASS if the reply tells them to clone the package repos with mani, install dependencies with `npm ci`, and make sure `gh` is logged in with the `project` scope.
FAIL if it leaves out any of those three, or gives generic Node setup advice that doesn't mention mani.
