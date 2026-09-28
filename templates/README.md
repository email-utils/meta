# Package templates

Shared configuration for every `@email-utils/*` package repo.

## `synced/`

Copied verbatim into each package and kept identical. Change a file here, never in a package:

```sh
mani run sync-config     # copy synced/ into every package
mani run check-config    # fail on any package whose copy has drifted
```

`check-config` runs [`check-config.sh`](check-config.sh). So does meta's **Config drift** workflow, which checks each package's `main` daily and on any meta PR that changes `synced/`. On a template PR, that check stays red until every package has merged its sync PR, so rerun it once they have. It isn't a required check.

| File                                                            | Purpose                                                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `.prettierrc`, `.prettierignore`                                | Prettier 3: `semi: true`, `singleQuote: true`, `trailingComma: all`, `endOfLine: lf`                                            |
| `.oxlintrc.json`                                                | oxlint with type-aware rules (`oxlint --type-aware`, via `oxlint-tsgolint`)                                                     |
| `tsconfig.json`                                                 | TypeScript 7, `strict`, `isolatedDeclarations`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`                        |
| `vitest.config.ts`                                              | Vitest 5, coverage-v8 thresholds (95% lines/functions/statements, 90% branches), type tests, benchmarks                         |
| `lefthook.yml`                                                  | pre-commit: lint, format:check, typecheck                                                                                       |
| `.nvmrc`                                                        | Node 24 LTS for development (packages support Node >= 22)                                                                       |
| `.gitignore`, `LICENSE`                                         | Build output and reports; MIT                                                                                                   |
| `.github/workflows/pr-gate.yml`, `pr-title.yml`                 | Thin callers for meta's reusable PR workflows (`checks`, `test`, `pr-title`), pinned to a meta commit                           |
| `.github/workflows/codeql.yml`, `scorecard.yml`                 | CodeQL (TypeScript and workflows) and OpenSSF Scorecard, reported to the Security tab                                           |
| `.github/workflows/nightly.yml`                                 | `main` against the newest dependencies its ranges allow, with the lockfile dropped                                              |
| `.github/workflows/release.yml`                                 | Caller for meta's reusable release workflow: release-please, then a staged npm publish. npm's trusted publisher names this file |
| `.github/dependabot.yml`, `workflows/dependabot-auto-merge.yml` | npm updates: `@email-utils/*` daily and auto-merged (majors excepted), everything else after a 7-day cooldown                   |

The workflows pin meta's workflows and actions by commit SHA, so a change to them reaches the packages only when the pin moves. To move it, point every `email-utils/meta` `uses:` in `synced/.github/workflows` at the new meta commit on `main`, then sync.

The packages' Dependabot updates npm only. Third-party action pins in these workflows are bumped here, by meta's Dependabot, and reach the packages through the next sync, so a package's copy never drifts.

## `scaffold/`

Starting points for a new package. They're adjusted per package and not drift-checked.

| File                            | Adjust                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `package.json`                  | Replace `__NAME__` and `__DESCRIPTION__`, add `exports` subpaths and `dependencies`                            |
| `tsdown.config.ts`              | `entry` points, `platform` (`node` only for validator-dns), `deps.onlyBundle` for vendored data                |
| `release-please-config.json`    | Nothing to start. `prerelease: false` switches from `1.0.0-rc.N` to `1.0.0`                                    |
| `.release-please-manifest.json` | Nothing. It seeds the version so the first release is `1.0.0-rc.1`, and release-please updates it from then on |

## Releases

The release PR's version comes from `.release-please-manifest.json`, not `package.json`, and each merged `feat`, `fix`, or breaking change moves it on. With the `prerelease` versioning in the scaffold config, anything from `1.0.0-rc.0` moves only the rc number, so every change before the final release is `1.0.0-rc.N`. Setting `prerelease` to `false` makes the next release `1.0.0`, and after that versions follow the usual semver bumps.

Before a package's first release, its npm trusted publisher must name `release.yml`, with direct publishing disallowed:

```sh
npm trust github @email-utils/<name> --repo email-utils/<name> --file release.yml --allow-stage-publish
```

The workflow needs the org's release GitHub App, through the `RELEASE_APP_CLIENT_ID` variable and `RELEASE_APP_PRIVATE_KEY` secret, installed on the package repo.
