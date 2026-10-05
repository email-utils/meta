---
name: release
description: Release @email-utils packages in dependency order. For each package it checks the release-please PR, asks before merging it, watches the Release workflow, shows the version staged on npm and hands over the `npm stage approve` command, then verifies the live version, dist-tag, provenance, and GitHub release before bumping the dependents. `--final` switches a package from `rc` prereleases to its final version. `--dry-run` prints the plan and changes nothing.
argument-hint: '[repo|all] [--rc|--final] [--dry-run]'
disable-model-invocation: true
allowed-tools: Read, Bash(git rev-parse --show-toplevel), Bash(git remote get-url origin), Bash(npm whoami), Bash(npm view *), Bash(npm stage list *), Bash(npm stage view *)
---

# Release packages

Each package releases through meta's reusable `release.yml`. release-please
keeps a release PR open with the next version and changelog. Merging it tags
the release and creates the GitHub release. Then the workflow builds the
tarball and stages it on npm with provenance, `next` for a prerelease
(`1.0.0-rc.1`) and `latest` otherwise. Nothing goes live until a maintainer
approves the stage with 2FA. This skill walks that flow one package at a
time, in dependency order, and stops for the person at every step that
merges or publishes.

Work only with the person's own sessions. Never run `gh auth token`,
`gh auth status --show-token`, or `npm token`, and never read `~/.npmrc`,
`~/.config/gh`, or environment variables holding credentials. Never run
`npm stage approve` or `npm stage reject` yourself, even when asked: both
prompt for 2FA, so hand over the command for them to run with `!`.

Never turn on auto-merge, force-push, edit a manifest or changelog by hand,
or create tags or GitHub releases yourself. release-please owns those. Don't
add tool attribution to anything this skill writes: no `Co-Authored-By`
trailer and no "Generated with" line.

Use REST (`gh api repos/...`) for everything on GitHub. GraphQL's secondary
rate limit is easy to trip, and nothing here needs it.

## 1. Read the arguments

- **Packages.** `all`, a package (`classifier`), or nothing. With nothing,
  a package clone means that package. `git remote get-url origin` confirms
  which. Meta's root or `org-github` means ask, listing the packages. Meta
  and `org-github` aren't released.
- **Mode.** `--rc` or `--final`, or neither. See section 3.
- **`--dry-run`.** Gather and report, then stop. It merges, opens, and
  approves nothing, and it doesn't ask.

Run `git rev-parse --show-toplevel`. The workspace root is the directory
holding `mani.yaml`, as in the `start` skill. The packages are the projects
tagged `package` in `mani.yaml`, listed in dependency order. Keep that order
throughout, including for a single package's dependents.

## 2. Gather the state

Read `plugins/email-utils/skills/release-status/SKILL.md` under the
workspace root and gather everything its section 2 lists, for each chosen
package and for each `@email-utils/*` package they depend on. Then run its
section 3 checks. Read the release-please config as well, since the mode
depends on it:

```sh
gh api repos/email-utils/<repo>/contents/release-please-config.json \
  --jq '.content | @base64d | fromjson | .packages["."]'
```

The package is in **rc mode** when `prerelease` is `true`, and in **final
mode** otherwise.

## 3. Plan the release

Settle what happens to each package before touching any:

- **Mode.**
  - `--rc`: the package must be in rc mode. If it's in final mode, leave
    it out and say so. Going back to prereleases is a config change for a
    reviewed PR, not something this skill does.
  - `--final`: a package in rc mode first needs the switch in section 4.
    One already in final mode just releases.
  - Neither: release in whatever mode the config says, and name it in the
    plan.
- **Something to release.** The package needs an open release PR, or, with
  `--final`, a prerelease version to finish. A package with neither is
  skipped. Say whether it has unreleased commits that don't cause a release
  (only `bump: none` types).
- **Blockers.** release-status's flags that stop a package here: a version
  staged but not approved (approve it or reject it first), a red `main`, a
  failed Release run that never staged, and a dependency that isn't live
  yet. A dependency released in this same run isn't a blocker; it goes
  first.
