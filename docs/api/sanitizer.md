# @email-utils/sanitizer

What is its canonical form? Provider-aware normalization.

Platform-neutral, synchronous. Depends on
[`@email-utils/classifier`](./classifier.md)'s provider registry for
provider-driven rules.

```sh
npm install @email-utils/sanitizer
```

## Quick start

```ts
import { normalizeEmail, createSanitizer } from '@email-utils/sanitizer';

const result = normalizeEmail('Ada.Lovelace+news@GMAIL.com');
if (result.ok) {
  result.value.key; // 'adalovelace@gmail.com' — store and compare this
  result.value.address; // 'Ada.Lovelace+news@gmail.com' — email this
}

// Comments are kept in the address when the syntax options accept them.
const sanitize = createSanitizer({ syntax: { allowComments: true } });
const r = sanitize.normalize('Ada.Lovelace+news(work)@googlemail.com');
if (r.ok) {
  r.value.key; // 'adalovelace@gmail.com'
  r.value.address; // 'Ada.Lovelace+news(work)@googlemail.com'
  r.value.envelope; // 'Ada.Lovelace+news@googlemail.com'
}

normalizeEmail('me+validatorsyntax@gmail.com');
// key: 'me@gmail.com', address: 'me+validatorsyntax@gmail.com'

normalizeEmail('not an email'); // { ok: false, reason: 'sanitizer.address.unparsable' }
```

A custom domain hosted on a provider can only be recognized by its MX
records, so server code passes in what validator-dns found:

```ts
import { detectProviderByMx } from '@email-utils/validator-dns';

const detected = await detectProviderByMx('A.da+news@mycompany.com'); // { ok: true, value: 'google-workspace' }
const provider = detected.ok ? detected.value : undefined;
normalizeEmail('A.da+news@mycompany.com', { provider });
// key: 'a.da@mycompany.com' (tag removed, dots kept: Workspace rules)
```

## Exports

```ts
export function normalizeEmail(
  email: string | ParsedAddress,
  options?: NormalizeOptions,
): Result<NormalizedEmail>;

export function createSanitizer(options?: NormalizeOptions): {
  normalize(email: string | ParsedAddress): Result<NormalizedEmail>;
};

export interface NormalizedEmail {
  /**
   * Uniqueness key: two inputs that reach the same mailbox get the same key.
   * Store and compare it; never send mail to it. Normalizing it again, with
   * the same options, gives it back.
   */
  key: string;
  /**
   * The address to email: local-part case, dots, subaddress tag, and comments kept.
   * Valid in RFC 5322 headers such as `To:`.
   */
  address: string;
  /** `address` without comments: valid in the SMTP envelope (RFC 5321). */
  envelope: string;
  /** The provider whose rules built the key: the `provider` option, or detected from the domain. */
  provider?: ProviderId;
}

export interface NormalizeOptions {
  /** How the input is parsed. @default the validator-syntax `practical` preset */
  syntax?: SyntaxOptions;
  /**
   * The provider when it's known from elsewhere, usually validator-dns's
   * `detectProviderByMx` for a custom domain. Takes precedence over detection
   * from the domain. An ID the registry doesn't know is treated as no provider.
   */
  provider?: ProviderId;
  /** Key only: apply the provider's rules. @default true */
  providerRules?: boolean;
  /** Key only: force dot removal regardless of provider. @default provider-driven */
  removePeriods?: boolean;
  /** Key only: force subaddress removal regardless of provider. @default provider-driven */
  removeSubaddress?: boolean;
  /** Key only: the separator `removeSubaddress` uses when the provider has none. @default '+' */
  subaddressSeparator?: string;
}
```

## Behavior

One parse produces all three forms, so they can never disagree about what
the input was. The forms differ in how much they strip:

| Step                            | `key`         | `envelope` | `address` |
| ------------------------------- | ------------- | ---------- | --------- |
| Trim surrounding whitespace     | ✓             | ✓          | ✓         |
| Lowercase the domain            | ✓             | ✓          | ✓         |
| Remove comments                 | ✓             | ✓          | —         |
| Lowercase the local part        | ✓             | —          | —         |
| Drop quotes that aren't needed  | ✓             | —          | —         |
| Map domain aliases to canonical | provider-rule | —          | —         |
| Fold subdomain addressing       | provider-rule | —          | —         |
| Spell hyphens as dots           | provider-rule | —          | —         |
| Remove dots in the local part   | provider-rule | —          | —         |
| Remove the subaddress tag       | provider-rule | —          | —         |

