# API conventions

The rules every `@email-utils` package follows in v1. Package pages link here
instead of repeating them; the open questions live in [Decisions](#decisions)
blocks at the end of each page, numbered so review comments can address them
one by one. This page is written as if each recommendation were accepted —
overriding a decision changes the corresponding section.

Fixed by the [v1 API design epic](https://github.com/email-utils/meta/issues/13)
and not up for review here: discriminated `{ ok, reason }` results, `isX()`
booleans, `createX(options)` factories, stable reason codes, named exports
only, and nothing ever logs.

## Results

Every validation-shaped function returns a discriminated result rather than a
bare boolean or a throw:

```ts
type Result<T> =
  | { ok: true; value: T }
  | { ok: false; reason: ReasonCode; message?: string; index?: number };
```

- `value` carries the artifact the caller was after (a parsed address, a
  normalized email, DNS signals), so results thread through a pipeline and map
  onto [Standard Schema](https://github.com/email-utils/meta/issues/54)'s
  `{ value } | { issues }` split. (D4)
- `reason` is a stable code from the [reason-code catalogue](./reason-codes.md).
  A failure carries exactly one code — the first check that failed. (D3)
- `message` is an English explanation for humans and logs. It is **not**
  semver-stable; branch on `reason`, never on `message`. `index` is the
  offending position in the input where one exists (syntax only). (D5)

Classification is not pass/fail, so classifier lookups return plain data
(`isDisposable()` returns a boolean, `classify()` returns a data object)
rather than a forced `{ ok: true }` wrapper. The result shape is for
_validation_. (C3, on the [classifier page](./classifier.md))

## Reason codes

Codes are dotted lowercase — `<package>.<subject>.<problem>` — with the
package prefix baked in: `syntax.local.too_long`, `dns.mx.none`. (D2) All
packages share one registry, catalogued in
[reason-codes.md](./reason-codes.md), so the future umbrella package
([#52](https://github.com/email-utils/meta/issues/52)) gets a single
namespace for free while each code stays self-identifying when a package is
used standalone. (D1)

Stability: existing codes never change meaning or disappear within a major
version. New codes may appear in a minor version, so exhaustive `switch`
statements need a default arm.

## Errors

Packages throw only for programmer errors, and only `TypeError`: input that
is not a string, or options that are malformed. Anything that _is_ a string —
including the empty string — is data, and data problems come back as
`{ ok: false }` results. Transport failures in validator-dns (timeouts,
SERVFAIL) are also results, not throws. (D6)

This changes the sanitizer, which in 0.0.1 throws on an empty string.

## Functions

Each package exports up to three shapes of the same behavior:

1. **A detailed function** returning a `Result` (or plain data for classifier
   lookups): `parseAddress`, `normalizeEmail`, `checkDns`.
2. **An `isX()` boolean** that is documented sugar over it —
   `isValidSyntax(s, opts)` is exactly `parseAddress(s, opts).ok` — so the
   boolean and result forms can never disagree. (D8)
3. **A `createX(options)` factory** that pre-binds options (and, for dns,
   holds the resolver and cache) and returns the bound set. Factories are the
   primary API and use package-distinct names — `createSyntaxValidator`,
   `createClassifier`, `createSanitizer`, `createDnsValidator` — so the
   umbrella package can re-export them without collisions. The top-level
   functions are the same code with default options. (D9)

## Sync and async

validator-syntax, classifier, and sanitizer are synchronous: they do no I/O,
and the 0.0.1 async `validate` in validator-syntax becomes sync in v1. Only
validator-dns is async. This matches the umbrella pipeline's split — sync on
the client, DNS on the server. (D7)

## Modules

- Named exports only; no default exports anywhere. (epic, scaffold) This is
  not a tree-shaking measure: bundlers drop an unused default export as
  readily as an unused named one. The reasons are CommonJS interop (every
  package ships ESM and CJS, and a default export reaches `require()`
  callers as `.default`, which the attw checks flag) and stable names the
  umbrella package can re-export without renaming.
- Tree shaking comes from ESM builds, `"sideEffects": false` (already set in
  every package), standalone functions in place of the 0.0.1 classes (a
  class ships all its methods to anyone who imports it), and the data
  subpaths below. Each package's per-entry size budgets measure the result
  (validator-syntax#15, classifier#11, sanitizer#8, validator-dns#11).
- Platform-neutral builds (browser and Node), except validator-dns, which is
  Node-only. (scaffold)
- Subpath entries exist only where they carry heavy tree-shakeable data:
  `@email-utils/classifier/providers` and `@email-utils/classifier/disposable`,
  plus `@email-utils/validator-syntax/fixtures`, the test corpus that
  dependents and the docs read, and `@email-utils/classifier/sources`, the
  registry's citations. Everything else lives at the root. (D10)
- No package ever writes to the console. (epic)

## Forward compatibility

Non-normative notes for the post-v1 issues:

- **Umbrella pipeline** ([#52](https://github.com/email-utils/meta/issues/52)):
  `normalize → syntax → classify` runs sync client-side; dns joins async
  server-side. The shared reason-code registry and `value`-carrying results
  above are what make that composition possible.
- **Standard Schema** ([#54](https://github.com/email-utils/meta/issues/54)):
  `{ ok: true, value }` maps to `{ value }`; `{ ok: false, reason, message }`
  maps to one issue. Nothing in v1 blocks the adapter.

## Decisions

Each ID below is written into the page above as if accepted. Approve or
override per ID in the PR review; overrides get folded into this page before
merge.

- **D1 — Reason-code namespacing.** (a) one shared unprefixed namespace;
  (b) per-package codes, umbrella prefixes later; **(c) shared registry with
  the package prefix baked into each code — recommended**: #52 gets its
  single namespace, codes stay self-identifying standalone.
- **D2 — Code format.** **(a) dotted lowercase `syntax.local.too_long` —
  recommended**: the dot separates the D1 prefix and groups the catalogue;
  (b) `SYNTAX_LOCAL_TOO_LONG`; (c) `syntax-local-too-long`. Note that
  [validator-dns#7](https://github.com/email-utils/validator-dns/issues/7)
  already writes `INVALID_SYNTAX`, which is style (b); whichever option wins,
  that issue gets updated to match.
- **D3 — One reason or many.** **(a) single `reason`, first failure —
  recommended**: the epic's shape, and short-circuiting validators are
  simpler and faster; (b) add `reasons: ReasonCode[]`. An optional `reasons`
  can be added later without a breaking change.
- **D4 — Success payload.** (a) bare `{ ok: true }` for validators;
  **(b) always `{ ok: true, value }` — recommended**: uniform, maps to
  Standard Schema, threads the umbrella pipeline.
- **D5 — Failure detail.** (a) code only; **(b) code + optional
  non-semver-stable `message`, plus `index` for syntax — recommended**:
  message is debuggability, the code stays the contract.
- **D6 — Throw vs result.** (a) never throw, even on non-string input;
  **(b) `TypeError` for programmer errors (non-string input, bad options),
  results for all data errors — recommended**: invalid options are bugs, not
  data. Under (b) the sanitizer stops throwing on empty string.
- **D7 — Sync vs async.** **(a) only validator-dns async — recommended**: no
  I/O in the other three, and #52 assumes the split. Headline change: syntax
  `validate` goes sync; (b) everything async for uniformity.
- **D8 — `isX()` role.** **(a) documented sugar over the detailed function —
  recommended**: one behavior, two ergonomics, can never disagree;
  (b) `isX()` only where no richer function exists.
- **D9 — Factories.** **(a) factories primary, package-distinct names
  (`createSyntaxValidator`, …), top-level functions use defaults —
  recommended**: dns genuinely needs one, symmetry keeps the umbrella
  trivial, distinct names avoid re-export collisions; (b) plain options-last
  functions primary, factories as mere pre-binding, or a uniform
  `createValidator` name per package.
- **D10 — Subpath exports.** **(a) only classifier `/providers` and
  `/disposable` — recommended**: subpaths exist for heavy tree-shakeable
  data; presets and cache are tiny and belong at root; (b) a subpath per
  commit scope in every package. Amended for validator-syntax#7: syntax also
  ships `/fixtures`, so dependents' consistency tests and the docs' support
  matrix read the same corpus from npm. It's data kept off the root entry,
  which fits (a)'s reasoning. Amended for validator-syntax#34: `/fixtures`
  also exports `previewSyntaxOptions`, the configuration preview the docs
  site runs. It imports the parser from the root entry, so the root stays
  exactly as it builds alone. Amended for classifier#7: the classifier also ships
  `/sources`, the page and verified date behind each registry fact, for the
  docs' support matrix (meta#18). It's data kept off `/providers`, so
  callers of the registry don't ship the URLs.
