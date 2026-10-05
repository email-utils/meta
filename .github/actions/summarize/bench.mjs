// `vitest bench` JSON reporter output for base and head into the `summary`
// stat and `details` table that job-summary and pr-comment render. Paths come
// from RESULTS_FILE (head), BASE_FILE, and NOISE_FILE; lib/bench.mjs says
// what's compared and how.
import fs from 'node:fs';
import path from 'node:path';
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
  problems,
  readBench,
} from './lib/bench.mjs';

const ROOT = process.env.GITHUB_WORKSPACE ?? process.cwd();
const RESULTS_PATH = path.resolve(ROOT, process.env.RESULTS_FILE);
// Optional, and an empty path would resolve to ROOT itself.
const optional = (file) => (file ? path.resolve(ROOT, file) : '');
const BASE_PATH = optional(process.env.BASE_FILE);
const NOISE_PATH = optional(process.env.NOISE_FILE);

function setOutput(name, value) {
  const delim = `ghadelim_${Math.random().toString(36).slice(2)}`;
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `${name}<<${delim}\n${value}\n${delim}\n`,
  );
}

// A run that dies before reporting writes no results, and the job summary's
// log excerpt tells that story better than a guessed stat.
if (!fs.existsSync(RESULTS_PATH)) {
  console.log(`No results at ${RESULTS_PATH}, so no summary.`);
  process.exit(0);
}

const head = readBench(RESULTS_PATH);
const base =
  BASE_PATH && fs.existsSync(BASE_PATH) ? readBench(BASE_PATH) : null;
const noiseFile =
  NOISE_PATH && fs.existsSync(NOISE_PATH)
    ? JSON.parse(fs.readFileSync(NOISE_PATH, 'utf8'))
    : null;
const result = compareBench(base, head, noiseFile?.noise);
const failing = problems(result);

const count = (status) =>
  result.rows.filter((row) => row.status === status).length;
const plural = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;

const parts = [plural(result.rows.length, 'benchmark')];
if (!result.hasBase) {
  parts.push('no base to compare against');
} else {
  const slower = count('slower');
  const faster = count('faster');
  parts.push(slower > 0 ? `${slower} slower` : 'none slower');
  if (faster > 0) parts.push(`${faster} faster`);
}
const missed = failing.filter(({ kind }) => kind === 'target');
if (missed.length > 0) parts.push(plural(missed.length, 'target') + ' missed');
if (result.failed.length > 0) {
  parts.push(`${plural(result.failed.length, 'bench test')} failed`);
}
const summary = parts.join(', ');

const lines = [];
if (failing.length > 0) {
  lines.push('**Failing**', '');
  for (const { op, text } of failing) {
    lines.push(`- \`${label(op)}\`: ${text}`);
  }
  lines.push('');
}
if (result.failed.length > 0) {
  lines.push('**Bench tests that failed**', '');
  for (const { name, message } of result.failed) {
    lines.push(`- \`${name}\` — ${message}`);
  }
  lines.push('');
}

const marker = { slower: '🔴 ', faster: '🟢 ' };
lines.push(
  '<details><summary>Benchmarks</summary>',
  '',
  '| Benchmark | Base | Head | Δ | Target | Legacy |',
  '|---|--:|--:|--:|---|--:|',
);
for (const row of result.rows) {
  const delta = row.status === 'new' ? 'new' : formatDelta(row.delta);
  lines.push(
    `| ${label(row.op)} | ${formatTime(row.base?.mean)} | ${formatTime(row.op.mean)} | ${marker[row.status] ?? ''}${delta} | ${formatTarget(row)} | ${formatLegacy(row)} |`,
  );
}
lines.push('');
if (result.removed.length > 0) {
  const names = result.removed.map((op) => `\`${label(op)}\``);
  lines.push(`Removed: ${names.join(', ')}.`, '');
}
const floor = formatPercent(MIN_THRESHOLD);
lines.push(
  `Mean time per call, base and head benched one after the other on the same runner. An op is slower or faster when Δ passes the larger of ${floor} and ${NOISE_MULTIPLE}× its noise in \`bench/noise.json\`${noiseFile ? `, calibrated from ${plural(noiseFile.runs, 'A/A run')}` : `, which this package doesn't have yet, so every threshold is ${floor}`}. Absolute targets are for the reference machine and checked nightly; ratio and legacy targets are checked here. Legacy is how many times faster than 0.0.1.`,
  '',
  '</details>',
);

setOutput('summary', summary);
setOutput('details', lines.join('\n'));
