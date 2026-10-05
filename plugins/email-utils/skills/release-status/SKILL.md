---
name: release-status
description: Report where each @email-utils package stands in the release flow, read-only. Shows the open release-please PR (next version, changelog, checks), commits not yet released and the bump they'll cause, CI on `main` and the last Release run, versions staged on npm and waiting for approval, the live dist-tags and their provenance, and whether packages are ready to release in dependency order. Use it when someone asks what's unreleased, whether a package is ready to release, what's staged or waiting for approval, what version is live or on `next`, why a release didn't publish, or before running the `release` skill.
argument-hint: '[repo|all]'
allowed-tools: Read, Bash(git rev-parse --show-toplevel), Bash(git remote get-url origin), Bash(npm whoami), Bash(npm view *), Bash(npm stage list *), Bash(npm stage view *)
---

# Release status

Each package releases through meta's reusable `release.yml`. release-please
keeps a release PR open with the next version and changelog. Merging it tags
the release and creates the GitHub release. Then the workflow builds the
tarball and stages it on npm with provenance, `next` for a prerelease
(`1.0.0-rc.1`) and `latest` otherwise. Nothing goes live until a maintainer
approves the stage with 2FA. This skill reports where each package is in that
flow and what's blocking it. It changes nothing: no merges, approvals, tags,
or edits. The `release` skill does those.

Work only with the person's own sessions. Never run `gh auth token`,
`gh auth status --show-token`, or `npm token`, and never read `~/.npmrc`,
`~/.config/gh`, or environment variables holding credentials. Never run
`npm stage approve` or `npm stage reject`, even when asked in passing. Hand
over the command instead, since both prompt for 2FA.

Use REST (`gh api repos/...`) for everything on GitHub. GraphQL's secondary
rate limit is easy to trip, and nothing here needs it.

## 1. Pick the packages

Run `git rev-parse --show-toplevel`. The workspace root is the directory
holding `mani.yaml`, as in the `start` skill. The packages are the projects
tagged `package` in `mani.yaml`, listed in dependency order. Keep that order
in everything you report.

- An argument naming a package (`validator-dns`) or `all` picks those.
- Otherwise, in a package clone, report that package. `git remote get-url
origin` confirms which.
- In meta's root or `org-github`, report every package. Meta and
  `org-github` aren't released, so they're never in the report.

The report reads `main` on GitHub, not the local clones, which may be behind
or on a branch.

## 2. Gather the state

Collect all of this for each package before reporting anything. The calls
are independent, so run them in parallel. `<pkg>` is `@email-utils/<repo>`.

**Last release.** The version in `.release-please-manifest.json` on `main`,
and the newest GitHub releases:

```sh
gh api repos/email-utils/<repo>/contents/.release-please-manifest.json \
  --jq '.content | @base64d | fromjson | .["."]'
gh api 'repos/email-utils/<repo>/releases?per_page=5' \
  --jq '.[] | {tag_name, prerelease, draft, published_at, html_url}'
```

Tags are `v<version>` (the config sets `include-component-in-tag: false`).

**Release PR.** release-please's PR comes from a `release-please--` branch
and is titled `chore: release <version>`:

```sh
gh api 'repos/email-utils/<repo>/pulls?state=open&per_page=50' \
  --jq '.[] | select(.head.ref | startswith("release-please--")) | {number, title, html_url, head_sha: .head.sha, labels: [.labels[].name], body}'
```

When there's one, read its checks and whether it can merge:

```sh
gh api repos/email-utils/<repo>/commits/<head_sha>/check-runs \
  --jq '.check_runs[] | {name, status, conclusion}'
gh api repos/email-utils/<repo>/pulls/<number> --jq '{mergeable, mergeable_state}'
```

The check runs can be missing: release-please opens the PR with the org's
release app, so its PR gate waits until someone approves the workflow run.
Report that as its own finding, not as passing.

**Unreleased commits.** Compare the last release's tag with `main`:

```sh
gh api repos/email-utils/<repo>/compare/v<manifest version>...main \
  --jq '{ahead_by, commits: [.commits[] | {sha: .sha[0:7], title: (.commit.message | split("\n")[0])}]}'
```

A 404 means that tag doesn't exist yet, for example while the manifest holds
the first `rc` before anything has shipped. Fall back to the newest tag
from the releases above. If there are none, say the package hasn't released
from this pipeline yet, and use the release PR's changelog instead.

