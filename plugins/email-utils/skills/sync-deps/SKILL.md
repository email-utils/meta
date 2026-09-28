---
name: sync-deps
description: Bump `@email-utils/*` dependencies in the packages that depend on them, in dependency order, with one `fix(deps)` PR per dependent. Takes a package and version, a package alone for its newest live version, or nothing to catch every dependent up. Checks the version is live on npm, skips anything Dependabot already has open, updates the range and lockfile in the dependent's clone, runs the checks CI gates on, and asks before committing, pushing, and opening each PR. It's the fast path when Dependabot's daily `@email-utils/*` run hasn't caught up, and the `release` skill uses it after each release.
argument-hint: '[package[@version]]'
disable-model-invocation: true
allowed-tools: Read, Bash(git rev-parse --show-toplevel), Bash(git remote get-url origin), Bash(npm view *)
---

# Sync `@email-utils/*` dependencies

The packages depend on each other in the order `mani.yaml` lists them:
syntax, then classifier, then sanitizer and dns. When one releases, its
dependents need a `fix(deps)` commit that raises their range to the new
version, so their own next release ships it. Dependabot opens those PRs once
a day as its `email-utils` group and auto-merges them when green. This skill
opens the same PRs straight away, one per dependent, and waits for the
person to say yes before anything is pushed.

It only bumps to versions already live on npm. A dependent's CI installs from
the registry, so a version that's staged and waiting for approval would fail
it. It also bumps one level at a time: after classifier takes a new syntax,
sanitizer only sees that change once classifier itself releases. The
`release` skill does that and comes back here for the next level.

Work only with the person's own sessions. Never run `gh auth token`,
`gh auth status --show-token`, or `npm token`, and never read `~/.npmrc`,
`~/.config/gh`, `~/.ssh`, or environment variables holding credentials.

Never merge these PRs or turn on auto-merge, and never force-push. Don't add
tool attribution to anything this skill writes: no `Co-Authored-By` trailer
and no "Generated with" line.

Use REST (`gh api repos/...`) for everything on GitHub. GraphQL's secondary
rate limit is easy to trip, and nothing here needs it.

## 1. Read the argument

Run `git rev-parse --show-toplevel`. The workspace root is the directory
holding `mani.yaml`, as in the `start` skill. The packages are the projects
tagged `package` in `mani.yaml`, listed in dependency order. Keep that order
throughout. Meta and `org-github` have no `@email-utils/*` dependencies.

- **`<package>@<version>`**, for example `validator-syntax@1.0.0-rc.2` or
  `@email-utils/validator-syntax@1.0.0-rc.2`: bump that package to that
  version in each package that depends on it.
- **`<package>`** alone: the same, with its newest live version (below).
- **Nothing**: every `@email-utils/*` dependency in every package, each to
  its newest live version. A package clone doesn't narrow this. The work
  happens in the dependents, not in the clone it's run from.

## 2. Find the versions

For each package being bumped, `<pkg>` is `@email-utils/<repo>`:

```sh
npm view <pkg> dist-tags versions --json
```

The **newest live version** is `next` when it's newer than `latest`, and
`latest` otherwise. That's `next` during the `rc`s. Compare versions by
semver precedence: `1.0.0-rc.10` is newer than `1.0.0-rc.9`, and `1.0.0` is
newer than any `1.0.0-rc.N`.

A version given in the argument must be in `versions`. If it isn't, stop and
say so. It's probably staged and waiting for approval, and the `release`
skill hands over the approval. Once it's live, run this again.

## 3. Find the dependents

Read each package's dependencies on `main`, not in the local clones, which
may be behind or on a branch:

```sh
gh api repos/email-utils/<repo>/contents/package.json \
  --jq '.content | @base64d | fromjson | {dependencies, peerDependencies, devDependencies}'
```

Keep only the `@email-utils/*` entries. A dependent lists the package in
`dependencies` or `peerDependencies`, often in `devDependencies` too, so
tests run against it. Bump it in every section that lists it.

For each dependent and dependency, the **new range** keeps the operator the
current range uses and moves its floor to the new version: `^1.0.0-rc.1`
becomes `^1.0.0-rc.2`, and an exact `1.0.0-rc.1` becomes `1.0.0-rc.2`. A
range that merely allows the new version isn't enough, since the release
this bump feeds has to guarantee the fix it's shipping. Skip a dependency whose
floor is already at or above the new version.

Treat these as their own findings, not as bumps to make silently:

- **A major bump**, `^1.x` to `2.0.0`. The dependent may need code changes,
  and Dependabot leaves majors for a person too. Plan it, but say the checks
  in section 6 decide whether it's a plain bump.
- **A peer dependency.** Raising a peer's floor raises it for everyone who
  installs the dependent. Say so in the plan.
- **A range the new version falls outside** in a way the operator doesn't
  explain, such as `<1.0.0`. Name it and leave it for the person.

Then look for bump PRs already open in each dependent, from Dependabot or
from an earlier run of this skill:

```sh
gh api 'repos/email-utils/<repo>/pulls?state=open&per_page=50' \
  --jq '.[] | select((.head.ref | startswith("dependabot/npm_and_yarn/")) or (.head.ref | startswith("fix/deps-"))) | select(.title | test("email-utils")) | {number, title, html_url, head: .head.ref, user: .user.login}'
```

