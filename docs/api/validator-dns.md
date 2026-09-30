# @email-utils/validator-dns

Can the domain receive mail? MX, Null MX, signals, and, opt-in, SMTP probes
and a calibrated score.

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
  probeSmtp,
  scoreDns,
  createDnsValidator,
} from '@email-utils/validator-dns';

const result = await checkDns('ada@example.com');
if (result.ok) {
  result.value; // { hasMx: true, nullMx: false, implicitMx: false, hasSpf: true, ... }
} else {
  result.reason; // e.g. 'dns.mx.null' or 'dns.lookup.timeout'
}

await isValidDns('ada@example.com'); // sugar for (await checkDns(...)).ok

const provider = await detectProviderByMx('example.com');
if (provider.ok) {
  provider.value; // 'google-workspace' | 'microsoft365' | … | undefined
}

// Opt-in: connect, EHLO, and QUIT with each MX host (never MAIL or RCPT).
const probed = await probeSmtp('example.com');
if (probed.ok) {
  probed.value.accepted; // true when some MX host answered EHLO with 250
}

// Opt-in: how likely the MX hosts are to accept, from the DNS alone.
const scored = await scoreDns('example.com');
if (scored.ok) {
  scored.value.probability; // e.g. 0.97, calibrated on held-out domains
}

const validator = createDnsValidator({
  timeout: { query: 2000, overall: 5000 },
});
await validator.check('ada@example.com', { signal: request.signal });
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
): Promise<Result<ProviderId | undefined>>;

export function probeSmtp(
  emailOrDomain: string,
  options?: DnsOptions,
): Promise<Result<SmtpProbe>>;

export function scoreDns(
  emailOrDomain: string,
  options?: DnsOptions,
): Promise<Result<DnsScore>>;

export function createDnsValidator(options?: DnsValidatorOptions): DnsValidator;

export interface DnsValidator {
  check(
    emailOrDomain: string,
    options?: DnsCallOptions,
  ): Promise<Result<DnsSignals>>;
  isValid(emailOrDomain: string, options?: DnsCallOptions): Promise<boolean>;
  detectProviderByMx(
    emailOrDomain: string,
    options?: DnsCallOptions,
  ): Promise<Result<ProviderId | undefined>>;
  probeSmtp(
    emailOrDomain: string,
    options?: DnsCallOptions,
  ): Promise<Result<SmtpProbe>>;
  score(
    emailOrDomain: string,
    options?: DnsCallOptions,
  ): Promise<Result<DnsScore>>;
}

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
  timeout?: DnsTimeout;
  /** Rejects the check with the signal's `reason` when it aborts. */
  signal?: AbortSignal;
  /** How `probeSmtp` probes; the other functions ignore it. */
  smtp?: SmtpOptions;
  /** A bundled fit by name, or a model of your own — see Scoring. @default 'dns-reachability' */
  scoreModel?: DnsScoreModel | 'dns-reachability' | 'dns-only';
}

export interface SmtpOptions {
  /** 465 speaks TLS from the start (RFC 8314). @default [25] */
  ports?: number[];
  /** @default the address literal of the connection's local end, e.g. [192.0.2.1] */
  ehloName?: string;
  /** Each probe's budget, connecting to the EHLO reply, in ms. @default 10_000 */
  timeout?: number;
  /** One host at a time, stopping at the first that accepts. @default false */
  untilAccepted?: boolean;
}

export interface SmtpProbe {
  /** Some probe was `accepted`. */
  accepted: boolean;
  /** Each MX host in preference order, each port in turn. */
  probes: SmtpPortProbe[];
}

export interface SmtpPortProbe {
  host: string;
  port: number;
  outcome: SmtpOutcome;
  /** The last reply's code: EHLO's, or the greeting's. */
  code?: number;
  message?: string;
}

export type SmtpOutcome = 'accepted' | 'refused' | 'unreachable' | 'timeout';

export interface DnsTimeout {
  query?: number;
  overall?: number;
}

/** Per call to a validator's methods, alongside the validator's own signal. */
export interface DnsCallOptions {
  signal?: AbortSignal;
}

