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
strict.maxLength; // 512 — the input limit it applies
```

## Exports

```ts
export function parseAddress(
  email: string,
  options?: SyntaxOptions,
): Result<ParsedAddress>;

export function isValidSyntax(email: string, options?: SyntaxOptions): boolean;

export function createSyntaxValidator(options?: SyntaxOptions): SyntaxValidator;

export interface SyntaxValidator {
  parse(email: string): Result<ParsedAddress>;
  isValid(email: string): boolean;
  /**
   * The `maxLength` it applies: the one passed, or the default, 512;
   * `Infinity` for no limit. The validator is frozen, so this can't be
   * reassigned.
   */
  readonly maxLength: number;
}

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

export type Preset = 'practical' | 'rfc5321' | 'rfc5322' | 'html5';

// Each option also takes `undefined`, which means unset, so a maybe-unset
// flag can be passed through under `exactOptionalPropertyTypes`.
export interface SyntaxOptions {
  /** @default 'practical' */
  preset?: Preset | undefined;
  /** Check the TLD against the IANA set. Default: on in `practical`, off elsewhere. */
  checkTld?: boolean | undefined;
  /** Accept a domain with no dot (e.g. `localhost`). Default: on in `html5`, off elsewhere. */
  allowNoTld?: boolean | undefined;
  /**
   * Accept RFC 5322 comments, e.g. `ada(work)@example.com`. Default: on in
   * `rfc5322`, off elsewhere. In `practical`, comments may sit only at the
   * ends of the local part and the domain, as RFC 5322's dot-atom allows.
   * Throws `TypeError` with `rfc5321` or `html5`, whose grammars have no
   * comments.
   */
  allowComments?: boolean | undefined;
  /**
   * Accept non-ASCII in the local part (RFC 6531, SMTPUTF8), e.g.
   * `用户@example.com`: in atoms, quoted strings, and comments. Default: off.
   * Throws `TypeError` with `html5`.
   */
  allowUnicode?: boolean | undefined;
  /**
   * Accept U-label domains, e.g. `ada@bücher.example`, kept as written.
   * Default: off. Throws `TypeError` with `html5`.
   */
  allowIdn?: boolean | undefined;
  /**
   * Accept domain literals, e.g. `ada@[192.0.2.1]`. Default: on in `rfc5321`
   * and `rfc5322`, off elsewhere. Throws `TypeError` when `true` with `html5`.
   */
  allowIpLiteral?: boolean | undefined;
  /**
   * The longest input accepted, in UTF-16 code units (`email.length`).
   * Longer input fails with `syntax.address.too_long` before it's scanned.
   * A positive integer or `Infinity`. Default: 512 in every preset.
   */
  maxLength?: number | undefined;
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
  - any text in a domain literal (`[RFC-5322-domain-literal]`);
  - any atext in a domain label (`test@iana/icann.org`,
    `james@cb$.com`), since RFC 5322's domain is a dot-atom. The hostname
    rules for hyphens and label length still apply.