- **`key` is for identity, not delivery.** It collapses every spelling that
  reaches the same mailbox: `Ada.Lovelace+news@googlemail.com` and
  `adalovelace@gmail.com` share a key. Provider rules from the classifier
  registry decide the last five rows. On a domain with no known provider,
  dots and subaddress tags are left alone (see
  [Subaddresses](#subaddresses)). `removePeriods`/`removeSubaddress`
  override the provider's rules in either direction (Z2).
- **`key` is also an address the same options parse.** Normalizing a key
  again gives the same key, so stored keys can go through `normalizeEmail`
  again, in a migration say, without changing. Where the rules would leave
  a dot at either end or two together, it's dropped (`a.+x@outlook.com`
  keys as `a@outlook.com`), and where they'd leave nothing, the local part
  is kept as it was (`-@yandex.ru`).
- **Surrounding whitespace is spaces, tabs, CRs, and LFs,** the whitespace
  validator-syntax knows. Unicode spaces such as U+00A0 stay, since an RFC
  6531 local part may start or end with one.
- **`address` is what the person typed, tidied.** Only the domain is
  lowercased, since domains are case-insensitive. The local part keeps its
  case, the subaddress tag keeps routing to the person's filters, and
  comments survive. Use it for the `To:` header and anything the person
  sees.
- **`envelope` is `address` minus comments.** RFC 5321's mailbox grammar has
  no comments, so `RCPT TO` and most sending APIs need this form (Z5).

### Subaddresses

A subaddress (RFC 5233) is a tag after a separator in the local part:
`me+validatorsyntax@gmail.com` reaches the `me@gmail.com` mailbox, and
people use the tag to filter mail or to see who shared their address. It
isn't a comment: comments are never part of the mailbox, so the key always
drops them, but a tag is dropped only when the provider is known to ignore
it (Z6).

- **The separator comes from the provider.** Most use `+`; some mail
  servers are configured to split on `-`. Each registry entry records its
  character in `subaddressSeparator`.
- **The tag starts at the first separator.** `me+a+b@gmail.com` gets the
  key `me@gmail.com`. When nothing comes before the separator
  (`+news@gmail.com`), the local part is kept whole, since there would be no
  mailbox left.
- **Subdomain addressing folds into the local part.** On providers with
  `subdomainAddressing`, `news@ada.fastmail.com` delivers to
  `ada@fastmail.com`, and that's its key. Only an ASCII subdomain folds,
  since mailbox names there are ASCII: `x@ü.fastmail.com` keeps its domain.
- **Unknown domains keep their tags.** `+` can be a literal part of a
  mailbox name, and merging two different people under one key would
  wrongly block the second one from signing up. `removeSubaddress: true`
  opts in anyway, splitting on `subaddressSeparator`.
- **Custom domains need the `provider` option.** The domain alone can't
  show that `mycompany.com` is on Google Workspace; validator-dns's
  `detectProviderByMx` can. Passing its answer in keeps the sanitizer free
  of I/O and synchronous ([conventions D7](./conventions.md#sync-and-async)),
  with the lookup done on the server, where DNS already runs.
- **Gmail and Google Workspace have different rules.** Dots are ignored on
  gmail.com and googlemail.com but change the mailbox on Workspace domains,
  so `a.da@mycompany.com` and `ada@mycompany.com` keep different keys.

### Comments

Comments only reach the output if the input is parsed with comments allowed
(`syntax: { allowComments: true }`, or the `rfc5322` preset). Otherwise an
input containing one fails to parse.

### Domains and errors

Domain normalization is lowercase-only in v1; IDN/punycode handling is
explicitly deferred (Z3).

Per [conventions D6](./conventions.md#errors): non-string input throws
`TypeError`; everything else, including the empty string (which threw in
0.0.1), returns a result.

## Reason codes

The `sanitizer.*` namespace in the
[catalogue](./reason-codes.md#sanitizer): just
`sanitizer.address.unparsable` in v1.

## Fixtures

`@email-utils/sanitizer/fixtures` publishes the corpus the package is tested
against, so dependents can check they key addresses the same way, and so
these docs can preview a configuration on real addresses. It has a fixture
for each row of the [Behavior](#behavior) table and each rule under
[Subaddresses](#subaddresses): Gmail dots, the googlemail.com alias, `+`
and `-` tags, Fastmail subdomains, Workspace against Gmail, comments,
quotes, and inputs that fail to parse.

Each fixture has the `input`, a description, and the `expected` result
under the default options: `ok` with `key`, `address`, `envelope`, and
`provider`, or `ok: false` with the `reason`. Some features only show with
an option: the default `practical` syntax rejects comments and quotes, no
registry provider splits on `-`, and a Workspace domain needs the
`provider` option. Those fixtures also carry `with`, the options that turn
the feature on and the result under them.

```ts
import { sanitizerFixtures } from '@email-utils/sanitizer/fixtures';

for (const { input, expected, with: other } of sanitizerFixtures) {
  expected; // { ok: true, key, address, envelope, provider? } | { ok: false, reason }
  other?.options; // e.g. { syntax: { allowComments: true } }
  other?.expected; // the result under those options
}
```

The subpath is test and docs data. The fixture set may grow in any minor
release; a changed expectation follows the package's own semver.

### Previewing a configuration

`previewSanitizerOptions` runs addresses through `createSanitizer(options)`
and splits them into the ones it normalizes, with their forms, and the ones
it can't, each list in input order. It normalizes the corpus by default, or
the addresses you pass. The docs site's configuration preview
([meta#82](https://github.com/email-utils/meta/issues/82)) is built on it.

```ts
import { previewSanitizerOptions } from '@email-utils/sanitizer/fixtures';

export function previewSanitizerOptions(
  options?: NormalizeOptions,
  addresses?: readonly string[], // the corpus's inputs by default
): SanitizerPreview;

export interface SanitizerPreview {
  valid: ValidSanitizerEntry[]; // { input, description?, key, address, envelope, provider?, changed }
  invalid: InvalidSanitizerEntry[]; // { input, description?, reason, message?, changed }
}

previewSanitizerOptions({ provider: 'google-workspace' }, [
  'A.da+news@mycompany.com',
]).valid;
// [{ input: 'A.da+news@mycompany.com', key: 'a.da@mycompany.com', …, changed: true }]
```

`changed` marks the inputs the options move: those the default options
would reject, accept, or key differently. With no options, nothing is
changed. The corpus is judged by your options alone; a fixture's `with`
isn't applied. `description` comes from the corpus and is absent for your
own addresses. Malformed options, or `addresses` that isn't an array of
strings, throw `TypeError` before anything is normalized, and nothing is
logged. The function lives in the subpath and imports `normalizeEmail` from
the root entry, so the root entry's size is unchanged.

## Migrating from 0.0.1

The `EmailSanitizer` class and default export are gone. `sanitize()` becomes
`normalizeEmail()`, which returns a result with separate `key` and `address`
forms instead of one string or a throw. The broken `sanitizeGSuite()` is
replaced by provider rules
([sanitizer#7](https://github.com/email-utils/sanitizer/issues/7)). The
`common.lowercase` option is gone: the key is always lowercased, and the
address always keeps the local part's case. `local.removePeriods` becomes a
key-only override, and `local.removePlusTag` becomes `removeSubaddress`,
which also handles `-` separators.

## Decisions

- **Z1 — `normalizeEmail` return.** **(a) the shared result shape —
  recommended**: consistent with D4/D6 and lets the umbrella pipeline start
  with normalize without a special case; (b) plain `string`, throwing on bad
  input as 0.0.1 did.
- **Z2 — Key rules.** **(a) provider-driven rules by default with manual
  overrides — recommended**: removing dots is only correct for Gmail-like
  providers, and provider rules are the whole point of the `providers`
  scope; (b) keep only the 0.0.1 manual flags, defaulting off.
- **Z3 — Domain normalization extent.** **(a) lowercase only, IDN/punycode
  explicitly deferred — recommended**: keeps v1 shippable and makes the
  deferral a decision rather than an omission; (b) full IDN handling in v1.
- **Z4 — Uniqueness key and deliverable address.** **(a) one result carrying
  both `key` and `address`, with fixed casing rules (key fully lowercased,
  address keeps the local part's case) — recommended**: one parse, so the
  two can't drift apart, and a uniqueness key that isn't lowercased isn't a
  uniqueness key; (b) separate `toKey()` and `toAddress()` functions;
  (c) one string output with options choosing how much to strip, as in
  0.0.1. The field names `key` and `address` are public and are part of this
  decision.
- **Z5 — Envelope form.** **(a) also return a comment-free `envelope` —
  recommended**: comments are legal in a `To:` header but not in SMTP
  `RCPT TO`, so a caller who sends to `address` directly can be rejected;
  (b) return only `key` and `address`, and document that callers must strip
  comments before sending over SMTP.
- **Z6 — Subaddresses and provider rules.** **(a) per-provider data (the
  separator character, subdomain addressing, and separate `gmail` and
  `google-workspace` entries) plus a `provider` option for what
  `detectProviderByMx` found — recommended**: covers `+` and `-` servers,
  Fastmail-style subdomains, and custom domains, while keeping the sanitizer
  synchronous; (b) keep a `plusTags` yes/no flag with `+` only, which misses
  `-` separators, subdomain addressing, and every custom domain; (c) strip
  `+tag` on every domain regardless of provider, which catches more
  duplicate sign-ups but merges different mailboxes on servers where `+` is
  literal. The provider IDs `gmail` and `google-workspace` are public and
  part of this decision.