export interface DnsValidatorOptions extends DnsOptions {
  /** Minimal injectable resolver; defaults to node:dns/promises. */
  resolver?: DnsResolver;
  /** How long an answer stays cached, in ms; 0 caches nothing. @default 30_000 */
  cacheTtl?: number;
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

**Timeouts.** Each lookup has `timeout.query` (2 s) and the check as a whole
`timeout.overall` (5 s). A lookup that runs over counts as `ETIMEOUT`, so
the rules above apply to it: a silent MX server fails the check with
`dns.lookup.timeout`, and a silent TXT server leaves `hasSpf` `undefined`.
A check settles within its budget whatever the resolver does. Budgets are
milliseconds above 0 and at most 2³¹ − 1, the longest `setTimeout` takes.

**Cache.** A validator holds its resolver and a cache. Answers, including
"no records", stay for `cacheTtl` (30 s); failed and timed-out lookups are
never kept. A lookup already in flight is joined rather than made again, so
a thousand concurrent checks of one domain make one lookup per record type;
`cacheTtl: 0` keeps the joining and caches nothing else. A check that joins
a lookup is still held to its own budget and signals. Each record type keeps
at most 10,000 answers and drops the oldest to make room. A check whose
answers are all cached takes under 2 µs. `checkDns` and `isValidDns` share
one module-wide cache over `node:dns/promises`, the same code with default
options ([conventions D9](./conventions.md#functions)); each
`createDnsValidator` has its own.

**Abort.** When `signal`, or a call's `signal` on a validator, aborts, the
check rejects with the signal's `reason`, an `AbortError` unless the caller
gave one, and an already-aborted signal rejects before any lookup. It's the
one rejection besides a `TypeError`
([conventions D6](./conventions.md#errors)). A lookup other checks share
keeps going for them, and its answer is cached as usual. Resolver errors
map to `dns.*` reason codes, never throws.

**Providers.** `detectProviderByMx` looks up MX alone, through the same
parsing, budgets, signals, and cache as `checkDns`, and matches the hosts
against the `mxPatterns` in `@email-utils/classifier/providers`. A pattern
names one host, or with a leading `*.` any host one or more labels under
it; a host that merely contains a pattern, as 0.0.1's substring match
allowed, matches nothing. The hosts are tried in preference order and the
first one the registry knows names the provider, so a domain behind a
filtering gateway is still found by its Google or Microsoft backup MX.
The value is the classifier's `ProviderId`: `google-workspace` for
`smtp.google.com` or `aspmx.l.google.com`, `microsoft365`, `namecheap` for
the registrar's default forwarding MX. It's `undefined` when the MX answer
names no provider the registry knows, including a domain with no MX (an
implicit MX has no host to match), a Null MX, or no records at all. When it
can't tell, it fails as `checkDns` does, so "no known provider" and "don't
know" stay apart: `dns.address.unparsable` for input that doesn't parse,
and `dns.lookup.timeout` or `dns.lookup.failed` when the MX lookup does.

## Probes

`probeSmtp` is opt-in (N3). It runs `checkDns`, and fails as it does before
any connection. Then it probes each MX host, or the domain itself for an
implicit MX, on every port in `smtp.ports`, all at once, and waits for
every probe. A probe connects, reads the greeting, sends EHLO, and sends
QUIT. It never sends MAIL or RCPT, so it learns whether a mail server
answers, not whether a mailbox exists
([meta#18](https://github.com/email-utils/meta/issues/18)'s non-goal).

Each probe settles as one of:

| Outcome       | When                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| `accepted`    | A 220 greeting, then 250 to EHLO.                                          |
| `refused`     | Any other reply, a malformed one, a hang-up, or a reset after connecting.  |
| `unreachable` | Nothing took the connection (`ECONNREFUSED`, `EHOSTUNREACH`, `ENOTFOUND`). |
| `timeout`     | No greeting or EHLO reply within `smtp.timeout`.                           |

`accepted` on the result is whether any probe was. The outcome is data,
not a failure: a domain whose every probe is refused is still
`{ ok: true }`. `code` is the last reply's, and `message` is for people.

**Ports.** The default is 25 only: it's where MX hosts take mail from other
servers. 587 and 465 are for clients submitting mail to their own provider,
often on other hosts, so an MX that doesn't answer there says little. 0.0.1
probed all three and added points for each. `smtp.ports` takes any ports;
465 speaks TLS from the first byte, and the certificate is checked as
Node checks it by default: a server whose certificate doesn't verify is
`refused`, with the TLS error in `message`. Skipping the check would have
cost little, since a probe sends nothing secret, but a library that turns
off certificate validation hands that finding to every scanner that reads
it.

**EHLO.** The name sent is the address literal of the connection's local
end (`[192.0.2.1]`, `[IPv6:2001:db8::1]`), the form RFC 5321 §4.1.4 gives a
client without a meaningful name, which tells the server nothing it can't
already see. `smtp.ehloName` replaces it, and must be printable ASCII
without spaces, so it can't smuggle in another command.

**One host at a time.** With `smtp.untilAccepted`, the hosts are tried one
after another in preference order, each on every port at once, and the
probe stops at the first host that accepts. `accepted` means the same, and
`probes` lists only the hosts tried. It takes fewer connections, which
matters to a caller probing many domains from a network that throttles
port 25, and longer when hosts don't answer.

**Budgets and abort.** The lookups keep their own budgets; each probe then
has `smtp.timeout` (10 s), since some servers pause before greeting. An
abort closes every connection and rejects with the signal's `reason`.

**Where it runs.** Many networks block outbound port 25, home ISPs and cloud
hosts among them. From there every probe comes back `timeout` or
`unreachable` whatever the domain does, so read those as "couldn't connect
from here", not "the domain is dead". The package's tests only talk to
servers on the loopback; nothing in CI probes a real mail server.

## Scoring

Scoring is opt-in and separate from `checkDns` (N1), because it answers a
different question: not "do the RFCs say this domain can receive mail" but
"how likely is this domain to actually accept a message". That second
question is a measurement, so the score is defined as one:

```ts
export function scoreDns(
  emailOrDomain: string,
  options?: DnsOptions,
): Promise<Result<DnsScore>>;

export interface DnsScore {
  /**
   * Calibrated estimate of P(an MTA for this domain accepts a connection),
   * in [0, 1]. Calibrated means: across held-out domains scoring ~0.9,
   * ~90% accept.
   */
  probability: number;
  signals: DnsSignals;
  /** Per-feature log-odds contributions, so a score can be explained. */
  contributions: Partial<Record<ScoreFeature, number>>;
  model: { id: string; version: string };
}

export interface DnsScoreModel {
  id: string;
  version: string;
  /** Within ±1e6. */
  intercept: number;
  /** Fitted log-odds coefficients, not hand-chosen points; each within ±1e6. */
  coefficients: Partial<Record<ScoreFeature, number>>;
}

/** A signal, or `knownProvider` / `multipleMx`, derived from `mxHosts`. */
export type ScoreFeature = keyof DnsSignals | 'knownProvider' | 'multipleMx';
```

Input `checkDns` fails, `scoreDns` fails the same way: a domain the RFCs
say can't receive mail, or one whose lookups failed, has no signals to
score. No probe is made.

**What the number means.** `probability` estimates P(connection accepted)
given the DNS signals, via `logistic(intercept + Σ coefficientᵢ · signalᵢ)`.
A `true` signal is 1, and `false` or `undefined` (a failed lookup) is 0;
`mxHosts` is the number of hosts, `multipleMx` is whether there is more
than one, and `knownProvider` is whether the MX matches a provider in
`@email-utils/classifier/providers` — the match `detectProviderByMx` makes.
It is not a point total and there is no magic pass mark. Callers pick a
threshold from the published precision/recall table for the tolerance they
want, rather than comparing against a `validScore` constant.

**Two bundled models.** `scoreModel` names one of two fits of the same
corpus and split, or takes a model of your own, whose calibration is then
yours. The default, `dns-reachability`, counts `knownProvider` besides the
DNS signals: domains whose MX the registry knows accepted almost without
exception in the corpus, which makes it the strongest feature and, in
practice, the only way to a score above ~0.9. `dns-only` reads the DNS
signals alone, for callers who don't want scores to move as the registry
grows (N8). Held-out examples — [the 1.0.0 report](https://github.com/email-utils/validator-dns/blob/main/model/report-1.0.0.md)
has the full precision/recall and calibration tables:

| Domain looks like           | dns-reachability | dns-only | Probe found |
| --------------------------- | ---------------- | -------- | ----------- |
| MX on Google Workspace, SPF | 99%              | 90%      | accepted    |
| MX on Microsoft 365, SPF    | 99%              | 81%      | accepted    |
| Self-hosted, one MX, SPF    | 75%              | 81%      | accepted    |
| Self-hosted, one MX, no SPF | 62%              | 70%      | accepted    |
| No MX, A records only       | 2%               | 2%       | timeout     |

**Where the coefficients come from.** They are fitted by logistic regression
on a labeled corpus, shipped as versioned data, and never invented. Logistic
regression is what makes the number interpretable _and_ handles the fact that
the signals are heavily correlated — `hasMx`, `hasA`, and `hasSpf` co-occur,
so the additive point scheme in 0.0.1 double-counted the same evidence.

**Where the labels come from.** Features come from DNS and the provider
registry; labels are SMTP reachability — `probeSmtp` on port 25 against the
domain's MX hosts, with `accepted` as the label. The probe never issues
`RCPT TO`, so this stays clear of the mailbox-probing non-goal in
[meta#18](https://github.com/email-utils/meta/issues/18). Because the label
comes from a channel the scorer does not use as a feature, there is no
leakage: the models predict reachability without probing.

**What ships with the model.** Every released model version publishes its
corpus size and composition, the fit, held-out precision/recall at candidate
thresholds, and a reliability check that the probabilities are calibrated.
Refitting changes outputs for unchanged input, so a new model version is a
`feat` at minimum, never a `fix`, and the previous version stays importable
for a major cycle. Supplying `scoreModel`/`model` yourself is supported and
explicitly voids the calibration guarantee. Its intercept and coefficients
must be within ±1e6, or it throws a `TypeError`: a fitted model's are single
digits, and the bound keeps the log-odds finite, where terms that overflow
to `Infinity` and `-Infinity` would make the probability `NaN`
([validator-dns#30](https://github.com/email-utils/validator-dns/issues/30)).

**The corpus.** `scripts/corpus.ts` in validator-dns samples domains
uniformly from a [Tranco](https://tranco-list.eu/) top-1M list, runs
`checkDns` on each, and probes the ones that pass. It's run by hand, never
in CI. A lookup that fails isn't recorded, and a domain that didn't accept
is only recorded once control probes of domains that accepted earlier
succeed after it, so a dropped or throttled connection can't pass for a
refusal; a rerun carries on where the last one stopped. `scripts/fit.ts`
fits both models on 80% of the domains, chosen by a hash of the name, and
measures them on the rest; rows whose only replies were 4xx (greylisting:
"try again later") are excluded, since they say nothing about whether the
domain accepts. The corpus, the models, and each version's report (corpus
composition, the classifier version the fit matched against, coefficients,
held-out precision/recall, calibration, and worked examples) are in the
repo's
[`model/`](https://github.com/email-utils/validator-dns/tree/main/model);
[`METHODOLOGY.md`](https://github.com/email-utils/validator-dns/blob/main/model/METHODOLOGY.md)
there explains the method and the math from first principles.

Numbers presented as probabilities must be measured: no hand-tuned weights
ship behind this API (N6). The probes are the label source, not features,
and do not enter the model (N3).

## Reason codes

The `dns.*` namespace in the [catalogue](./reason-codes.md#dns):
`dns.address.unparsable`, `dns.domain.not_found`, `dns.mx.none`,
`dns.mx.null`, `dns.lookup.timeout`, `dns.lookup.failed`.

## Migrating from 0.0.1

The `EmailDnsValidator` class, default export, and score-thresholded
`validate(): Promise<boolean>` are replaced by `checkDns` (RFC rules) and
`scoreDns` (opt-in, calibrated). The `a`/`ns`/`spf`/`port`/`mx`/`validScore`
weight config is gone: NS no longer hard-fails subdomains, and weights are
fitted rather than configured. SPF is parsed from joined TXT chunks, and
AAAA is looked up. Port probes move to the opt-in `probeSmtp`, which awaits
them (0.0.1 never did), probes port 25 alone by default rather than
`smtpPorts` 25, 465, and 587, and reads the greeting and EHLO reply rather
than counting a bare connection. `isGSuiteMX` and
`isDefaultNamecheapMX` become one `detectProviderByMx` returning a
`ProviderId` in a result, which fails rather than answering `false` when
the MX lookup fails. See
[validator-dns#7](https://github.com/email-utils/validator-dns/issues/7),
[#8](https://github.com/email-utils/validator-dns/issues/8),
[#9](https://github.com/email-utils/validator-dns/issues/9), and
[#10](https://github.com/email-utils/validator-dns/issues/10).

## Decisions

- **N1 — Scoring exposure.** **(a) `checkDns` from RFC rules only, scoring as
  a separate opt-in `scoreDns` — recommended**: they answer different
  questions, and [validator-dns#10](https://github.com/email-utils/validator-dns/issues/10) already calls scoring opt-in; (b) one function whose
  `scoring` option changes the return type. Amended for validator-dns#10:
  `scoreDns` returns `Result<DnsScore>`, failing as `checkDns` does, since
  a domain that fails the RFC rules has no signals to score; the model is
  `scoreModel` on `DnsOptions` for both it and a validator, naming a
  bundled fit or supplying your own; and a validator's `score` takes a
  per-call `signal`.
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
  with no label source. Amended for validator-dns#10: probing is its own
  `probeSmtp` and validator method, so `DnsSignals` stays DNS-only; a probe
  reads the greeting and EHLO reply and sends QUIT, since a bare
  connection can't tell a server that answers from one that refuses with
  554; and it probes port 25 alone by default (see Probes).
- **N4 — Cache and resolver surface.** **(a) factory-internal cache with an
  injectable minimal resolver — recommended**, per [validator-dns#8](https://github.com/email-utils/validator-dns/issues/8); (b) expose the cache
  as its own primitive. Amended for validator-dns#8: `checkDns` shares one
  module-wide cache, since D9 makes the top-level functions the factory's
  code with default options; a validator's methods take a per-call
  `signal`, so a server can abort each request on one shared validator; and
  an abort rejects with the signal's `reason` rather than returning a
  result (see Abort).
- **N5 — Provider detection.** **(a) `detectProviderByMx` lives here and
  matches against the classifier's registry patterns, returning the same
  `ProviderId` — recommended**: this is what
  [#9](https://github.com/email-utils/validator-dns/issues/9) specifies —
  the patterns are classifier _data_, the MX matching is a DNS operation;
  (b) move detection wholly into classifier, which cannot work: the
  classifier is sync and does no I/O. The Google MX hosts #9 lists
  (`aspmx.l.google.com`, `smtp.google.com`) identify the `google-workspace`
  entry; gmail.com itself is the separate `gmail` entry (Z6 on the
  [sanitizer page](./sanitizer.md#decisions)). Amended for validator-dns#9:
  the first host in preference order that the registry knows names the
  provider; it returns `Result<ProviderId | undefined>` rather than a bare
  `ProviderId | undefined`, so a failed or timed-out MX lookup is a
  `dns.lookup.*` failure rather than an `undefined` that reads as "no known
  provider"; and a validator's `detectProviderByMx` takes a per-call
  `signal` like its other methods.
- **N6 — Scoring in v1 without a corpus.** **(a) hold `scoreDns` back to a
  later minor if the labeled corpus and fit are not ready — recommended**:
  an uncalibrated probability is a false claim, and adding the export later
  is non-breaking; (b) ship `scoreDns` in v1 with hand-tuned weights
  documented as provisional; (c) ship it returning `signals` plus a raw
  point total with no probability claim. Resolved for validator-dns#10:
  the corpus was collected and the model fitted in the same issue, so
  `scoreDns` ships in v1 with a measured model.
- **N7 — Threshold guidance.** **(a) publish a precision/recall table per
  model version and let callers pick — recommended**: the right cut depends
  on whether false accepts or false rejects cost more; (b) ship a single
  recommended `isLikelyDeliverable` boolean at a fixed cut.
- **N8 — The registry in the score.** **(a) `dns-reachability` computes
  `knownProvider` from the installed classifier's registry — recommended**:
  one code path, the very match `detectProviderByMx` makes, and a registry
  addition only moves domains from the middle of the range toward the ~99%
  measured for the registry's providers, since providers are added
  precisely because they are major hosted-mail operators. The classifier
  version the fit matched against is recorded in the model report. (b) Pin
  a snapshot of the patterns into the model, which would let the score
  disagree with `detectProviderByMx` for the same domain. Callers who want
  a score the registry can never move pick the bundled `dns-only` model
  instead.
