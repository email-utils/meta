# Package templates

Shared configuration for every `@email-utils/*` package repo.

## `synced/`

Copied verbatim into each package and kept identical. Change a file here, never in a package:

```sh
mani run sync-config     # copy synced/ into every package
mani run check-config    # fail on any package whose copy has drifted
```

| File | Purpose |
|---|---|
| `.prettierrc`, `.prettierignore` | Prettier 3: `semi: true`, `singleQuote: true`, `trailingComma: all`, `endOfLine: lf` |
| `.oxlintrc.json` | oxlint with type-aware rules (`oxlint --type-aware`, via `oxlint-tsgolint`) |
| `tsconfig.json` | TypeScript 7, `strict`, `isolatedDeclarations`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| `vitest.config.ts` | Vitest 5, coverage-v8 thresholds (95% lines/functions/statements, 90% branches), type tests, benchmarks |
| `lefthook.yml` | pre-commit: lint, format:check, typecheck |
| `.nvmrc` | Node 24 LTS for development (packages support Node >= 22) |
| `.gitignore`, `LICENSE` | Build output and reports; MIT |

## `scaffold/`

Starting points for a new package. They're adjusted per package and not drift-checked.

| File | Adjust |
|---|---|
| `package.json` | Replace `__NAME__` and `__DESCRIPTION__`, add `exports` subpaths and `dependencies` |
| `tsdown.config.ts` | `entry` points, `platform` (`node` only for validator-dns), `deps.onlyBundle` for vendored data |
