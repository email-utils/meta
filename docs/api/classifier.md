# @email-utils/classifier

What is the address? Provider registry, disposable, role, typo.

Platform-neutral, synchronous. The 0.0.1 package is an empty placeholder, so
this page is the whole proposal.

```sh
npm install @email-utils/classifier
```

## Quick start

```ts
import {
  classify,
  isDisposable,
  isRoleAccount,
  suggestCorrection,
  getProvider,
} from '@email-utils/classifier';

classify('ceo@mailinator.com');
// { provider: undefined, disposable: true, role: true, suggestion: undefined }

isDisposable('a@mailinator.com'); // true
isRoleAccount('admin@example.com'); // true
suggestCorrection('ada@gmial.com'); // 'ada@gmail.com'
getProvider('ada@googlemail.com'); // { id: 'gmail', name: 'Gmail', … }
```

## Exports

```ts
export function classify(
  email: string | ParsedAddress,
  options?: ClassifyOptions,
): Classification;

export function isDisposable(email: string | ParsedAddress): boolean;
export function isRoleAccount(email: string | ParsedAddress): boolean;
export function suggestCorrection(
  email: string | ParsedAddress,
): string | undefined;
export function getProvider(
  email: string | ParsedAddress,
): ProviderInfo | undefined;

export function createClassifier(options?: ClassifyOptions): {
  classify(email: string | ParsedAddress): Classification;
  isDisposable(email: string | ParsedAddress): boolean;
  isRoleAccount(email: string | ParsedAddress): boolean;
  suggestCorrection(email: string | ParsedAddress): string | undefined;
  getProvider(email: string | ParsedAddress): ProviderInfo | undefined;
};

export interface Classification {
  provider?: ProviderInfo;
  disposable: boolean;
  role: boolean;
  /** A likely intended address when the domain looks like a typo. */
  suggestion?: string;
}

/** Stable provider identifier, e.g. 'gmail', 'google-workspace', or 'microsoft365'. */
export type ProviderId = string;

/**
 * What a provider's domains are: `personal` for a mailbox service anyone can
 * sign up for, free or paid; `business` for hosting an organization's own
 * domain; `registrar` for a registrar's default forwarding MX.
 */
export type ProviderKind = 'personal' | 'business' | 'registrar';

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  kind: ProviderKind;
  /**
   * Domains the provider serves mail for, e.g. gmail.com and googlemail.com.
   * Empty for hosted-domain providers such as Google Workspace, which only
   * validator-dns can recognize, by MX.
   */
  domains: readonly string[];
  /** When set, all of `domains` share mailboxes and keys use this one, e.g. gmail.com. */
  canonicalDomain?: string;
  /**
   * MX host patterns that validator-dns's `detectProviderByMx` matches:
   * lowercase host names without the trailing dot, where a leading `*.`
   * matches one or more labels.
   */
  mxPatterns: readonly string[];
  /** Whether dots in the local part change the mailbox (false for Gmail). */
  dotsSignificant: boolean;
  /** Whether a hyphen in the local part is its own character (false for Yandex, where it matches a dot). */
  hyphensSignificant: boolean;
  /** The single character that starts a subaddress tag, e.g. '+' or '-'; absent if none. */
  subaddressSeparator?: string;
  /** Whether `tag@user.<domain>` delivers to `user@<domain>`, as on Fastmail. */
  subdomainAddressing: boolean;
}
```

### Subpath entries