A Dependabot PR that already bumps to the new version is the one to use:
link it and skip that dependent. It auto-merges once its checks pass,
unless it's a major. An open PR that bumps to an older version will be
superseded. Say so, and leave closing it to the person, or to Dependabot,
which closes its own when it's outdated.

## 4. Show the plan

Show one table in dependency order, one row per dependent: each dependency
it takes, its current range, the new range, which sections list it, and
what happens (a new PR, an open PR that covers it, already current, or held
back with the reason). Then list the findings from section 3.

With nothing to bump, say so and stop. Otherwise ask once whether to go
ahead with the plan. Each PR still gets its own yes in section 7, with its
diff in front of them.

## 5. Branch in the dependent's clone

Work in `<workspace>/<repo>`, one dependent at a time, in `mani.yaml` order.
If the clone is missing, stop for this dependent and point to the `setup`
skill, which clones it with `mani sync`.

Run `git status --porcelain` there. If it prints anything, stop for this
dependent, as the `start` skill does. Switching to `main` would carry those
changes along or fail, so let them commit, stash, or discard it themselves.

The branch is `fix/deps-<dependency repo>-<version>` for a single
dependency, for example `fix/deps-validator-syntax-1.0.0-rc.2`, and
`fix/deps-email-utils-<yyyy-mm-dd>` when it bumps several. Check that it
doesn't exist yet, locally or on `origin`:

```sh
git fetch --prune origin
git branch --all --list '*fix/deps-*'
```

Then cut it from an up-to-date `main`:

```sh
git switch main
git pull --ff-only
git switch -c <branch>
```

If `git pull --ff-only` fails, local `main` has commits `origin/main`
doesn't. Stop and report it; don't reset or rebase their `main`.

## 6. Bump and check

Set the new range in each section that lists the dependency, then let npm
update the lockfile:

```sh
npm pkg set 'dependencies.@email-utils/<dep>=<new range>'
npm pkg set 'devDependencies.@email-utils/<dep>=<new range>'
npm install
npm ls @email-utils/<dep>
```

Use `peerDependencies.` for a peer, and set only the sections that already
list it. `npm ls` should show the new version everywhere it appears. Then
`git diff --stat` should show only `package.json` and `package-lock.json`.
Anything else changing means `npm install` did more than the bump. Show it
and ask before going on.

Run what CI gates on, from the clone's root, and stop at the first failure:

```sh
npm run pre-commit
npm run test:coverage
npm run build && npm run check:package
```

A failure means the new version breaks this dependent. That's the reason to
run the checks here rather than leave it to CI. Show the relevant output
and stop for this dependent: fixing it is real work on its own issue, and
the PR then isn't a plain `fix(deps)` bump. Leave the branch as it is and
say so.

When the dependent has an `api/` directory, check `git diff -- api/`. The
dependency's types can reach the dependent's public API through re-exports.
A change there needs `!` in the title, as the `pr` skill's section 4
explains. Ask rather than decide.

## 7. Get the go-ahead

The title is `fix(deps): bump @email-utils/<dep> to <version>`. With several
dependencies, it's `fix(deps): bump @email-utils/* dependencies`, with each
one listed in the body. `fix` makes the dependent's next release ship the
bump as a patch, or as the next `rc` while it's a prerelease. Check both
against `plugins/email-utils/commit-conventions.json` under the workspace
root, as the `pr` skill does.

The body is the template from `org-github/PULL_REQUEST_TEMPLATE.md`:

- **Summary.** Each dependency with its old and new range, a link to the
  new version's GitHub release, and the headings from its changelog, so a
  reviewer sees what the bump brings in. Say it came from this skill rather
  than Dependabot only if that helps, for example when a Dependabot PR is
  also open.
- **Closes.** Drop the line. These PRs don't close an issue. If the bump is
  for one, use `Closes email-utils/<repo>#<n>`, as in the `pr` skill.
- **Checklist.** Tick the title and the tests, since section 6 ran them.
  Mark the docs item not applicable.

Show the diff (`git diff`, with the lockfile summarized, not printed), the
title, and the full body. Then ask whether to commit, push, and open it. Let
them edit the title or body first. Don't do any of it without a yes.

## 8. Commit, push, and open

Stage only the two files, and commit with the title as the message.
lefthook reruns the pre-commit checks.

```sh
git add package.json package-lock.json
git commit -m '<title>'
git push -u origin HEAD
gh api -X POST repos/email-utils/<repo>/pulls \
  -f title='<title>' -f head='<branch>' -f base=main -F body=@<body-file> \
  --jq '{number, html_url}'
```

Write the body to a temporary file so Markdown survives the shell. If the
push is rejected, stop and report it.

Then switch the clone back to `main` and go on to the next dependent.

## 9. Report

End with a table in dependency order: each dependent, the dependencies it
took and their new ranges, and the PR (new, or the Dependabot one it relies
on), or why it was held back. Then list what's left and who does it:

- PRs to review and merge. Nothing ships until they merge and the dependent
  releases. The `release` skill waits on them before merging that
  dependent's release PR.
- Dependents held back by a failing check, a major bump, or a dirty working
  tree, with the evidence.
- The next level: once a dependent with its own dependents releases, run
  this skill again for it, for example `sync-deps classifier`, or let the
  `release` skill do it.

Suggest the `release-status` skill to see where each package stands.
