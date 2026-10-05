# Composite actions

Shared by every email-utils repo's workflows. Each action keeps its scripts in
its own directory and finds them through `github.action_path`, so it works
when called from another repo.

| Action           | What it does                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `summarize`      | Turns lint, format, typecheck, or vitest output into a one-line `summary` and a `details` block                              |
| `job-summary`    | Writes a pass/fail section to the job summary, with the log's last 100 lines on failure                                      |
| `pr-comment`     | Keeps one PR comment per check, updated in place. On success, `minimize` resolves an earlier failure; `comment` always posts |
| `audit-comment`  | Reports `npm audit --json` output as a non-blocking warning, to the job summary and a PR comment                             |
| `repository-url` | Fails when `package.json`'s `repository.url` isn't the running repo's, which npm's provenance requires                       |

## Calling them

Pin each `uses:` to a meta commit SHA. A check step tees its output to a log,
and the reporting steps read it:

```yaml
permissions:
  contents: read
  pull-requests: write # pr-comment and audit-comment

steps:
  - name: Run lint
    id: run
    run: |
      set -o pipefail
      npm run lint 2>&1 | tee "$RUNNER_TEMP/lint.log"

  # always(): a passing lint can still carry warnings.
  - name: Summarize
    id: summarize
    if: always()
    uses: email-utils/meta/.github/actions/summarize@<sha>
    with:
      check: lint
      log-file: ${{ runner.temp }}/lint.log

  - uses: email-utils/meta/.github/actions/job-summary@<sha>
    if: always()
    with:
      check-name: Lint
      outcome: ${{ steps.run.outcome }}
      log-file: ${{ runner.temp }}/lint.log
      summary: ${{ steps.summarize.outputs.summary }}
      details: ${{ steps.summarize.outputs.details }}

  # !cancelled(), not always(): a newer push cancels this run, and a
  # cancelled step would be reported as a failure.
  - uses: email-utils/meta/.github/actions/pr-comment@<sha>
    if: ${{ !cancelled() }}
    with:
      check-name: Lint
      marker-slug: lint
      pr-number: ${{ github.event.pull_request.number }}
      outcome: ${{ steps.run.outcome }}
      log-file: ${{ runner.temp }}/lint.log
      summary: ${{ steps.summarize.outputs.summary }}
      details: ${{ steps.summarize.outputs.details }}
```

For vitest, run `npm run test:coverage -- --reporter=default --reporter=json`.
The package's vitest config writes the JSON to `.reports/vitest/results.json`
and the coverage summary to `.reports/coverage/`, which are `summarize`'s
defaults.

## Behavior worth knowing

- **Colour.** GitHub sets `CI=true`, which turns on colour in Prettier and
  Vitest. `summarize`, `job-summary`, and `pr-comment` strip ANSI codes before
  parsing or quoting a log.
- **Missing output.** When a check never ran, `summarize` returns an empty
  summary rather than a false "0 errors", and `job-summary` and `pr-comment`
  say that no output was captured.
- **Forks.** A fork's PR gets a read-only token. `pr-comment` and
  `audit-comment` log a warning instead of failing, and the check's own
  result stands.
- **Other comments.** Only comments written by a bot are matched by
  marker, so a person quoting a marker never has their comment edited.