The heavy data sets are tree-shakeable via subpaths
([conventions D10](./conventions.md#modules)); the root re-exports the
functions without forcing both data sets on every caller:

```ts
// Provider registry only
import { getProvider, providers } from '@email-utils/classifier/providers';

// Disposable-domain set only
import { isDisposable } from '@email-utils/classifier/disposable';

// Where each registry fact comes from, for the docs' support matrix
import { providerSources } from '@email-utils/classifier/sources';
```

`/sources` holds no code. It exports `providerSources`, which maps each
`ProviderId` to the pages behind its entry: the rule each one backs, its URL
(absent when the fact was read from DNS), the date it was last checked, and
a note on what it says. Keeping it out of `/providers` means callers of the
registry don't ship the URLs.

```ts
export type ProviderRule = keyof Omit<ProviderInfo, 'id' | 'name' | 'kind'>;

export interface ProviderSource {
  rule: ProviderRule;
  url?: string;
  /** `YYYY-MM-DD`. */
  verified: string;
  note?: string;
}

export const providerSources: Readonly<
  Record<ProviderId, readonly ProviderSource[]>
>;
```

## Behavior

- Input is a raw string or a `ParsedAddress` from validator-syntax. Strings
  are parsed internally with the `practical` preset; an unparsable string
  classifies as `{ disposable: false, role: false }` with no provider (C2).
- Lookups return plain data, not `{ ok }` results — classification is not
  pass/fail, and forcing the result shape onto it would be false symmetry
  (C3). The classifier therefore emits no reason codes in v1; the
  `classifier.*` namespace is [reserved](./reason-codes.md#classifier).
- Provider MX patterns live in the registry data. The classifier does no
  I/O, so it never resolves MX itself: validator-dns's `detectProviderByMx`
  matches live MX hosts against these patterns and returns the same
  `ProviderId`
  ([validator-dns#9](https://github.com/email-utils/validator-dns/issues/9),
  [N5 on the dns page](./validator-dns.md#decisions)).
- A custom domain hosted on a provider, such as `mycompany.com` on Google
  Workspace, can't be recognized from the domain alone: `getProvider`
  returns `undefined` for it, and `detectProviderByMx` finds it. Gmail and
  Google Workspace are separate entries because their rules differ: dots
  are ignored in gmail.com addresses but change the mailbox on Workspace
  domains.
- The registry records only what each provider documents. A rule it
  doesn't document keeps the default: dots and hyphens count, no subaddress
  separator, and no subdomain addressing. Merging two people's addresses
  under one key is worse than missing a duplicate,
  so Yahoo, AOL, iCloud, Zoho, GMX, WEB.DE, Mail.ru, Tuta, and HEY have no
  separator. Every entry cites its MX patterns, its domains, and each
  non-default rule in `/sources`.
- Providers that sell both personal mailboxes and hosting for custom
  domains get two entries when the two use different MX hosts, so that a
  `detectProviderByMx` hit reports the right `kind`: `gmail` and
  `google-workspace`, `outlook` and `microsoft365`, `zoho` and
  `zoho-business`, `yandex` and `yandex-360`.
- With `subdomainAddressing`, `getProvider` also matches one-label
  subdomains of the provider's domains: `news@ada.fastmail.com` is Fastmail.
  The sanitizer's
  [subaddress rules](./sanitizer.md#subaddresses) consume these fields
  (Z6).

### Providers

| ID                 | Name                       | Kind      | Rules beyond the defaults                    |
| ------------------ | -------------------------- | --------- | -------------------------------------------- |
| `gmail`            | Gmail                      | personal  | canonical gmail.com; dots ignored; `+`       |
| `google-workspace` | Google Workspace           | business  | `+`                                          |
| `outlook`          | Outlook.com                | personal  | `+`                                          |
| `microsoft365`     | Microsoft 365              | business  | `+`                                          |
| `yahoo`            | Yahoo Mail                 | personal  | —                                            |
| `aol`              | AOL Mail                   | personal  | —                                            |
| `icloud`           | iCloud Mail                | personal  | canonical icloud.com                         |
| `proton`           | Proton Mail                | personal  | `+`                                          |
| `fastmail`         | Fastmail                   | personal  | `+`; subdomain addressing                    |
| `zoho`             | Zoho Mail                  | personal  | —                                            |
| `zoho-business`    | Zoho Mail for business     | business  | —                                            |
| `yandex`           | Yandex Mail                | personal  | canonical yandex.ru; hyphens match dots; `+` |
| `yandex-360`       | Yandex 360 for Business    | business  | —                                            |
| `gmx`              | GMX                        | personal  | —                                            |
| `web-de`           | WEB.DE                     | personal  | —                                            |
| `mail-ru`          | Mail.ru                    | personal  | —                                            |
| `tuta`             | Tuta Mail                  | personal  | —                                            |
| `hey`              | HEY                        | personal  | —                                            |
| `namecheap`        | Namecheap Email Forwarding | registrar | —                                            |

The IDs are public: the sanitizer's `provider` option and validator-dns's
`detectProviderByMx` use them. A new provider is a minor release; changing or
removing an ID is breaking.

## Reason codes

None in v1 (see above).

## Decisions

- **C1 — Surface granularity.** **(a) individual primitives plus a composed
  `classify` — recommended**: primitives stay independently tree-shakeable
  through the subpaths, `classify` is what the umbrella pipeline calls;
  (b) only `classify`; (c) only the primitives.
- **C2 — Input type.** **(a) accept `string | ParsedAddress` — recommended**:
  standalone ergonomics without breaking the pipeline hand-off from
  validator-syntax; (b) strings only; (c) `ParsedAddress` only.
- **C3 — Result shape for lookups.** **(a) plain data returns —
  recommended**: honest API beats forced symmetry, and the conventions page
  states the `{ ok }` shape is for validation; (b) wrap everything in
  `{ ok: true, value }` anyway. This nuance is exactly why it needs explicit
  sign-off.