  Only RFC 5322's own limits apply, so there is no 64-character cap on the
  local part. A dotted domain is still required unless `allowNoTld` is on.

- **`html5`** matches browsers exactly, so it accepts what they accept:
  dotless domains (`admin@mailserver1`), leading, trailing, and consecutive
  dots in the local part (`john..doe@example.com`), and local parts over 64
  characters. The 254-character address cap still applies.

Every preset caps a domain label at 63 characters and the address at 254;
all but `html5` cap the domain at 253. Comments and folding whitespace don't
count toward the caps. The first failure wins: input longer than
`maxLength` fails before anything else is checked; then the local part is
checked before the domain, each left to right, then the lengths, then a
dotless domain, then the TLD.

`maxLength` bounds the input as written, in UTF-16 code units, comments and
folding whitespace included. It defaults to 512 in every preset: twice the
address cap, which leaves room for comments and folding whitespace.
Checking it first rejects oversized input in constant time, however long it
is. `Infinity` turns it off.

A validator from `createSyntaxValidator` exposes the limit it applies as
`maxLength`. A dependent that trims or otherwise pre-processes input before
parsing it can check the raw length against that first, so oversized input
is still rejected before any work, and padding can't carry input past the
limit.

## Options

| Option           | Type      | Default                        | Notes                                         |
| ---------------- | --------- | ------------------------------ | --------------------------------------------- |
| `preset`         | `string`  | `'practical'`                  | Base rule set.                                |
| `checkTld`       | `boolean` | `true` in `practical` only     | Uses the bundled IANA TLD set (S3).           |
| `allowNoTld`     | `boolean` | `true` in `html5` only         | Replaces the 0.0.1 `localhost` flag (S4).     |
| `allowComments`  | `boolean` | `true` in `rfc5322` only       | Comments go to `ParsedAddress.comments` (S5). |
| `allowUnicode`   | `boolean` | `false`                        | RFC 6531 local parts (S6).                    |
| `allowIdn`       | `boolean` | `false`                        | U-label domains (S6).                         |
| `allowIpLiteral` | `boolean` | `true` in `rfc5321`, `rfc5322` | Domain literals in any preset but `html5`.    |
| `maxLength`      | `number`  | `512`                          | Longest input, in UTF-16 code units.          |

Options are checked when they're passed: `createSyntaxValidator` checks them
once, the top-level functions on every call. Anything malformed throws
`TypeError` ([conventions D6](./conventions.md#decisions)): options that
aren't an object, an unknown preset, a non-boolean override, a `maxLength`
that isn't a positive integer or `Infinity`, `allowComments: true` with
`rfc5321` or `html5`, `allowUnicode`, `allowIdn`, or `allowIpLiteral` `true`
with `html5`, or a key that isn't one of the eight above, so a 0.0.1 option
tree (`{ local: { … } }`) fails loudly instead of being ignored.

### International addresses

`allowUnicode` and `allowIdn` are off in every preset, so the defaults stay
with the addresses most systems can deliver to today (S6); each is one flag
to turn on. None of the three can be turned on in `html5`, whose grammar is
the WHATWG regex: ASCII-only, with no literals.

- **`allowUnicode`** accepts any non-ASCII character in local-part atoms and
  quoted strings, and in comments where they're allowed. A lone surrogate,
  which no UTF-8 text can hold, fails with `syntax.local.invalid_char`. The
  64 cap on the local part and the 254 cap on the address count UTF-8
  octets, as RFC 6531 keeps them.
- **`allowIdn`** accepts domain labels written as U-labels. Each one must
  convert to an A-label under UTS #46, the mapping the WHATWG URL parser
  applies, with its bidi and joiner rules, or it fails with
  `syntax.domain.label_invalid`. So does a label that UTS #46 maps to plain
  ASCII (fullwidth `ｅｘａｍｐｌｅ`) or splits in two (`。`). The 63 and 253
  caps apply to the A-label form, so a U-label of more than 63 code points
  fails without being converted: its A-label takes `xn--` and at least a
  character for each one. Once the A-labels take the domain past 253, the
  U-labels after that aren't converted either, and the domain fails with
  `syntax.domain.too_long` unless something later fails first. Each label
  is judged as it would be on its own: UTS #46's bidi rule never applies
  across labels. `ParsedAddress.domain` and `tld` keep the labels as
  written; the TLD check knows IDN TLDs in both forms. A-labels
  (`xn--bcher-kva`) are hostname labels, so every preset accepts them
  without the flag.
- **`allowIpLiteral`** adds IPv4 and `IPv6:` address literals to
  `practical`. `false` turns literals off in `rfc5321` and `rfc5322`, whose
  general literals go with them.

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

### Previewing a configuration

`expected` records each preset's defaults only. To see what your own
options do, `previewSyntaxOptions` runs addresses through
`createSyntaxValidator(options)` and splits them into the ones it accepts
and the ones it rejects, each list in input order. It judges the corpus by
default, or the addresses you pass. The docs site's configuration preview
([meta#82](https://github.com/email-utils/meta/issues/82)) is built on it.

```ts
import { previewSyntaxOptions } from '@email-utils/validator-syntax/fixtures';

export function previewSyntaxOptions(
  options?: SyntaxOptions,
  addresses?: readonly string[], // syntaxFixtures by default
): SyntaxPreview;

export interface SyntaxPreview {
  valid: ValidPreviewEntry[]; // { address, description?, changed }
  invalid: InvalidPreviewEntry[]; // { address, description?, reason, message?, index?, changed }
}

const { valid } = previewSyntaxOptions({ checkTld: false });
valid.filter((entry) => entry.changed); // now accepted, e.g. example@s.example
```

`changed` marks the addresses the overrides move, the ones the preset alone
would judge the other way; with no overrides, nothing is changed.
`description` comes from the corpus and is absent for your own addresses.
Malformed options, or `addresses` that isn't an array of strings, throw
`TypeError` before anything is parsed, and nothing is logged. The function
lives in the subpath and imports the parser from the root entry, so the root
entry's size is unchanged.

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
- **S6 — International addresses.** **(a) `allowUnicode` and `allowIdn`,
  off everywhere, domains kept as written — recommended**: RFC 6531 support
  is still patchy among mail servers, so the default stays deliverable, and
  a parser that doesn't normalize leaves A-label conversion to the dns
  package, which punycodes before lookup, and to the sanitizer (Z3);
  (b) U-label domains returned as A-labels; (c) on by default in `rfc5321`
  and `rfc5322`.