- **Version.** In rc mode, the release PR's `1.0.0-rc.N`. With `--final`,
  the manifest version without its prerelease part: `1.0.0-rc.3` becomes
  `1.0.0`. In final mode, the release PR's version.

Show the plan as a table in dependency order, one row per package: current
live version and dist-tag, the version this run releases and its dist-tag
(`next` for a prerelease, `latest` otherwise), the release PR, and blockers.
Add one line per package with its changelog headings from the release PR
body. With `--dry-run`, end here with the steps a real run would take.

Otherwise ask once whether to go ahead with the plan. Each merge still gets
its own yes later, with the PR in front of them.

## 4. Switch to final (`--final` only)

Skip this for a package already in final mode.

In rc mode, release-please only moves the `rc` number. Setting `prerelease`
to `false` makes it drop the prerelease part instead, so `1.0.0-rc.3` is
followed by `1.0.0`, and later versions follow the usual semver bumps. That
alone only takes effect on the next `feat` or `fix`, though, and a `chore`
commit on its own cuts no release. A `Release-As` footer forces one: it
un-hides its commit in the changelog and sets the version.

Make the change on a branch in the package clone, from an up-to-date
`main`. Stop if the working tree isn't clean, as the `start` skill does.

```sh
git switch main
git pull --ff-only
git switch -c chore/release-<version>
```

In `release-please-config.json`, set `packages["."].prerelease` to `false`
and leave the rest alone. Keep `"versioning": "prerelease"` and
`"prerelease-type": "rc"`: with `prerelease` off, versioning produces final
versions, and a later rc cycle only needs `prerelease` set back. Run
`npx prettier --check release-please-config.json` if the package has
prettier.

Show the diff and the PR you'll open, and ask before committing, pushing,
and opening it:

- **Title:** `chore: switch to final releases`.
- **Body:** the PR template from `org-github/PULL_REQUEST_TEMPLATE.md`,
  with a summary saying this ends the `rc` cycle and releases `<version>`
  from what `v<last rc>` shipped. Its last paragraph must be the footer
  alone, since the squash commit takes the PR body:

  ```text
  Release-As: <version>
  ```

```sh
git add release-please-config.json
git commit -m 'chore: switch to final releases' -m 'Release-As: <version>'
git push -u origin HEAD
gh api -X POST repos/email-utils/<repo>/pulls \
  -f title='chore: switch to final releases' -f head='chore/release-<version>' \
  -f base=main -F body=@<body-file> --jq '{number, html_url}'
```

Its PR gate runs normally. When it's green, ask before merging it (section
6 shows how). The Release run for that merge updates the release PR to
`<version>`. Wait for that run to finish (section 7 shows how to find it),
then read the release PR again and check that its title says `<version>`
before going on to section 5 with it.

## 5. Get the release PR ready

For each package in order, find its release PR. It comes from a
`release-please--` branch and is titled `chore: release <version>`.

Its checks are often missing at first. release-please opens it with the
org's release app, so its PR gate waits until someone approves the workflow
run. Look for runs waiting on that:

```sh
gh api 'repos/email-utils/<repo>/actions/runs?head_sha=<head_sha>&status=action_required' \
  --jq '.workflow_runs[] | {id, name, html_url}'
```

Give them each run's link to approve in the browser, then check again when
they say it's done. Approving runs is theirs to do.

When the checks are in, it's ready once every check run has passed and
`mergeable_state` is `clean`. On a failure, show the failing check and its
log link, and stop for this package. A failure here is a bug on `main`, not
something to merge past. Its dependents wait too.

## 6. Merge the release PR

Show the release PR: its link, its version, the dist-tag it'll go to, and
the changelog from its body. Ask whether to merge it. Nothing is live after
the merge, but the tag and the GitHub release are, and there's no clean way
to take those back.

With a yes, squash-merge it over REST. Passing the head SHA makes GitHub
refuse the merge if the PR changed after they looked:

