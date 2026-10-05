// Checks a package PR's title against what the PR changes in the package's API
// report: api/<entry>.api.md, one per entry point, which the package's
// scripts/api-report.ts writes from the build with API Extractor. The
// package's `check:package` fails when api/ doesn't match the build, so the
// committed reports are the public API. Run by meta's api-report.yml, and
// locally from a package clone:
//
//   TITLE='feat: add checkMx' LABELS='[]' \
//     node ../.github/api-report/check.mjs \
//     ../plugins/email-utils/commit-conventions.json origin/main HEAD
//
// What the title needs, from commit-conventions.json:
//   Lines only added      a type that bumps minor (`feat`), or `!`
//   Any line removed      `!`, since a changed line shows as removed and added
//
// Comment lines (`// @public`, `// (undocumented)`) follow the TSDoc, so they
// don't count. A heuristic reads some safe changes as breaking, such as a
// widened parameter type, so the `api: reviewed` label passes the check.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const label = 'api: reviewed';
const dir = 'api';

const [conventionsPath, base, head] = process.argv.slice(2);
if (!conventionsPath || !base || !head) {
  console.error(
    'Usage: node check.mjs <commit-conventions.json> <base> <head>',
  );
  process.exit(2);
}
const title = process.env.TITLE ?? '';
const labels = JSON.parse(process.env.LABELS || '[]');
const conventions = JSON.parse(readFileSync(conventionsPath, 'utf8'));

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });

// A package's first report has nothing to compare against.
if (!git('ls-tree', '--name-only', base, '--', `${dir}/`).trim()) {
  console.log(`${base} has no ${dir}/ yet, so there's nothing to compare.`);
  process.exit(0);
}

const diff = git(
  'diff',
  '--no-color',
  '--no-renames',
  '--unified=0',
  base,
  head,
  '--',
  `${dir}/`,
);
// A new or deleted report is a whole entry point, named rather than listed.
const files = new Map();
let file;
for (const line of diff.split('\n')) {
  const header = /^diff --git a\/(\S+) /.exec(line);
  if (header) {
    file = { name: header[1], status: 'changed', added: [], removed: [] };
    continue;
  }
  if (line.startsWith('new file mode')) file.status = 'added';
  if (line.startsWith('deleted file mode')) file.status = 'removed';
  if (!/^[+-]/.test(line) || /^(\+\+\+|---) /.test(line)) continue;
  const text = line.slice(1).trim();
  if (text === '' || text.startsWith('//')) continue;
  files.set(file.name, file);
  file[line[0] === '+' ? 'added' : 'removed'].push(text);
}

if (files.size === 0) {
  console.log(`The public API in ${dir}/ is unchanged.`);
  process.exit(0);
}

let breaking = false;
for (const { name, status, added, removed } of files.values()) {
  if (status === 'changed') {
    console.log(`\n${name}`);
    for (const text of removed) console.log(`  - ${text}`);
    for (const text of added) console.log(`  + ${text}`);
  } else {
    console.log(`\n${name}: entry point ${status}`);
  }
  if (removed.length > 0) breaking = true;
}
console.log('');

const ranks = { none: 0, patch: 1, minor: 2, major: 3 };
const needed = breaking ? 'major' : 'minor';
const parsed = /^(?<type>[a-z]+)(?:\([^)]*\))?(?<bang>!)?: /.exec(title);
const bump = parsed?.groups.bang
  ? 'major'
  : (conventions.types[parsed?.groups.type]?.bump ?? 'none');

const change = breaking
  ? 'removes or changes public API'
  : 'adds public API and removes none';
const fix = breaking
  ? 'needs `!` before the colon, as in `feat!: …`'
  : `needs a type that bumps minor (${Object.entries(conventions.types)
      .filter(([, type]) => type.bump === 'minor')
      .map(([name]) => `\`${name}\``)
      .join(', ')}), or \`!\``;

if (ranks[bump] >= ranks[needed]) {
  console.log(`This PR ${change}, and "${title}" releases it as ${bump}.`);
  process.exit(0);
}
if (labels.includes(label)) {
  console.log(
    `This PR ${change}, which ${fix}, but the "${label}" label ` +
      `says the change has been reviewed.`,
  );
  process.exit(0);
}
console.log(
  `::error::This PR ${change}, so its title ${fix}. ` +
    `If the changes above don't affect consumers that way, ` +
    `add the "${label}" label.`,
);
process.exit(1);
