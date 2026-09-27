// Vitest's JSON reporter output, plus coverage-v8's json-summary when there
// is one, into the `summary` stat and `details` block that job-summary and
// pr-comment render. Paths come from RESULTS_FILE and COVERAGE_FILE.
import fs from 'node:fs';
import path from 'node:path';
import { buildCoverageSection } from './lib/coverage-table.mjs';

const ROOT = process.env.GITHUB_WORKSPACE ?? process.cwd();
const RESULTS_PATH = path.resolve(ROOT, process.env.RESULTS_FILE);
const COVERAGE_PATH = path.resolve(ROOT, process.env.COVERAGE_FILE);
const MAX_DETAILS = 15;

function setOutput(name, value) {
  const delim = `ghadelim_${Math.random().toString(36).slice(2)}`;
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `${name}<<${delim}\n${value}\n${delim}\n`,
  );
}

// A run that dies before reporting (a config error, say) writes no results.
// The job summary's log excerpt tells that story better than a guessed stat.
if (!fs.existsSync(RESULTS_PATH)) {
  console.log(`No results at ${RESULTS_PATH}, so no summary.`);
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
const { numPassedTests, numFailedTests } = data;

// A file that fails to load (a bad import, a syntax error) fails with a
// message and no tests, so the test counts alone would miss it.
const failures = [];
let brokenFiles = 0;
for (const testResult of data.testResults ?? []) {
  const file = path.relative(ROOT, testResult.name);
  if (testResult.status === 'failed' && testResult.message) {
    brokenFiles++;
    failures.push({
      file,
      title: 'failed to load',
      message: testResult.message.split('\n')[0],
    });
  }
  for (const assertion of testResult.assertionResults ?? []) {
    if (assertion.status !== 'failed') continue;
    const message = (assertion.failureMessages?.[0] ?? '').split('\n')[0];
    failures.push({ file, title: assertion.fullName, message });
  }
}

const parts = [`${numPassedTests} passed`];
if (numFailedTests > 0) parts.push(`${numFailedTests} failed`);
if (brokenFiles > 0) {
  const noun = brokenFiles === 1 ? 'file' : 'files';
  parts.push(`${brokenFiles} ${noun} failed to load`);
}
const testSummary = parts.join(', ');

const coverage = buildCoverageSection(COVERAGE_PATH, ROOT);
const summary = coverage ? `${testSummary} — ${coverage.stat}` : testSummary;

let details = '';
if (failures.length > 0) {
  const lines = ['<details><summary>Failing tests</summary>', ''];
  for (const { file, title, message } of failures.slice(0, MAX_DETAILS)) {
    lines.push(`- \`${file}\` › ${title} — ${message}`);
  }
  if (failures.length > MAX_DETAILS) {
    lines.push('');
    lines.push(
      `*…and ${failures.length - MAX_DETAILS} more — see full output below.*`,
    );
  }
  lines.push('');
  lines.push('</details>');
  details = lines.join('\n');
}

if (coverage) {
  details = details ? `${details}\n\n${coverage.table}` : coverage.table;
}

setOutput('summary', summary);
setOutput('details', details);
