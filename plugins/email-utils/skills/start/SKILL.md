---
name: start
description: Start work on an email-utils issue. With no issue given, picks the next one from the "v1.0 execution order" tracking issue in meta. Syncs `main` in the right repo, creates a `<type>/<issue#>-<slug>` branch named from the issue, assigns the issue to the person, moves it and its epic to In progress on the project board, then starts the work the issue describes. Use it whenever someone says they're starting, picking up, or working on an issue (`#34`, `validator-dns#13`, or an issue URL), asks what to work on next or to pick up the next issue, asks for a branch for an issue, or asks what to name one.
argument-hint: '[[repo#]issue | next]'
allowed-tools: Read, Bash(git rev-parse --show-toplevel), Bash(git remote get-url origin), Bash(git branch --show-current), Bash(git status --porcelain), Bash(gh api user --jq .login)
---

# Start work on an issue

Every email-utils repo works trunk-based: one short-lived branch per piece of
work, cut from an up-to-date `main`, merged back by squash PR. This skill sets
that branch up, puts the issue on the board as In progress, and then starts
on the issue itself. It doesn't commit, push, or open a PR; the `pr` skill
does that.

Work only with the person's own sessions. Never run `gh auth token` or
`gh auth status --show-token`, and never read `~/.config/gh`, `~/.ssh`, or
environment variables holding credentials. If `gh` isn't logged in or lacks
the `project` scope, give them the command (`gh auth login`, or
`gh auth refresh -s project`) to run themselves; in Claude Code they can
prefix it with `!` to run it in this session. The `setup` skill checks all of
this.

## 1. Find the repo and the issue

Run `git rev-parse --show-toplevel`. The workspace root is the directory
holding `mani.yaml`: the top level itself in meta, or its parent in a package
clone. `mani.yaml` maps each clone's directory to its repo. The one oddity is
`org-github/`, which is the `email-utils/.github` repo.

With no argument, or with `next`, pick the issue from the execution order
(below) wherever they are. Otherwise, work out the repo in this order:

1. The argument names it: `validator-dns#13`, `email-utils/sanitizer#10`, or
   an issue URL.
2. The current directory is a package or `org-github` clone: that repo.
   `git remote get-url origin` confirms it.
3. The current directory is meta's root. Meta has issues of its own, and it's
   also where people run things across the workspace, so ask which repo
   rather than assuming meta. List the projects from `mani.yaml`.

If they named a repo but no issue number, ask for one. If they don't know it,
list the repo's open issues (the REST list includes PRs; drop any with a
`pull_request` key):

```sh
gh api 'repos/email-utils/<repo>/issues?state=open&per_page=50' \
  --jq '.[] | select(.pull_request | not) | "#\(.number) \(.title)"'
```

### Picking the next issue

The order work happens in lives in an open meta issue titled "v1.0 execution
order". Its body lists issues under Stage headings, one
`email-utils/<repo>#<n>` reference per line, in the order to do them. The
person reorders work by editing that body, so read it fresh every time and
never rely on an order remembered from earlier:

```sh
gh api 'repos/email-utils/meta/issues?state=open&per_page=100' \
  --jq '.[] | select(.pull_request | not) | select(.title == "v1.0 execution order") | {number, body}'
```

If nothing comes back, say that there's no tracking issue and ask which issue
to start. Otherwise take the `email-utils/<repo>#<n>` references from the
body, top to bottom. Read each one with the issue query below, and stop at the
first one that's open, isn't an epic (`sub_issues` is 0), has `blocked_by` at
0, and has no assignees. Along the way, skip:

- closed issues, without comment;
- issues assigned to the person, since that work is already under way. List
  them as in flight;
- issues that are blocked or assigned to someone else. Name each one with the
  reason.