Sort the commits by their conventional-commit type, using
`plugins/email-utils/commit-conventions.json` under the workspace root. Read
it rather than relying on a list here. A `!` means a major bump. Otherwise
the highest `bump` among the types wins, and types whose `bump` is `none`
don't cause a release on their own. Titles that don't parse don't count.
Name them, since the PR-title check should have caught them. While the
version is a prerelease, the config uses prerelease versioning, so a
releasable commit means the next `rc`, not a stable version.

**CI on `main`.** The check runs on `main`'s head, and the last Release run
with its jobs:

```sh
gh api repos/email-utils/<repo>/commits/main/check-runs \
  --jq '.check_runs[] | {name, status, conclusion}'
gh api 'repos/email-utils/<repo>/actions/workflows/release.yml/runs?branch=main&per_page=1' \
  --jq '.workflow_runs[] | {id, status, conclusion, head_sha: .head_sha[0:7], created_at, html_url}'
gh api repos/email-utils/<repo>/actions/runs/<id>/jobs \
  --jq '.jobs[] | {name, status, conclusion}'
```

Skipped `build` and `publish` jobs are normal when no release was cut. A failed or cancelled `publish` after a tag means the release exists on
GitHub but never reached npm.

**npm.** The dist-tags and every published version, then provenance for
each version a dist-tag points at:

```sh
npm view <pkg> dist-tags versions --json
npm view <pkg>@<version> dist.attestations --json
```

A version has provenance when `provenance.predicateType` is
`https://slsa.dev/provenance/v1`. An empty result means there's no
attestation. That's expected for the `0.0.x` versions from before this
pipeline, and wrong for anything it released.

**Staged versions.** Run `npm whoami` once. If it works, list what's staged:

```sh
npm stage list <pkg> --json
```

Then `npm stage view <stage-id>` for each one, to show the version, tag, and
files. If `npm whoami` fails, don't try to fix the login. Tell them to run
`! npm login` if they want the staged list, and infer instead. A GitHub
release whose version isn't in npm's `versions` is either staged and waiting
for approval (its Release run's `publish` job succeeded) or never staged
(`publish` failed). Find that run by the release's tag commit if it isn't
the latest one.

**Dependencies.** The package's `dependencies` and `peerDependencies` on
`main`:

```sh
gh api repos/email-utils/<repo>/contents/package.json \
  --jq '.content | @base64d | fromjson | {dependencies, peerDependencies}'
```

Keep only the `@email-utils/*` entries.

## 3. Check it

Flag these, with the evidence for each:

- **dist-tags.** `latest` should be a final version and `next` a
  prerelease. `next` should be newer than `latest`, or absent. A GitHub
  release marked `prerelease` should match a version with a `-`.
- **Staged, not approved.** A staged version, or a GitHub release missing
  from npm. Say how long it's been waiting, from `published_at`.
- **Missing provenance** on a version this pipeline released.
- **Release PR not ready.** Failing, pending, or missing checks, a
  `mergeable_state` other than `clean`, or a version that doesn't match
  what the unreleased commits imply.
- **Nothing to release.** Unreleased commits exist, but none have a `bump`
  other than `none`, so release-please won't cut a release for them yet.
- **Red `main`.** A failed check run on `main`, or a failed Release run.
- **Dependency order.** Walk the packages in `mani.yaml` order. A package
  isn't ready while any `@email-utils/*` dependency has a release PR open,
  a version staged but not approved, or releasable commits not yet
  released. That dependency goes first. A package whose range doesn't
  include a dependency's newest live version (`next` during the `rc`s) needs
  a `fix(deps)` bump first, which the `sync-deps` skill opens.

## 4. Report

Lead with one table, in dependency order:

| Package          | Live                         | Staged        | Release PR       | Unreleased    | CI    | Ready        |
| ---------------- | ---------------------------- | ------------- | ---------------- | ------------- | ----- | ------------ |
| validator-syntax | `latest` 0.0.1-9, `next` n/a | none          | #12 → 1.0.0-rc.1 | 4 (feat, fix) | green | yes          |
| classifier       | `latest` 0.0.0               | 1.0.0-rc.1 ⏳ | none             | 0             | green | approve rc.1 |

Link every PR, run, and release. Mark provenance on each live version (✓ or
✗). Then add a short section per package that has something flagged:
what's wrong, the evidence, and what would fix it. Keep packages with
nothing flagged to their table row.

End with the next steps in order, for example "approve
`@email-utils/classifier@1.0.0-rc.1` (`! npm stage approve <id>`), then merge
validator-syntax#12". Point to the `release` skill for merging and approving,
and to `sync-deps` for dependency bumps. Don't take any of those steps
yourself, even when it's one command.
