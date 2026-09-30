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
  isRoleAccount,
  suggestCorrection,
  getProvider,
} from '@email-utils/classifier';
import { isDisposable } from '@email-utils/classifier/disposable';
import { classify } from '@email-utils/classifier/classify';

classify('ceo@mailinator.com');
// { provider: undefined, disposable: true, role: true, suggestion: undefined }

isDisposable('a@mailinator.com'); // true
isRoleAccount('admin@example.com'); // true
suggestCorrection('ada@gmial.com'); // 'ada@gmail.com'
getProvider('ada@googlemail.com'); // { id: 'gmail', name: 'Gmail', … }
```

## Exports

```ts
export function isRoleAccount(email: string | ParsedAddress): boolean;
export function suggestCorrection(
  email: string | ParsedAddress,
): string | undefined;
export function getProvider(
  email: string | ParsedAddress,
): ProviderInfo | undefined;

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

The heavy data sets live in subpaths
([conventions D10](./conventions.md#modules)). The root re-exports
`getProvider`, but not `isDisposable`, `classify`, or `createClassifier`, so
importing the root never loads the disposable-domain list:

```ts
// Provider registry only
import { getProvider, providers } from '@email-utils/classifier/providers';

// Disposable-domain set only; the root doesn't re-export it
import { isDisposable } from '@email-utils/classifier/disposable';
// export function isDisposable(email: string | ParsedAddress): boolean;

// Every check at once; loads the disposable-domain set
import {
  classify,
  createClassifier,
  defaultIgnore,
} from '@email-utils/classifier/classify';

// Where each registry fact comes from, for the docs' support matrix
import { providerSources } from '@email-utils/classifier/sources';
```

`/classify` exports `classify` and the `createClassifier` factory. `classify`
parses a string once and runs the four checks on it; every key is present,
so an address the classifier knows nothing about is
`{ provider: undefined, disposable: false, role: false, suggestion: undefined }`.

```ts
export function classify(
  email: string | ParsedAddress,
  options?: ClassifyOptions,
): Classification;

export function createClassifier(options?: ClassifyOptions): Classifier;

export interface ClassifyOptions {
  /**
   * Domains that `suggestCorrection` corrects toward, ahead of the common
   * mailbox domains, and never away from, such as your own company's.
   * Compared without case.
   */
  domains?: readonly string[] | undefined;
  /**
   * Domains that are never corrected and never corrected toward. Replaces
   * `defaultIgnore`; spread it in to keep them.
   */
  ignore?: readonly string[] | undefined;
  /** The layout key distance is measured on; `'qwerty'` by default. */
  keyboard?: Keyboard | undefined;
  /** The most edits a typo may be from a known domain; 1 by default. */
  maxEdits?: 0 | 1 | 2 | undefined;
  /**
   * How many keys apart a typed letter may be from the intended one and
   * still count as one edit; 1 (neighbors) by default, `Infinity` for any.
   */
  maxKeyDistance?: number | undefined;
}

export type Keyboard = 'qwerty' | 'qwertz' | 'azerty';

/** The real domains near a common one that are never corrected by default. */
export const defaultIgnore: readonly string[]; // ['mail.com', 'email.com']

export interface Classification {
  provider: ProviderInfo | undefined;
  disposable: boolean;
  role: boolean;
  /** A likely intended address when the domain looks like a typo. */
  suggestion: string | undefined;
}

export interface Classifier {
  classify(email: string | ParsedAddress): Classification;
  isDisposable(email: string | ParsedAddress): boolean;
  isRoleAccount(email: string | ParsedAddress): boolean;
  suggestCorrection(email: string | ParsedAddress): string | undefined;
  getProvider(email: string | ParsedAddress): ProviderInfo | undefined;
}
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
  The one exception is `suggestCorrection`, which skips the IANA TLD check,
  since a mistyped TLD like `.con` is what it's there to fix. So
  `classify('ada@gmail.con')` knows nothing but the suggestion.
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

### Role accounts

`isRoleAccount` is true when the local part names a function rather than a
person. It compares the local part without case and without a `+` tag, so
`Support+billing@` counts. The list holds each common spelling rather than
folding separators, so `no-reply`, `no_reply`, and `noreply` are all listed:

- **RFC 2142 and RFC 5321:** `abuse`, `ftp`, `hostmaster`, `info`,
  `marketing`, `news`, `noc`, `postmaster`, `sales`, `security`, `support`,
  `usenet`, `uucp`, `webmaster`, `www`.
- **Senders that take no replies:** `noreply`, `donotreply`, and their
  hyphen and underscore spellings, and `mailer-daemon`.
- **Running the system:** `admin`, `administrator`, `it`, `root`,
  `sysadmin`.
- **Teams and desks:** `accounting`, `accounts`, `billing`, `careers`,
  `compliance`, `contact`, `customerservice`, `enquiries`, `feedback`,
  `finance`, `hello`, `help`, `helpdesk`, `hr`, `inquiries`, `jobs`,
  `legal`, `media`, `office`, `orders`, `press`, `privacy`, `service`,
  `team`.
- **Lists and notifications:** `alerts`, `all`, `everyone`, `newsletter`,
  `notifications`, `staff`.
- **Offices rather than their holders:** `ceo`, `cfo`, `coo`, `cto`.

Adding or removing a name changes which addresses count, so it's a minor
release, like a new provider.

### Disposable domains

`isDisposable` is true when the address's domain, or a parent of it, is a
known throwaway-mailbox domain: `a@mailinator.com` and `a@x.mailinator.com`
both are. The domain is compared without case, and an internationalized
domain by its A-label. A domain literal or a dotless domain is never
disposable.

- **Source:** the
  [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains)
  blocklist (CC0 1.0), vendored into the package. The upstream commit is at
  the top of `src/disposable/data.ts`, and `THIRD_PARTY_NOTICES.md`, which
  ships with the package, attributes it.
- **Parent domains:** upstream lists registrable domains, so the check walks
  from the full domain down to two labels. No TLD is ever matched.
- **Loading:** the list is one string in the `/disposable` entry, split into
  a set on the first call. The root entry doesn't import it; `classify` and
  `createClassifier`, which need it, are in their own `/classify` entry for
  that reason.
- **Refresh:** a weekly workflow in the classifier repo updates the list and
  opens a `fix(data)` PR that merges itself once the PR gate passes, so each
  change ships as a patch release. The gate's tests fail if a provider
  registry domain appears on the list, which leaves that PR for a person.

### Typo suggestions

`suggestCorrection` returns the address with its domain corrected when the
domain looks like a slip for a common mailbox domain, and `undefined`
otherwise. The local part is kept as written; the domain comes back in
lowercase.

- **Targets:** about fifty of the registry's widely used domains, most used
  first, since a tie goes to the earlier one: `ada@hotmail.dr` becomes
  `hotmail.fr` rather than `hotmail.de`. Most of Fastmail's alias domains
  aren't targets, or `gmail.co.uk` would become `fmail.co.uk`.
  `createClassifier({ domains })` adds targets ahead of these.
- **Distance:** optimal string alignment, where an insertion, a deletion,
  or two neighboring letters swapped is one edit, so `gamil.com` is one
  edit from `gmail.com`. A substitution is one edit when the two keys are
  at most `maxKeyDistance` apart (1, touching, by default) and two
  otherwise, the same as a deletion and an insertion: `gotmail.com` is one
  edit from `hotmail.com` (G beside H), but `lastmail.com`, a disposable
  service, is two from `fastmail.com` (L five keys from F). Keys touch in
  their row and diagonally above and below, on the `keyboard` layout.
  Letters and digits are on each layout; any other character substitutes
  only with `maxKeyDistance: Infinity`.
- **Edit limit:** a domain within `maxEdits` of a target (1 by default) is
  taken for the closest, the earlier on a tie. At 2, `yopmail.com`, a
  disposable service of its own, would become `ymail.com`; at 0 only TLDs
  are fixed. Names of three letters or fewer (`me.com`, `gmx.de`) are never
  guessed at, since they're one edit from too many real domains.
- **TLDs:** a TLD outside the IANA set that's a common slip for `.com`,
  `.net`, or `.org`, like `.con`, `.cmo`, or `.nte`, is fixed on any
  domain, before the distance is measured: `ada@gmial.con` becomes
  `ada@gmail.com`, and `ada@example.con` becomes `ada@example.com`.
- **Never corrected:** any registry domain, and subdomains that
  `getProvider` matches; the `domains` option; the `ignore` option, which
  are never corrected toward either; and domain literals and dotless or
  internationalized domains. `ignore` defaults to `defaultIgnore`,
  `mail.com` and `email.com`, which are one edit from `gmail.com`, and
  replaces it when given: `ignore: [...defaultIgnore, 'example.com']`
  keeps them.
- **Disposable typos:** some typo-squatted domains, like `gmial.com`, are
  on the disposable list, so `classify` can report an address as both
  disposable and a likely typo. The two checks don't consult each other; a
  form that rejects disposable addresses may want to offer the suggestion
  first. The classifier's tests pin which listed domains get a suggestion,
  so a list refresh that adds one near a target waits for a person.

Adding a target, a TLD fix, or a `defaultIgnore` domain, or changing a
layout, changes which addresses get a suggestion, so it's a minor release,
like a new provider. Changing a default option is breaking.

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
