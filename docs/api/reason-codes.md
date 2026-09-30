# Reason-code catalogue

Every code any `@email-utils` package can put in `{ ok: false, reason }`.
One shared registry across the suite (see
[conventions — reason codes](./conventions.md#reason-codes), decisions D1/D2):
dotted lowercase, `<package>.<subject>.<problem>`, package prefix baked in.

Stability: a released code never changes meaning or disappears within a major
version; new codes may arrive in minor versions. `message` strings are not
part of the contract.

## syntax

Emitted by [`@email-utils/validator-syntax`](./validator-syntax.md). Where a
position exists, the result's `index` points at the offending character.

| Code                            | Meaning                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `syntax.address.empty`          | The input is the empty string.                                                         |
| `syntax.address.no_at`          | No `@` separator in the address.                                                       |
| `syntax.address.too_long`       | Over `maxLength` as written, or 254 characters without comments or folding whitespace. |
| `syntax.local.empty`            | Nothing before the `@`.                                                                |
| `syntax.local.too_long`         | The local part exceeds 64 characters.                                                  |
| `syntax.local.invalid_char`     | A character the active preset does not allow in the local part.                        |
| `syntax.local.consecutive_dots` | `..` outside a quoted string.                                                          |
| `syntax.local.unquoted_space`   | A space, tab, or folded line outside a quoted string, where the preset allows none.    |
| `syntax.domain.empty`           | Nothing after the `@`.                                                                 |
| `syntax.domain.no_dot`          | No dot in the domain and the preset does not allow dotless domains.                    |
| `syntax.domain.label_invalid`   | A domain label is empty or breaks the length or hyphen-placement rules.                |
| `syntax.domain.literal_invalid` | A domain literal the preset doesn't accept as written, or one with no closing `]`.     |
| `syntax.domain.too_long`        | The domain exceeds 253 characters.                                                     |
| `syntax.domain.invalid_char`    | A character the active preset does not allow in the domain.                            |
| `syntax.comment.not_allowed`    | A comment, and the options don't allow comments.                                       |
| `syntax.comment.unterminated`   | A `(` with no matching `)`.                                                            |
| `syntax.tld.unknown`            | The TLD is not in the IANA set (only when the TLD check is on).                        |

## classifier

`@email-utils/classifier` lookups return plain data, not results (decision C3
on the [classifier page](./classifier.md)), so the namespace is reserved and
empty in v1.

## sanitizer

Emitted by [`@email-utils/sanitizer`](./sanitizer.md).

| Code                           | Meaning                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `sanitizer.address.unparsable` | The input does not parse as an address, so nothing to normalize. |

## dns

Emitted by [`@email-utils/validator-dns`](./validator-dns.md). Node resolver
error codes (`ENOTFOUND`, `ENODATA`, `ESERVFAIL`, …) are mapped onto these;
the raw code is surfaced in `message`.

| Code                     | Meaning                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| `dns.address.unparsable` | The input is not an address or domain; no lookup was made.                |
| `dns.domain.not_found`   | The domain does not resolve at all (`ENOTFOUND`/`ENODATA` on all types).  |
| `dns.mx.none`            | No MX records, and no A/AAAA to serve as the implicit MX (RFC 5321 §5.1). |
| `dns.mx.null`            | Null MX (RFC 7505): the domain explicitly receives no mail.               |
| `dns.lookup.timeout`     | A lookup exceeded the configured timeout.                                 |
| `dns.lookup.failed`      | The resolver failed for another reason (e.g. `SERVFAIL`).                 |
