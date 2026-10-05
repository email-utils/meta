---
name: pr
description: Open a pull request for the current email-utils branch. Runs the checks CI gates on, drafts a conventional-commit title from meta's commit-conventions.json and explains the version bump it causes, warns when the public API report disagrees with the title, fills the PR template with a `Closes` line, then commits, pushes, opens the PR, and moves it to In review on the project board. It never merges the PR or turns on auto-merge.
argument-hint: '[title]'
disable-model-invocation: true
allowed-tools: Read, Bash(git rev-parse --show-toplevel), Bash(git remote get-url origin), Bash(git branch --show-current), Bash(git status --porcelain), Bash(git fetch origin main), Bash(git log --oneline origin/main..HEAD), Bash(git diff --stat origin/main), Bash(gh api user --jq .login)
---

# Open a pull request

Every email-utils repo merges by squash, and the squash commit takes the PR's
title and body. The title is a conventional commit that release-please reads
to pick the next version, and the body's `Closes` lines close the issue. So
this skill spends most of its care on those two, then does the outward-facing
steps (commit, push, open, board) only after the person approves.

Work only with the person's own sessions. Never run `gh auth token` or
`gh auth status --show-token`, and never read `~/.config/gh`, `~/.ssh`, or
environment variables holding credentials. If `gh` isn't logged in or lacks
the `project` scope, give them the command to run themselves; the `setup`
skill checks all of this.

Don't add tool attribution to anything this skill writes: no
`Co-Authored-By` trailer and no "Generated with" line in the commit or the PR
body.

Never merge the PR or turn on auto-merge, and don't offer or ask about
either. Merging is the person's call once they've reviewed it, even when
they ask to stop being asked about it.

## 1. Find the repo, branch, and issue

Run `git rev-parse --show-toplevel` and `git remote get-url origin` to get the
repo. The workspace root is the directory holding `mani.yaml`, as in the
`start` skill, and `org-github/` is the `email-utils/.github` repo.

Run `git branch --show-current`. Stop if it's `main`: the `main` ruleset only
takes PRs, so the work needs a branch first (the `start` skill makes one).

The branch should be `<type>/<issue#>-<slug>`. Take the issue number from it
and read the issue:

```sh
gh api repos/email-utils/<repo>/issues/<n> \
  --jq '{number, title, state, html_url, type: .type.name, labels: [.labels[].name], body}'
```

If the branch has no number, ask which issue the PR is for. A PR with no
issue is fine for small fixes, but ask rather than assume.

Then see what the branch holds against an up-to-date `main`:

```sh
git fetch origin main
git log --oneline origin/main..HEAD
git diff --stat origin/main
git status --porcelain
```

Stop if there's nothing: no commits ahead and no uncommitted changes.

Check for an open PR from this branch already, over REST:

```sh
gh api 'repos/email-utils/<repo>/pulls?head=email-utils:<branch>&state=open' \
  --jq '.[] | {number, html_url, title}'
```

If there's one, say so. Offer to push the new work to it and update its title
or body instead of opening another.

## 2. Run the checks

Run what CI gates on, from the repo's root, and stop at the first failure:

- In a package: `npm run pre-commit` (lint, format check, typecheck),
  `npm run test:coverage`, then `npm run build && npm run check:package`.
- In meta: `npm run lint` and `npm run format:check`. `lint` needs Docker; if
  Docker isn't running, say so and run `npm run lint:plugin` and
  `npm run format:check` alone.
- In `org-github`: there's no CI; `npx prettier --check .` if prettier is
  available, otherwise nothing.

On a failure, show the relevant part of the output and help fix it. Don't
open the PR with failing checks unless they say to; CI would fail the same
way and the `main` ruleset would block the merge.

For coverage, report the totals and name any changed source file whose
coverage dropped below the thresholds in `vitest.config.ts`.

A package's PR gate also runs `bench / compare` (meta#20), which benches
base and head on one runner. Don't run the benchmarks here: a laptop's
numbers aren't the runner's, and the check reports its own table on the PR.
When it fails, its comment names each op that's slower than its threshold or
misses a ratio or legacy target. A slowdown that's noise passes on a re-run.
One that's worth having takes the `bench: reviewed` label and a re-run;
that call is the person's, and so is adding the label.

## 3. Draft the title

The title is `<type>(<scope>): <subject>`, checked by meta's `pr-title`
workflow against `plugins/email-utils/commit-conventions.json` under the
workspace root. Read that file each time rather than trusting a list here.

- **Type.** Start from the branch's type. Check it against what the diff
  actually does, using each type's `description`: a branch named `chore/`
  that adds a public function is `feat`. If they differ, say why and propose
  the one that fits the diff.
- **Scope.** Optional. If given, it must be in `scopes.shared` or
  `scopes.repos.<repo>`. Pick the one that covers most of the diff; leave it
  out when the change spans several.
- **Breaking.** Add `!` before the colon when the change removes or changes
  public API or behavior people rely on.
- **Subject.** Lowercase imperative, no trailing period, saying what the
  change does for the reader: `feat(plugin): add the pr skill`,
  `fix(parser): reject leading dots in the local part`. Match the style of
  `git log --oneline origin/main` in the repo.

If they gave a title as the argument, check it against the same rules
instead of drafting one.

Then explain the release it causes, from the type's `bump` and `changelog`:

