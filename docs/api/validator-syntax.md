# @email-utils/validator-syntax

Is the address well-formed? Parser, presets, TLD set.

Platform-neutral (browser and Node). Synchronous — the 0.0.1 async
`validate()` becomes sync in v1
([conventions D7](./conventions.md#decisions)).

```sh
npm install @email-utils/validator-syntax
```

## Quick start

```ts
import {
  parseAddress,
  isValidSyntax,
  createSyntaxValidator,
} from '@email-utils/validator-syntax';

const result = parseAddress('ada.lovelace@example.co.uk');
if (result.ok) {
  result.value; // { local: 'ada.lovelace', domain: 'example.co.uk', tld: 'uk' }
} else {
  result.reason; // e.g. 'syntax.local.invalid_char'
}

isValidSyntax('ada@example.com'); // true — sugar for parseAddress(...).ok

const strict = createSyntaxValidator({ preset: 'rfc5321' });
strict.parse('a b@example.com');
strict.isValid('a b@example.com');
```

## Exports

```ts
export function parseAddress(
  email: string,
  options?: SyntaxOptions,
): Result<ParsedAddress>;

export function isValidSyntax(email: string, options?: SyntaxOptions): boolean;

export function createSyntaxValidator(options?: SyntaxOptions): {
  parse(email: string): Result<ParsedAddress>;
  isValid(email: string): boolean;
};

export interface ParsedAddress {
  /** The local part, without comments or folding whitespace. */
  local: string;
  /** The domain, without comments or folding whitespace. */
  domain: string;
  /** The last label; absent for a domain literal, or a dotless domain the preset allows. */
  tld?: string;
  /** Comments in input order; empty when there are none or they aren't allowed. */
  comments: AddressComment[];
}

export interface AddressComment {
  /** The comment's text, without the parentheses. */
  text: string;
  /**
   * Where the comment sat. RFC 5322's obsolete syntax also allows comments
   * between the words of the local part and the labels of the domain
   * (`test.(comment)test@example.com`): those are `inside-local` and
   * `inside-domain`.
   */
  position:
    | 'before-local'
    | 'inside-local'
    | 'after-local'
    | 'before-domain'
    | 'inside-domain'
    | 'after-domain';
}

export interface SyntaxOptions {
  /** @default 'practical' */
  preset?: 'practical' | 'rfc5321' | 'rfc5322' | 'html5';
  /** Check the TLD against the IANA set. Default: on in `practical`, off elsewhere. */
  checkTld?: boolean;
  /** Accept a domain with no dot (e.g. `localhost`). Default: on in `html5`, off elsewhere. */
  allowNoTld?: boolean;
  /**
   * Accept RFC 5322 comments, e.g. `ada(work)@example.com`. Default: on in
   * `rfc5322`, off elsewhere. Throws `TypeError` with `rfc5321` or `html5`,
   * whose grammars have no comments.
   */
  allowComments?: boolean;
}

// Each package declares the shared Result/ReasonCode shapes locally and
// re-exports them (no runtime dependency between packages for types).
export type { Result, ReasonCode };
```

## Presets

The 0.0.1 per-character-class option tree (`local.alphaUpper`,
`domain.charsBeforeDot`, …) is replaced by four presets with a flat override
object on top (S1):

| Preset      | Intent                                                                          |
| ----------- | ------------------------------------------------------------------------------- |
| `practical` | **Default.** What real mailboxes look like; rejects legal-but-never-seen forms. |
| `rfc5321`   | What SMTP accepts on the wire.                                                  |
| `rfc5322`   | The full grammar, quoted locals and comments included.                          |
| `html5`     | Exactly the WHATWG `input[type=email]` regex, for parity with browser forms.    |

Where the presets differ (the corpus behind this is published as
`@email-utils/validator-syntax/fixtures`; see [Fixtures](#fixtures)):

- **`practical`** allows only dot-atom local parts. It rejects quoted local
  parts (`" "@example.org`, `just."quoted".atoms@example.com`), the
  `%` and `!` route characters (`user%relay.example@example.org`,
  `relay!user@example.org`), and domain literals (`postmaster@[192.0.2.1]`):
  all legal, never seen on real mailboxes.
- **`rfc5321`** allows a Dot-string or a Quoted-string local part, never
  both mixed, and caps the local part at 64 characters. Its domain literals
  are IPv4 (`[192.0.2.1]`) and IPv6 (`[IPv6:2001:db8::1]`) address
  literals, IPv6 being the only registered tag, with no more than six
  groups beside a `::`. Anything else in brackets fails with
  `syntax.domain.literal_invalid`.
- **`rfc5322`** follows RFC 5322's addr-spec, obsolete syntax included,
  since RFC 5322 requires parsers to accept it:
  - dot-separated atoms and quoted strings mixed (obs-local-part);
  - comments and folding whitespace around every word and label, not just
    at the ends of each part (`test . test@example.com`,
    `test.(comment)test@example.com`), with a CRLF only when a space or tab
    follows it;
  - control characters other than NUL, CR, and LF in quoted strings and
    comments, and any ASCII character after a backslash;
  - any text in a domain literal (`[RFC-5322-domain-literal]`).

  Only RFC 5322's own limits apply, so there is no 64-character cap on the
  local part. A dotted domain is still required unless `allowNoTld` is on.

- **`html5`** matches browsers exactly, so it accepts what they accept:
  dotless domains (`admin@mailserver1`), leading, trailing, and consecutive
  dots in the local part (`john..doe@example.com`), and local parts over 64
  characters. The 254-character address cap still applies.

Every preset caps a domain label at 63 characters and the address at 254;
all but `html5` cap the domain at 253. Comments and folding whitespace don't
count toward the caps. The first failure wins: the local part is checked
before the domain, each left to right, then the lengths, then a dotless
domain, then the TLD.

## Options

| Option          | Type      | Default                    | Notes                                         |
| --------------- | --------- | -------------------------- | --------------------------------------------- |
| `preset`        | `string`  | `'practical'`              | Base rule set.                                |
| `checkTld`      | `boolean` | `true` in `practical` only | Uses the bundled IANA TLD set (S3).           |
| `allowNoTld`    | `boolean` | `true` in `html5` only     | Replaces the 0.0.1 `localhost` flag (S4).     |
| `allowComments` | `boolean` | `true` in `rfc5322` only   | Comments go to `ParsedAddress.comments` (S5). |

## Reason codes

The `syntax.*` namespace in the [catalogue](./reason-codes.md#syntax):
`syntax.address.*` (empty, no_at, too_long), `syntax.local.*` (empty,
too_long, invalid_char, consecutive_dots, unquoted_space), `syntax.domain.*`
(empty, no_dot, label_invalid, literal_invalid, too_long, invalid_char),
`syntax.comment.*`
(not_allowed, unterminated), and `syntax.tld.unknown`. Failures carry
`index` where a position exists.

## Fixtures

`@email-utils/validator-syntax/fixtures` publishes the corpus the package is
tested against, so dependents can check they split and judge addresses the
same way, and so these docs can build the support matrix. Each fixture has
the address, a description, and the expected result under every preset
(`ok`, or the `reason` and `index`). The sources are the 0.0.1 suite,
Dominic Sayers' is_email tests (BSD-3, attributed in the package's
`THIRD_PARTY_NOTICES.md`), and the examples from Wikipedia and RFC 3696
with its erratum 246.

```ts
import {
  syntaxFixtures,
  supportMatrix,
} from '@email-utils/validator-syntax/fixtures';

for (const { address, expected } of syntaxFixtures) {
  expected.practical; // { ok: true } | { ok: false, reason, index? }
}

supportMatrix(); // one row per feature: which presets accept it
```

The subpath is test and docs data. The fixture set may grow in any minor
release; a changed expectation follows the package's own semver.

## Migrating from 0.0.1

The `EmailSyntaxValidator` class, its default export, the async
`validate(): Promise<boolean>`, and the granular option tree are all gone;
`parseAddress`/`isValidSyntax` with a preset replace them. The 0.0.1
quote-handling bug is fixed by the rewrite
([validator-syntax#11](https://github.com/email-utils/validator-syntax/issues/11)).

## Decisions

- **S1 — Options model.** **(a) presets + flat overrides, drop the granular
  tree — recommended**: the commit scopes already name presets as the
  design, and the option tree is what the rewrite exists to escape; (b) keep
  the granular tree and add presets as bundles of it.
- **S2 — `parseAddress` value.** **(a) `{ local, domain, tld, comments }` —
  recommended**: the smallest surface classifier and sanitizer need
  downstream; `comments` is what lets the sanitizer keep them in the address
  it hands back for sending; (b) also `isQuoted` and a pre-normalized form;
  (c) `{ local, domain, tld }` only, which makes comments unrecoverable after
  parsing.
- **S3 — TLD checking.** **(a) on by default in `practical`, off in the RFC
  presets — recommended**: matches user intent per preset (the RFCs know
  nothing of IANA); (b) opt-in everywhere. TLD-set refreshes ship as `fix`
  releases per the commit conventions.
- **S4 — Dotless domains.** **(a) fold the 0.0.1 `localhost` flag into the
  `allowNoTld` override — recommended**: fewer knobs, same power; (b) keep a
  dedicated `localhost` option.
- **S5 — Comments.** **(a) an `allowComments` override, on only in
  `rfc5322` — recommended**: `practical` models what people type into forms,
  where comments almost never appear, and HTML5 forms and SMTP envelopes
  reject them; callers who want them opt in with one flag; (b) accept
  comments in `practical` too; (c) never accept comments.