Say in one line what you picked and what you skipped, for example: "Next in
order: classifier#9. Skipped sanitizer#7 (in flight) and classifier#10
(blocked by classifier#9)." Then carry on without asking for confirmation. If
every open reference is skipped, list them with their reasons and ask what
to start.

The picked issue can be in a different repo from the directory they're in.
Its clone is `<workspace root>/<path>` from `mani.yaml`. Run the git commands
in steps 3 and 4 with `git -C <clone>`, and do the work in step 8 in that
clone.

### Reading the issue

Read the issue:

```sh
gh api repos/email-utils/<repo>/issues/<n> \
  --jq '{number, title, state, html_url, node_id, type: .type.name, labels: [.labels[].name], assignees: [.assignees[].login], sub_issues: .sub_issues_summary.total, blocked_by: .issue_dependencies_summary.blocked_by, pr: (.pull_request != null)}'
```

Stop, and say why, when:

- `pr` is true: it's a pull request, not an issue.
- `state` is `closed`: ask whether they meant another issue or want it
  reopened (reopening is their call).
- `sub_issues` is above 0: it's an epic. Work happens on its sub-issues;
  offer to list the open ones with
  `gh api repos/email-utils/<repo>/issues/<n>/sub_issues`.

Warn and ask whether to carry on when `blocked_by` is above 0 or it has the
`blocked` or `needs decision` label, or when someone else is assigned.

## 2. Name the branch

The branch is `<type>/<issue#>-<slug>`, for example `feat/33-setup-skill`,
`ci/29-release-workflow`, or `chore/6-config-templates`.

**Type.** Use a conventional-commit type from
`plugins/email-utils/commit-conventions.json` under the workspace root; read it
rather than relying on a list here. The branch type should match the type
the PR title will have, which is the type of what the work ships:

- Issue type **Bug**: `fix`.
- Issue type **Feature**: `feat`.
- Issue type **Task**, or none: decide from what the change is, using the
  descriptions in `commit-conventions.json`. The `area:` labels are hints:
  `area:ci` is usually `ci`, `area:docs` is `docs`, `area:test` is `test`,
  and `area:perf` is `perf`. A task that adds something users or
  contributors get to use (a skill, a new check) is `feat`; repo settings,
  synced config, and dev dependencies are `chore`.

**Slug.** Two to four lowercase words from the title, joined by hyphens, with
filler dropped: "Skill: `start`" is `start-skill`, and "Reusable release
workflow" is `release-workflow`. ASCII letters, digits, and hyphens only,
around 30 characters at most.

Propose the name with one line on why you picked the type, and let them
change either part before going on.

## 3. Check the working tree

In the target repo, run `git branch --show-current` and
`git status --porcelain`.

If `git status --porcelain` prints anything, stop. Switching to `main` would
carry those changes along or fail. Tell them what's uncommitted and let them
commit, stash, or discard it themselves; don't do any of that for them.

Then look for branches already made for this issue:

```sh
git fetch --prune origin
git branch --all --list '*/<n>-*'
```

If there's one, ask whether to switch to it and carry on there instead of
making a new one. An issue can have more than one branch (#32 had two PRs),
so a second branch with a different slug is fine if that's what they want.
Never reuse a name that exists, locally or on `origin`.

## 4. Sync main and branch

```sh
git switch main
git pull --ff-only
git switch -c <type>/<n>-<slug>
```

If `git pull --ff-only` fails, local `main` has commits `origin/main`
doesn't. Stop and report it; don't reset or rebase their `main`.

## 5. Assign the issue

If they aren't already assigned, add them. REST doesn't accept `@me`, so pass
their login from `gh api user --jq .login`. This adds them alongside anyone
already assigned:

```sh
gh api -X POST repos/email-utils/<repo>/issues/<n>/assignees \
  -f 'assignees[]=<login>' --jq '[.assignees[].login]'
```

## 6. Move it on the board

The "email-utils v1.0" board is org project 1. Its built-in workflows add
meta's issues and PRs, and the sub-issues of anything on the board, as Todo.
They move a reopened issue to In progress, an issue linked from a PR's
`Closes` line to In review, and closed issues and merged PRs to Done.
Nothing moves a card to In progress when work starts, so that's this step.
The IDs:

| What         | ID                               |
| ------------ | -------------------------------- |
| Project      | `PVT_kwDOBa9fQs4Bk3BH`           |
| Status field | `PVTSSF_lADOBa9fQs4Bk3BHzhjmBI0` |
| In progress  | `d8943af3`                       |

Board moves are GraphQL-only, and GitHub's secondary rate limit for GraphQL
is easy to trip and slow to clear. Make each call below once. If one fails,
don't retry or loop: tell them which card to move by hand and carry on.

Find the epic over REST first. A 404 means the issue has no parent:

```sh
gh api repos/email-utils/<repo>/issues/<n>/parent \
  --jq '{number, state, repo: (.repository_url | split("/") | last)}'
```

Then look up the card for the issue, and for the epic if there is one, with
one query each:

```sh
gh api graphql -F issue=<n> -f repo=<repo> -f query='
  query($repo: String!, $issue: Int!) {
    repository(owner: "email-utils", name: $repo) {
      issue(number: $issue) {
        projectItems(first: 10) {
          nodes {
            id
            project { number }
            status: fieldValueByName(name: "Status") {
              ... on ProjectV2ItemFieldSingleSelectValue { name }
            }
          }
        }
      }
    }
  }' --jq '.data.repository.issue.projectItems.nodes[] | select(.project.number == 1) | {id, status: .status.name}'
```

If the issue isn't on the board (a package repo's issue with no parent on
it), add it and use the ID that comes back:

```sh
gh project item-add 1 --owner email-utils --url <html_url> --format json --jq .id
```

Move the issue to In progress, and the epic too unless it already is:

```sh
gh project item-edit --project-id PVT_kwDOBa9fQs4Bk3BH --id <item> \
  --field-id PVTSSF_lADOBa9fQs4Bk3BHzhjmBI0 --single-select-option-id d8943af3
```

Leave anything already In review or Done alone and mention it; it may mean
the work was done before. Never set an open issue to Done: "Auto-close
issue" closes it.

## 7. Report

Say briefly: the branch they're on and that it came from an up-to-date
`main`, the issue link, whether they're assigned, and where the issue and
epic now sit on the board, including any card they need to move by hand.
Then go straight on to the work; setting up isn't the finish line.

## 8. Start the work

Read what the issue needs before changing anything:

- The issue body and its comments:
  `gh api repos/email-utils/<repo>/issues/<n>/comments --jq '.[] | {user: .user.login, body}'`.
- The epic's body, if it has one, for the wider goal and conventions.
- Any issues or PRs it links, and earlier PRs for sibling issues in the same
  epic. Those show the house style for this kind of change.
- The code, config, or docs it touches, in this repo and in meta
  (`templates/`, `plugins/email-utils/`, `.github/`) when it builds on them.

Then do the work, matching the style of the files around it. When the issue
leaves a real decision open (a choice between approaches, a name the public
will see, anything that changes scope), ask before building on a guess.
Anything the code already answers, decide yourself.

Run the checks that cover what changed before calling it done: `npm run
pre-commit` and `npm run test:coverage` in a package, or `npm run lint` and
`npm run format:check` in meta.

Leave the changes uncommitted for them to review. Finish by summing up what
changed, what was checked, and anything left open. Tell them that once
they're happy with it, the `pr` skill commits it, opens the PR with a
`<type>(<scope>): …` title and a `Closes #<n>` line, and moves the card to
In review.
