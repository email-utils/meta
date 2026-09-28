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
  /** The local part, without comments. */
  local: string;
  /** The domain, without comments. */
  domain: string;
  /** The last label; absent when the preset allows dotless domains and there is none. */
  tld?: string;
  /** Comments in input order; empty when there are none or they aren't allowed. */
  comments: AddressComment[];
}

export interface AddressComment {
  /** The comment's text, without the parentheses. */
  text: string;
  /** RFC 5322 allows comments only at the ends of the local part and the domain. */
  position: 'before-local' | 'after-local' | 'before-domain' | 'after-domain';
}

export interface SyntaxOptions {
  /** @default 'practical' */
  preset?: 'practical' | 'rfc5321' | 'rfc5322' | 'html5';
  /** Check the TLD against the IANA set. Default: on in `practical`, off elsewhere. */
  checkTld?: boolean;
  /** Accept a domain with no dot (e.g. `localhost`). Default: off in every preset. */
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

## Options

| Option          | Type      | Default                    | Notes                                         |
| --------------- | --------- | -------------------------- | --------------------------------------------- |
| `preset`        | `string`  | `'practical'`              | Base rule set.                                |
| `checkTld`      | `boolean` | `true` in `practical` only | Uses the bundled IANA TLD set (S3).           |
| `allowNoTld`    | `boolean` | `false`                    | Replaces the 0.0.1 `localhost` flag (S4).     |
| `allowComments` | `boolean` | `true` in `rfc5322` only   | Comments go to `ParsedAddress.comments` (S5). |

## Reason codes

The `syntax.*` namespace in the [catalogue](./reason-codes.md#syntax):
`syntax.address.*` (empty, no_at, too_long), `syntax.local.*` (empty,
too_long, invalid_char, consecutive_dots, unquoted_space), `syntax.domain.*`
(empty, no_dot, label_invalid, too_long, invalid_char), `syntax.comment.*`
(not_allowed, unterminated), and `syntax.tld.unknown`. Failures carry
`index` where a position exists.

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
