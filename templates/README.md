# Package templates

Shared configuration for every `@email-utils/*` package repo.

## `synced/`

Copied verbatim into each package and kept identical. Change a file here, never in a package:

```sh
mani run sync-config     # copy synced/ into every package
mani run check-config    # fail on any package whose copy has drifted
```

`check-config` runs [`check-config.sh`](check-config.sh). So does meta's **Config drift** workflow, which checks each package's `main` daily and on any meta PR that changes `synced/`. On a template PR, that check stays red until every package has merged its sync PR, so rerun it once they have. It isn't a required check.

| File                                                            | Purpose                                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `.prettierrc`, `.prettierignore`                                | Prettier 3: `semi: true`, `singleQuote: true`, `trailingComma: all`, `endOfLine: lf`                          |
| `.oxlintrc.json`                                                | oxlint with type-aware rules (`oxlint --type-aware`, via `oxlint-tsgolint`)                                   |
| `tsconfig.json`                                                 | TypeScript 7, `strict`, `isolatedDeclarations`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`      |
| `vitest.config.ts`                                              | Vitest 5, coverage-v8 thresholds (95% lines/functions/statements, 90% branches), type tests, benchmarks       |
| `lefthook.yml`                                                  | pre-commit: lint, format:check, typecheck                                                                     |
| `.nvmrc`                                                        | Node 24 LTS for development (packages support Node >= 22)                                                     |
| `.gitignore`, `LICENSE`                                         | Build output and reports; MIT                                                                                 |
| `.github/workflows/pr-gate.yml`, `pr-title.yml`                 | Thin callers for meta's reusable PR workflows (`checks`, `test`, `pr-title`), pinned to a meta commit         |
| `.github/workflows/codeql.yml`, `scorecard.yml`                 | CodeQL (TypeScript and workflows) and OpenSSF Scorecard, reported to the Security tab                         |
| `.github/workflows/nightly.yml`                                 | `main` against the newest dependencies its ranges allow, with the lockfile dropped                            |
| `.github/dependabot.yml`, `workflows/dependabot-auto-merge.yml` | npm updates: `@email-utils/*` daily and auto-merged (majors excepted), everything else after a 7-day cooldown |

The workflows pin meta's workflows and actions by commit SHA, so a change to them reaches the packages only when the pin moves. To move it, point every `email-utils/meta` `uses:` in `synced/.github/workflows` at the new meta commit on `main`, then sync.

The packages' Dependabot updates npm only. Third-party action pins in these workflows are bumped here, by meta's Dependabot, and reach the packages through the next sync, so a package's copy never drifts.

## `scaffold/`

Starting points for a new package. They're adjusted per package and not drift-checked.

| File               | Adjust                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `package.json`     | Replace `__NAME__` and `__DESCRIPTION__`, add `exports` subpaths and `dependencies`             |
| `tsdown.config.ts` | `entry` points, `platform` (`node` only for validator-dns), `deps.onlyBundle` for vendored data |
