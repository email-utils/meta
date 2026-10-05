// Vitest's JSON reporter output for `vitest bench`, read and compared: base
// against head for the PR bench leg, and same against same for its noise
// calibration. Each benchmark is an op keyed `<file> > <test> > <bench>`.
//
// A bench test can describe its benches in `task.meta.bench`, keyed by bench
// name, and the JSON reporter carries it through:
//
//   p50, p99   Absolute targets in nanoseconds, on the reference machine.
//              Shown here; the nightly checks them (meta#21).
//   within     { bench, max }: at most `max` times another bench in the same
//              test, in the same run. Checked here.
//   legacy     The 0.0.1 bench in the same test that does the same work.
//              Reported as how many times faster this one is.
//   faster     With `legacy`: at least this many times faster. Checked here.
//   source     The issue that set the targets, like `validator-syntax#9`.
import fs from 'node:fs';
import path from 'node:path';

// A regression is a head slower than base by more than the larger of these:
// a floor, and a multiple of the op's calibrated A/A noise.
export const MIN_THRESHOLD = 0.1;
export const NOISE_MULTIPLE = 3;

const NS_PER_MS = 1e6;

/**
 * One results file's ops and failed bench tests. Bench files live under
 * bench/, as the synced vitest config includes them, so each op's file is
 * the path from there: the same in every clone, on every runner.
 */
export function readBench(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ops = new Map();
  const failed = [];
  for (const testResult of data.testResults ?? []) {
    const name = testResult.name.split(path.sep).join('/');
    const rel = name.slice(name.lastIndexOf('/bench/') + 1);
    if (testResult.status === 'failed' && testResult.message) {
      failed.push({ name: rel, message: testResult.message.split('\n')[0] });
    }
    for (const assertion of testResult.assertionResults ?? []) {
      const test = assertion.fullName;
      if (assertion.status === 'failed') {
        const message = (assertion.failureMessages?.[0] ?? '').split('\n')[0];
        failed.push({ name: `${rel} > ${test}`, message });
      }
      const meta = assertion.meta?.bench ?? {};
      for (const benchmark of assertion.benchmarks ?? []) {
        for (const task of benchmark.tasks ?? []) {
          if (!task.latency) continue;
          const key = `${rel} > ${test} > ${task.name}`;
          ops.set(key, {
            key,
            file: rel,
            test,
            bench: task.name,
            mean: task.latency.mean * NS_PER_MS,
            p50: task.latency.p50 * NS_PER_MS,
            p99: task.latency.p99 * NS_PER_MS,
            meta: meta[task.name] ?? {},
          });
        }
      }
    }
  }
  return { ops, failed };
}

/** The op in the same test as `op` whose bench is named `bench`. */
function sibling(ops, op, bench) {
  return ops.get(`${op.file} > ${op.test} > ${bench}`);
}

/**
 * Head against base, op by op. `base` may be null, when the base has no
 * benchmarks. `noise` maps keys to calibrated noise, a fraction.
 */
export function compareBench(base, head, noise = {}) {
  // 0.0.1 doesn't change between base and head, so its benches only show
  // what the runner did: never a regression.
  const legacies = new Set();
  for (const op of head.ops.values()) {
    if (op.meta.legacy) {
      legacies.add(`${op.file} > ${op.test} > ${op.meta.legacy}`);
    }
  }

  const rows = [];
  for (const op of head.ops.values()) {
    const row = { op, base: base?.ops.get(op.key), problems: [] };
    row.threshold = Math.max(
      MIN_THRESHOLD,
      NOISE_MULTIPLE * (noise[op.key] ?? 0),
    );
    if (row.base) {
      row.delta = op.mean / row.base.mean - 1;
      if (legacies.has(op.key)) row.status = 'legacy';
      else if (row.delta > row.threshold) row.status = 'slower';
      else if (row.delta < -row.threshold) row.status = 'faster';
      else row.status = 'same';
      if (row.status === 'slower') {
        row.problems.push({
          kind: 'slower',
          text: `${formatDelta(row.delta)}, over its ${formatPercent(row.threshold)} threshold`,
        });
      }
    } else {
      row.status = 'new';
    }

    const { within, legacy, faster } = op.meta;
    if (within) {
      const other = sibling(head.ops, op, within.bench);
      if (other) {
        row.within = { ...within, ratio: op.mean / other.mean };
        row.within.ok = row.within.ratio <= within.max;
        if (!row.within.ok) {
          row.problems.push({
            kind: 'target',
            text: `${formatRatio(row.within.ratio)} ${within.bench}, over its ${formatRatio(within.max)} target`,
          });
        }
      } else {
        row.problems.push({
          kind: 'target',
          text: `no bench named "${within.bench}" in its test to compare with`,
        });
      }
    }
    if (legacy) {
      const old = sibling(head.ops, op, legacy);
      if (old) {
        row.legacy = { bench: legacy, ratio: old.mean / op.mean, faster };
        if (faster !== undefined) {
          row.legacy.ok = row.legacy.ratio >= faster;
          if (!row.legacy.ok) {
            row.problems.push({
              kind: 'target',
              text: `${formatRatio(row.legacy.ratio)} faster than ${legacy}, under its ${formatRatio(faster)} target`,
            });
          }
        }
      } else {
        row.problems.push({
          kind: 'target',
          text: `no bench named "${legacy}" in its test to compare with`,
        });
      }
    }
    rows.push(row);
  }

  const removed = base
    ? [...base.ops.values()].filter((op) => !head.ops.has(op.key))
    : [];
  return { rows, removed, hasBase: base !== null, failed: head.failed };
}