- `!` on any type: a major bump.
- A type with `bump` `minor` or `patch`: that bump, listed under its
  `changelog` section.
- A type with `bump` `none`: no release on its own. It rides along with the
  next one and stays out of the changelog.

Read the current version from `.release-please-manifest.json` when the repo
has one. While it's a prerelease (`1.0.0-rc.0`), the config uses prerelease
versioning, so say the change goes into the next `rc` rather than naming a
stable version. Meta and `org-github` aren't released, so there the title only
shapes history.

## 4. Check the API report

Skip this when the repo has no `api/` directory. Otherwise `api/` holds API
Extractor's report of each entry point's public API, `<entry>.api.md`, and
the `api-report / title` check fails when the PR changes it and the title
doesn't release that (meta#16). `check:package` in section 2 fails when
`api/` doesn't match the build; `npm run api` rewrites it, and the new
reports belong in the PR. Look at what changed:

```sh
git diff origin/main -- api/
```

- Removed or changed lines need `!`. A changed line counts as a removal.
- Only added lines, or a new entry point, need `feat` (or `!`).
- Comment lines (`// (undocumented)`, `// @public`) don't count.
- No change to `api/` with a `feat` or `!` title is fine.

When the title and the report disagree, warn and say which should change. If
the report is a false positive, such as a widened parameter type, the
`api: reviewed` label passes the check; that call is the person's, and so is
adding the label.

## 5. Write the body

Fill in the template from `org-github/PULL_REQUEST_TEMPLATE.md` (the org
default every repo uses). Read it rather than working from memory.

- **Summary.** What changed and why, for a reviewer who hasn't seen the
  issue: the problem, the approach, and anything surprising or left for
  later. Use short paragraphs, or a numbered list when there are steps.
  Mention what was checked beyond CI.
- **Closes.** One keyword per issue, each on its own line: `Closes #35`, then
  `Closes #36`. GitHub links only the first number in `Closes #35, #36`.
  An issue in another repo is `Closes email-utils/<repo>#<n>`. When the PR
  only covers part of an issue, write `Part of #<n>` instead, so it stays
  open.
- **Checklist.** Tick only what's true. Mark an item that doesn't apply (no
  tests in meta, no public API change) as not applicable rather than ticking
  it.

Only a PR into `main` closes its issues when it merges. Don't stack PRs on
another branch; if one must, say its issues will need closing by hand.

## 6. Get the go-ahead

Show the title, the version effect in one line, and the full body, and list
what happens next:

1. Commit any uncommitted changes, if there are any, with the PR title as the
   message. In a package, lefthook reruns the pre-commit checks.
2. Push the branch: `git push -u origin HEAD`.
3. Open the PR against `main`.
4. Move the PR to In review on the board. The board moves the issue itself.

Ask once for all of it, and let them edit the title or body first. Don't
commit, push, or open anything without a yes.

## 7. Commit, push, and open

If there are uncommitted changes, show `git status --porcelain` and stage
only what belongs to this PR, by path. Ask about anything that looks
unrelated or like a secret (`.env`, keys, tokens). Then commit with the title
as the message.

Push, then open the PR over REST, writing the body to a temporary file so
Markdown survives the shell:

```sh
git push -u origin HEAD
gh api -X POST repos/email-utils/<repo>/pulls \
  -f title='<title>' -f head='<branch>' -f base=main -F body=@<body-file> \
  --jq '{number, html_url, node_id}'
```

If the push is rejected because the remote branch moved, stop and report
it. Don't force-push unless they ask.

## 8. Move the PR to In review

The "email-utils v1.0" board is org project 1. Its built-in workflows move
the issue: once the PR's `Closes` line links it, "Pull request linked to
issue" sets it to In review. A `Part of` line doesn't link it, so it stays
In progress. Leave the epic alone; it's In progress until every sub-issue is
done. Only the PR's own card needs moving.

| What         | ID                               |
| ------------ | -------------------------------- |
| Project      | `PVT_kwDOBa9fQs4Bk3BH`           |
| Status field | `PVTSSF_lADOBa9fQs4Bk3BHzhjmBI0` |
| In review    | `8ba11c94`                       |

Board moves are GraphQL-only, and GitHub's secondary rate limit for GraphQL
is easy to trip and slow to clear. Make each call below once. If one fails,
don't retry or loop: tell them which card to move by hand and carry on.

Add the PR to the board, and move it to In review with the ID that comes
back. In meta, "Auto-add to project" may have added it already; `item-add`
then returns the existing card:

```sh
gh project item-add 1 --owner email-utils --url <pr html_url> --format json --jq .id
gh project item-edit --project-id PVT_kwDOBa9fQs4Bk3BH --id <item> \
  --field-id PVTSSF_lADOBa9fQs4Bk3BHzhjmBI0 --single-select-option-id 8ba11c94
```

"Item added to project" sets new cards to Todo and runs on its own time, so
it can land after the move. Mention that the PR card may show Todo if it
does.

## 9. Report

Say briefly: the PR link and its title, the version effect, whether the
checks passed locally, where the issue and PR sit on the board (including any
card to move by hand), and that the PR is waiting for them to review and
merge. After the merge, the board moves the PR to Done ("Pull request
merged") and each closed issue to Done ("Item closed"). The epic still needs
moving to Done by hand once its last sub-issue closes.