```sh
gh api -X PUT repos/email-utils/<repo>/pulls/<number>/merge \
  -f merge_method=squash -f sha=<head_sha> --jq '{merged, sha}'
```

If it's refused, read the PR again and show what changed before asking
again. Don't retry blindly.

## 7. Watch the Release run

The merge pushes to `main`, which starts `release.yml`. Find the run for
the merge commit:

```sh
gh api 'repos/email-utils/<repo>/actions/workflows/release.yml/runs?head_sha=<merge sha>' \
  --jq '.workflow_runs[] | {id, status, conclusion, html_url}'
```

It can take a few seconds to appear, and it waits for any earlier Release
run to finish first. Check again a few times, about 15 seconds apart, and
stop after a couple of minutes with the Actions link if it's still missing.

Then watch it until it finishes:

```sh
gh run watch <id> --repo email-utils/<repo> --exit-status
```

The jobs are `release-please`, `build`, and `publish`. On a failure, list
the jobs with their conclusions, show the failing step's log (`gh run view
<id> --repo email-utils/<repo> --log-failed`), and stop for this package:

- `release-please` or `build` failed: nothing was staged. A `build` failure
  after the tag means the GitHub release exists without an npm version.
  Say so, since fixing it takes a new release.
- `publish` failed: the tag and GitHub release exist, but nothing was
  staged. Show the error, since it's usually trusted-publisher setup (see
  `templates/README.md`).

## 8. Hand over the approval

Find the stage. With `npm whoami` working:

```sh
npm stage list @email-utils/<repo> --json
npm stage view <stage-id>
```

Show its version, dist-tag, file list, and provenance, and check them
against the plan: the version and dist-tag match, the files are the ones
`package.json`'s `files` covers, and provenance is there. If anything's
off, say so and suggest `! npm stage reject <stage-id>` instead.

If `npm whoami` fails, don't try to fix the login. Point them to the stage
ID in the Release run's summary (the `publish` job), or have them run
`! npm login` first so you can show it.

Then hand over the approval and wait for them:

```text
! npm stage approve <stage-id>
```

npm may hold the stage until its malware scan finishes. They can also
approve from the package's Staged Packages tab on npmjs.com.

## 9. Verify it's live

Once they say it's approved, check:

```sh
npm view @email-utils/<repo>@<version> version dist.attestations --json
npm view @email-utils/<repo> dist-tags --json
gh api repos/email-utils/<repo>/releases/tags/v<version> \
  --jq '{tag_name, prerelease, html_url, assets: [.assets[].name]}'
```

- The version resolves, with a `provenance.predicateType` of
  `https://slsa.dev/provenance/v1`.
- The dist-tag the plan named points at it: `next` for a prerelease,
  `latest` otherwise. `latest` still holds the last final version while
  `next` moves.
- The GitHub release exists, and its `prerelease` matches the version.

npm can take a minute to show a new version. If it's missing, check once
more after about 30 seconds, then report what's missing rather than
looping.

## 10. Bump the dependents

Every later package in `mani.yaml` whose `dependencies` or
`peerDependencies` name this package needs the new version, and it has to
land before that package's own release PR is merged. Open those bump PRs
the way the `sync-deps` skill does: read
`plugins/email-utils/skills/sync-deps/SKILL.md` under the workspace root and
follow it for `@email-utils/<repo>@<version>`, including its asks. If the
file isn't there, list each dependent with the range it has and the one it
needs, and say Dependabot's daily `@email-utils/*` update will open them.

A dependent released in this same run waits for its bump PR to merge. Its
release PR then picks the bump up as a `fix(deps)` change, so read the
release PR again before section 5.

Then go on to the next package.

## 11. Report

End with a table in dependency order: each package's released version and
dist-tag, provenance (✓ or ✗), the GitHub release link, and any bump PRs
opened. Then list what's left and who does it: stages still waiting on
approval (with the `! npm stage approve <id>` line), packages stopped by a
failure (with the run or check link), and bump PRs to review. Suggest the
`release-status` skill for a fresh look later.