/**
 * Calibrated noise from same-against-same pairs: per op, the root mean
 * square of the pairs' fractional differences. Root mean square rather than
 * standard deviation, so a bias from always running one side first counts.
 */
export function noiseFrom(pairs) {
  const squares = new Map();
  for (const [a, b] of pairs) {
    for (const op of b.ops.values()) {
      const other = a.ops.get(op.key);
      if (!other) continue;
      const delta = op.mean / other.mean - 1;
      squares.set(op.key, [...(squares.get(op.key) ?? []), delta * delta]);
    }
  }
  const noise = {};
  for (const [key, values] of [...squares].sort(([x], [y]) =>
    x.localeCompare(y),
  )) {
    const rms = Math.sqrt(
      values.reduce((sum, v) => sum + v, 0) / values.length,
    );
    noise[key] = Math.round(rms * 10_000) / 10_000;
  }
  return noise;
}

/**
 * What fails the check, one entry per problem: `slower` past the threshold,
 * or `target` for a ratio or legacy target missed.
 */
export function problems(result) {
  return result.rows.flatMap(({ op, problems: list }) =>
    list.map((problem) => ({ op, ...problem })),
  );
}

/** `bench/parse.bench.ts > parseAddress > typical` as `parse › parseAddress › typical`. */
export function label(op) {
  const file = op.file
    .replace(/^bench\//, '')
    .replace(/\.bench\.[cm]?[jt]s$/, '');
  return [file, op.test, op.bench].join(' › ');
}

export function formatTime(ns) {
  if (ns === undefined) return '—';
  const [value, unit] =
    ns >= 1e6 ? [ns / 1e6, 'ms'] : ns >= 1e3 ? [ns / 1e3, 'µs'] : [ns, 'ns'];
  return `${value >= 100 ? value.toFixed(0) : value.toPrecision(3)} ${unit}`;
}

export function formatPercent(fraction) {
  return `${(fraction * 100).toFixed(fraction < 0.1 ? 1 : 0)}%`;
}

export function formatDelta(delta) {
  if (delta === undefined) return '—';
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  return `${sign}${(Math.abs(delta) * 100).toFixed(1)}%`;
}

export function formatRatio(ratio) {
  return `${ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(2)}×`;
}

/** An op's absolute and `within` targets, for a table cell. */
export function formatTarget(row) {
  const { p50, p99 } = row.op.meta;
  const parts = [];
  if (p50 !== undefined) parts.push(`≤ ${formatTime(p50)} p50`);
  if (p99 !== undefined) parts.push(`≤ ${formatTime(p99)} p99`);
  if (row.within) {
    parts.push(
      `≤ ${formatRatio(row.within.max)} ${row.within.bench}: ${formatRatio(row.within.ratio)}`,
    );
  }
  return parts.join(', ');
}

/** An op's legacy ratio and its target, for a table cell. */
export function formatLegacy(row) {
  if (!row.legacy) return '';
  const { ratio, faster } = row.legacy;
  return faster === undefined
    ? formatRatio(ratio)
    : `${formatRatio(ratio)} (≥ ${formatRatio(faster)})`;
}
