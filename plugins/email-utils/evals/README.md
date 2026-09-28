# Skill evals

Eval cases for the `email-utils` plugin's skills, run with
[`claude plugin eval`](https://code.claude.com/docs/en/plugin-evals). From
meta's root:

```sh
npm run eval
```

Every run is a real model call on your own account. The script pins the model
under test and the judge, so scores stay comparable between runs, and it stops
at $10. A full run sends each case three times with the plugin and three times
without it. To try one case cheaply while you work on it:

```sh
npx claude plugin eval plugins/email-utils --case <name> --runs 1 --ablation none
```

Reports go to `results/`, which git ignores. CI doesn't run the suite; it runs
`claude plugin validate` through `npm run lint:plugin`.

## What the cases cover

Runs are sandboxed: no network, no `gh`, and no Bash, since the script grants
none. So the cases check how each skill behaves before it reaches GitHub or npm:

- `start`, `setup`, and `release-status` trigger on natural phrasing, and
  `start` names branches the way it says to.
- `release-status` says it couldn't reach GitHub or npm rather than inventing
  versions.
- `pr`, `release`, and `sync-deps` push, merge, or publish, so they set
  `disable-model-invocation`. Their cases fail if that flag is ever dropped.
- An unrelated coding question triggers no skill.

The rest of each flow, from `start` through `pr` to a merge and a
`release --dry-run`, gets checked by hand on a throwaway issue.

## Adding a case

Each case is a directory with a `prompt.md` (frontmatter: limits and tools;
body: what a person would type, without naming the skill) and one grader per
file under `graders/`. Pair a grader on the result with a `tool_used: Skill`
grader on the skill, and prefer `regex` graders to `llm` ones where the answer
can be matched.
