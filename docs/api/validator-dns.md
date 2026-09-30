# @email-utils/validator-dns

Can the domain receive mail? MX, Null MX, signals.

Node-only, and the suite's only async package
([conventions D7](./conventions.md#sync-and-async)).

```sh
npm install @email-utils/validator-dns
```

## Quick start

```ts
import {
  checkDns,
  isValidDns,
  detectProviderByMx,
  createDnsValidator,
} from '@email-utils/validator-dns';

const result = await checkDns('ada@example.com');
if (result.ok) {
  result.value; // { hasMx: true, nullMx: false, implicitMx: false, hasSpf: true, ... }
} else {
  result.reason; // e.g. 'dns.mx.null' or 'dns.lookup.timeout'
}

await isValidDns('ada@example.com'); // sugar for (await checkDns(...)).ok

await detectProviderByMx('example.com'); // 'google-workspace' | 'microsoft365' | … | undefined

const validator = createDnsValidator({
  timeout: { query: 2000, overall: 5000 },
});
await validator.check('ada@example.com');
```

## Exports

```ts
export function checkDns(
  emailOrDomain: string,
  options?: DnsOptions,
): Promise<Result<DnsSignals>>;

export function isValidDns(
  emailOrDomain: string,
  options?: DnsOptions,
): Promise<boolean>;

export function detectProviderByMx(
  emailOrDomain: string,
  options?: DnsOptions,
): Promise<ProviderId | undefined>;

export function createDnsValidator(options?: DnsValidatorOptions): {
  check(emailOrDomain: string): Promise<Result<DnsSignals>>;
  isValid(emailOrDomain: string): Promise<boolean>;
  detectProviderByMx(emailOrDomain: string): Promise<ProviderId | undefined>;
  score(emailOrDomain: string): Promise<DnsScore>;
};

export interface DnsSignals {
  /** MX records other than a Null MX. */
  hasMx: boolean;
  /** A Null MX (RFC 7505) was published; see Behavior. */
  nullMx: boolean;
  /** No MX, but A/AAAA serves as the implicit MX (RFC 5321 §5.1). */
  implicitMx: boolean;
  /** `undefined` when the A lookup failed. */
  hasA: boolean | undefined;
  /** `undefined` when the AAAA lookup failed. */
  hasAaaa: boolean | undefined;
  /** A `v=spf1` record in the joined TXT chunks; `undefined` when the TXT lookup failed. */
  hasSpf: boolean | undefined;
  /** Lowercased, without the trailing dot, in preference order; empty for an implicit MX. */
  mxHosts: string[];
}

export interface DnsOptions {
  /**
   * How the input is parsed before any lookup.
   * @default validator-syntax's `practical` preset with `allowIdn`
   */
  syntax?: SyntaxOptions;
  /** Per-query and overall budgets in milliseconds. @default { query: 2000, overall: 5000 } */
  timeout?: { query?: number; overall?: number };
  signal?: AbortSignal;
}

export interface DnsValidatorOptions extends DnsOptions {
  /** Minimal injectable resolver; defaults to node:dns/promises. */
  resolver?: DnsResolver;
  /** TTL for the shared cache. @default 30_000 */
  cacheTtl?: number;
  /** Override the fitted scoring model. Doing so voids calibration — see Scoring. */
  scoreModel?: DnsScoreModel;
}

export interface DnsResolver {
  resolveMx(domain: string): Promise<{ exchange: string; priority: number }[]>;
  resolve4(domain: string): Promise<string[]>;
  resolve6(domain: string): Promise<string[]>;
  resolveTxt(domain: string): Promise<string[][]>;
}
```

## Behavior

`checkDns` answers one question — can this domain receive mail — by RFC
rules, not by taste: accept when MX records exist, or when A/AAAA serves as
the implicit MX (RFC 5321 §5.1); reject Null MX (RFC 7505). Everything it
learned on the way is on the success value as signals (N2). Input is
punycoded before lookup, and unparsable input short-circuits without a query.

**Parsing.** The input is trimmed and parsed with validator-syntax, using the
`syntax` option. `allowIdn` is on by default, since looking up an IDN domain
by its A-labels is part of the job; it stays off for the `html5` preset,
which can't hold IDN domains. A string without an `@` is a bare domain.
These fail with `dns.address.unparsable` before any lookup: input the syntax
options reject, a domain literal (`[192.0.2.1]` has nothing to look up), and
an `rfc5322` domain with atext no hostname can hold (`a#b.com`).

**Lookups.** MX, A, AAAA, and TXT are looked up at once; NS isn't, so a
subdomain without NS records of its own passes. `ENODATA` and `ENOTFOUND`
mean no records. The domain fails with `dns.domain.not_found` when all four
come back empty, and with `dns.mx.none` when only TXT has records.

**Null MX.** A Null MX is an MX record whose host is `.`. On its own it fails
the check with `dns.mx.null`, even when the domain has A records. RFC 7505
forbids publishing it next to other MX records; when a domain does, the other
records are used and `nullMx` is still `true`.

**Failed lookups.** A failed lookup fails the check only when the answer
rests on it: MX always, and A or AAAA when there's no MX and the other one
has no records. The result is `dns.lookup.timeout` for `ETIMEOUT` and
`dns.lookup.failed` otherwise. Any other failed lookup leaves its signal
`undefined` rather than `false`, so a flaky TXT server doesn't fail a domain
that receives mail, and a score over the signals can tell "no SPF" from "not
known".

The factory holds the resolver and a TTL cache with in-flight dedupe, so a
thousand concurrent checks of one domain make one lookup per record type.
The factory, `timeout`, and `signal` come with
[validator-dns#8](https://github.com/email-utils/validator-dns/issues/8);
until then lookups use `node:dns/promises` with Node's own timeouts.
Resolver errors map to `dns.*` reason codes, never throws
([conventions D6](./conventions.md#errors)).

## Scoring

Scoring is opt-in and separate from `checkDns` (N1), because it answers a
different question: not "do the RFCs say this domain can receive mail" but
"how likely is this domain to actually accept a message". That second
question is a measurement, so the score is defined as one:

```ts
export function scoreDns(
  emailOrDomain: string,
  options?: DnsOptions & { model?: DnsScoreModel },
): Promise<DnsScore>;

export interface DnsScore {
  /**
   * Calibrated estimate of P(an MTA for this domain accepts a connection),
   * in [0, 1]. Calibrated means: across held-out domains scoring ~0.9,
   * ~90% accept.
   */
  probability: number;
  signals: DnsSignals;
  /** Per-signal log-odds contributions, so a score can be explained. */
  contributions: Partial<Record<keyof DnsSignals, number>>;
  model: { id: string; version: string };
}

export interface DnsScoreModel {
  id: string;
  version: string;
  intercept: number;
  /** Fitted log-odds coefficients, not hand-chosen points. */
  coefficients: Partial<Record<keyof DnsSignals, number>>;
}
```

**What the number means.** `probability` estimates P(connection accepted)
given the DNS signals, via `logistic(intercept + Σ coefficientᵢ · signalᵢ)`.
It is not a point total and there is no magic pass mark. Callers pick a
threshold from the published precision/recall table for the tolerance they
want, rather than comparing against a `validScore` constant.

**Where the coefficients come from.** They are fitted by logistic regression
on a labeled corpus, shipped as versioned data, and never invented. Logistic
regression is what makes the number interpretable _and_ handles the fact that
the signals are heavily correlated — `hasMx`, `hasA`, and `hasSpf` co-occur,
so the additive point scheme in 0.0.1 double-counted the same evidence.

**Where the labels come from.** Features are DNS-only; labels are SMTP
reachability — connect and `EHLO` against the domain's MX hosts, recorded as
accepted or refused. The probe never issues `RCPT TO`, so this stays clear of
the mailbox-probing non-goal in
[meta#18](https://github.com/email-utils/meta/issues/18). Because the label
comes from a channel the scorer does not use as a feature, there is no
leakage: the model predicts reachability from DNS alone.

**What ships with the model.** Every released model version publishes its
corpus size and composition, the fit, held-out precision/recall at candidate
thresholds, and a reliability check that the probabilities are calibrated.
Refitting changes outputs for unchanged input, so a new model version is a
`feat` at minimum, never a `fix`, and the previous version stays importable
for a major cycle. Supplying `scoreModel`/`model` yourself is supported and
explicitly voids the calibration guarantee.

**If the corpus is not ready, scoring does not ship.** Numbers presented as
probabilities must be measured; shipping hand-tuned weights behind this API
would be worse than shipping `checkDns` and `signals` alone and adding
`scoreDns` in a later minor (N6).

Optional SMTP port probes ([validator-dns#10](https://github.com/email-utils/validator-dns/issues/10)) run in parallel and are awaited. They are a
diagnostic signal for callers who opt in — and the label source for fitting —
but they are not DNS features and do not enter the model (N3).

## Reason codes

The `dns.*` namespace in the [catalogue](./reason-codes.md#dns):
`dns.address.unparsable`, `dns.domain.not_found`, `dns.mx.none`,
`dns.mx.null`, `dns.lookup.timeout`, `dns.lookup.failed`.

## Migrating from 0.0.1

The `EmailDnsValidator` class, default export, and score-thresholded
`validate(): Promise<boolean>` are replaced by `checkDns` (RFC rules) and
`scoreDns` (opt-in, calibrated). The `a`/`ns`/`spf`/`port`/`mx`/`validScore`
weight config is gone: NS no longer hard-fails subdomains, and weights are
fitted rather than configured. SPF is parsed from joined TXT chunks, AAAA is
looked up, and port probes are awaited. `isGSuiteMX` and
`isDefaultNamecheapMX` become one `detectProviderByMx` returning a
`ProviderId`. See
[validator-dns#7](https://github.com/email-utils/validator-dns/issues/7),
[#8](https://github.com/email-utils/validator-dns/issues/8),
[#9](https://github.com/email-utils/validator-dns/issues/9), and
[#10](https://github.com/email-utils/validator-dns/issues/10).

## Decisions

- **N1 — Scoring exposure.** **(a) `checkDns` from RFC rules only, scoring as
  a separate opt-in `scoreDns` — recommended**: they answer different
  questions, and [validator-dns#10](https://github.com/email-utils/validator-dns/issues/10) already calls scoring opt-in; (b) one function whose
  `scoring` option changes the return type.
- **N2 — Signals surface.** **(a) expose `DnsSignals` on the success value —
  recommended**: #7 requires correct signals anyway and callers need them;
  (b) keep them internal. Amended for validator-dns#7: `hasA`, `hasAaaa`,
  and `hasSpf` are `undefined` when their lookup failed, and a failed lookup
  fails the check only when the answer rests on it (see Failed lookups).
- **N3 — SMTP port probing.** **(a) keep it, opt-in, parallel and awaited, as
  a diagnostic and as the scoring label source — recommended**: this is what
  [#10](https://github.com/email-utils/validator-dns/issues/10) specifies,
  and without it there is no label channel that avoids `RCPT TO`; (b) drop
  probing from v1, which contradicts validator-dns#10 and leaves scoring
  with no label source.
- **N4 — Cache and resolver surface.** **(a) factory-internal cache with an
  injectable minimal resolver — recommended**, per [validator-dns#8](https://github.com/email-utils/validator-dns/issues/8); (b) expose the cache
  as its own primitive.
- **N5 — Provider detection.** **(a) `detectProviderByMx` lives here and
  matches against the classifier's registry patterns, returning the same
  `ProviderId` — recommended**: this is what
  [#9](https://github.com/email-utils/validator-dns/issues/9) specifies —
  the patterns are classifier _data_, the MX matching is a DNS operation;
  (b) move detection wholly into classifier, which cannot work: the
  classifier is sync and does no I/O. The Google MX hosts #9 lists
  (`aspmx.l.google.com`, `smtp.google.com`) identify the `google-workspace`
  entry; gmail.com itself is the separate `gmail` entry (Z6 on the
  [sanitizer page](./sanitizer.md#decisions)).
- **N6 — Scoring in v1 without a corpus.** **(a) hold `scoreDns` back to a
  later minor if the labeled corpus and fit are not ready — recommended**:
  an uncalibrated probability is a false claim, and adding the export later
  is non-breaking; (b) ship `scoreDns` in v1 with hand-tuned weights
  documented as provisional; (c) ship it returning `signals` plus a raw
  point total with no probability claim.
- **N7 — Threshold guidance.** **(a) publish a precision/recall table per
  model version and let callers pick — recommended**: the right cut depends
  on whether false accepts or false rejects cost more; (b) ship a single
  recommended `isLikelyDeliverable` boolean at a fixed cut.
