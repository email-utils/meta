# email-utils v1 API

The proposed v1 surface of the `@email-utils` packages, written docs-first:
these pages are the design, approved before implementation starts
([epic #13](https://github.com/email-utils/meta/issues/13)). Each page ends
with a Decisions block of open questions; everything else follows the shared
[conventions](./conventions.md).

## Packages

Four packages, each answering one question about an address, in dependency
order:

| Package                                   | Question                     | Answers with                              |
| ----------------------------------------- | ---------------------------- | ----------------------------------------- |
| [validator-syntax](./validator-syntax.md) | Is it well-formed?           | Parser, presets, TLD set                  |
| [classifier](./classifier.md)             | What is it?                  | Provider registry, disposable, role, typo |
| [sanitizer](./sanitizer.md)               | What is its canonical form?  | Uniqueness key and deliverable address    |
| [validator-dns](./validator-dns.md)       | Can the domain receive mail? | MX, Null MX, signals                      |

validator-syntax, classifier, and sanitizer are synchronous and run anywhere;
validator-dns is async and Node-only. A typical pipeline is
`normalizeEmail → parseAddress → classify` on the client, with `checkDns`
added on the server.

## Reference

- [API conventions](./conventions.md) — results, reason codes, errors,
  factories, module rules, and the cross-cutting decisions D1–D10.
- [Reason-code catalogue](./reason-codes.md) — every code the suite can
  return, in one shared registry.
