// The PR bench leg's check, and its noise calibration, over `vitest bench`
// JSON reporter output. Run by meta's bench.yml and bench-calibrate.yml,
// and locally from a package clone after benching base and head:
//
//   node ../.github/bench/check.mjs compare \
//     <base.json> .reports/bench/results.json bench/noise.json
//
//   node ../.github/bench/check.mjs noise bench/noise.json \
//     <a1.json> <b1.json> [<a2.json> <b2.json> ...]
//
// `compare` prints a table and fails when an op is slower than base by more
// than the larger of 10% and 3× its calibrated noise, or misses a ratio or
// legacy target in its bench test's meta (lib/bench.mjs). A missing base or
// noise file isn't an error: everything is new, or every threshold is 10%.
// Benchmarks are noisy, and some changes are worth being slower for, so the
// `bench: reviewed` label passes the check. LABELS is the PR's labels as a
// JSON array.
//
// `noise` writes the noise file from same-against-same pairs, each a results
// file and its rerun on the same runner.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  MIN_THRESHOLD,
  NOISE_MULTIPLE,
  compareBench,
  formatDelta,
  formatLegacy,
  formatPercent,
  formatTarget,
  formatTime,
  label,
  noiseFrom,
  problems,
  readBench,
} from '../actions/summarize/lib/bench.mjs';

const reviewed = 'bench: reviewed';

const [command, ...args] = process.argv.slice(2);

function usage() {
  console.error(
    [
      'Usage: node check.mjs compare <base.json> <head.json> [noise.json]',
      '       node check.mjs noise <noise.json> <a.json> <b.json> [...]',
    ].join('\n'),
  );
  process.exit(2);
}

/** Rows of cells as aligned columns, the first row a header. */
function columns(rows) {
  const widths = rows[0].map((_, i) =>
    Math.max(...rows.map((row) => [...row[i]].length)),
  );
  return rows
    .map((row) =>
      row
        .map((cell, i) => cell + ' '.repeat(widths[i] - [...cell].length))
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
}

if (command === 'compare') {
  const [basePath, headPath, noisePath] = args;
  if (!basePath || !headPath) usage();
  // Benches that crash before reporting leave the log to explain.
  if (!existsSync(headPath)) {
    console.log(
      `::error::No results at ${headPath}: the benchmarks didn't finish.`,
    );
    process.exit(1);
  }
  const head = readBench(headPath);
  const base = existsSync(basePath) ? readBench(basePath) : null;
  const noise =
    noisePath && existsSync(noisePath)
      ? JSON.parse(readFileSync(noisePath, 'utf8')).noise
      : undefined;
  if (!base) console.log(`No base results at ${basePath}: every op is new.`);
  if (!noise) {
    console.log(
      `No noise file: every threshold is ${formatPercent(MIN_THRESHOLD)}.`,
    );
  }

  const result = compareBench(base, head, noise);
  const rows = [
    ['Benchmark', 'Base', 'Head', 'Δ', 'Threshold', 'Target', 'Legacy'],
  ];
  for (const row of result.rows) {
    rows.push([
      label(row.op),
      formatTime(row.base?.mean),
      formatTime(row.op.mean),
      row.status === 'new' ? 'new' : formatDelta(row.delta),
      row.status === 'legacy' ? '0.0.1' : formatPercent(row.threshold),
      formatTarget(row),
      formatLegacy(row),
    ]);
  }
  console.log(`\n${columns(rows)}\n`);
  for (const op of result.removed) console.log(`Removed: ${label(op)}`);

  const failing = problems(result);
  if (failing.length === 0) {
    console.log(
      `${result.rows.length} benchmarks, none slower and no target missed.`,
    );
    process.exit(0);
  }
  for (const { op, text } of failing) console.log(`${label(op)}: ${text}`);
  const labels = JSON.parse(process.env.LABELS || '[]');
  if (labels.includes(reviewed)) {
    console.log(`\nThe \`${reviewed}\` label passes this.`);
    process.exit(0);
  }
  console.log(
    `::error::${failing.length === 1 ? 'A benchmark fails' : `${failing.length} benchmarks fail`} the check. If it's noise, re-run the job. If it's worth it, add the \`${reviewed}\` label and re-run.`,
  );
  process.exit(1);
} else if (command === 'noise') {
  const [out, ...files] = args;
  if (!out || files.length < 2 || files.length % 2 !== 0) usage();
  const pairs = [];
  for (let i = 0; i < files.length; i += 2) {
    pairs.push([readBench(files[i]), readBench(files[i + 1])]);
  }
  const noise = noiseFrom(pairs);
  const file = {
    runs: pairs.length,
    commit: process.env.GITHUB_SHA ?? null,
    noise,
  };
  writeFileSync(out, `${JSON.stringify(file, null, 2)}\n`);
  const rows = [['Benchmark', 'Noise', 'Threshold']];
  for (const [key, value] of Object.entries(noise)) {
    rows.push([
      key,
      formatPercent(value),
      formatPercent(Math.max(MIN_THRESHOLD, NOISE_MULTIPLE * value)),
    ]);
  }
  console.log(
    `${columns(rows)}\n\nWrote ${out} from ${pairs.length} A/A pairs.`,
  );
} else {
  usage();
}
