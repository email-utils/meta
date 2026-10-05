// Installs a package's packed tarball into a fresh consumer project and checks
// that every entry point in its `exports` loads the way a consumer would load
// it. Run by meta's consumers.yml, and locally with any tarball:
//
//   npm pack --pack-destination /tmp            # in a package
//   node .github/consumers/check.mjs node /tmp/email-utils-classifier-1.0.0-rc.4.tgz
//
// The legs:
//   node         `require` and `import` on the running Node. Each entry point
//                must export something, and the same names both ways.
//   typescript7  tsc with `node16`, `nodenext`, and `bundler` resolution, on
//                ESM and CJS files, with the package's .d.ts files checked too.
//                TypeScript 7 is what the packages build with.
//   typescript6, The same on the releases before it, for consumers who
//   typescript5  haven't moved yet.
//   browser      A Vite build that fails on any import of a Node built-in.
//
// `jobs` prints the jobs consumers.yml runs for the package, as JSON.

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Packages that need Node by design, which get no browser job.
// validator-dns resolves MX records with node:dns.
const nodeOnly = new Set(['@email-utils/validator-dns']);

// The jobs consumers.yml runs, each one leg on one Node. The packages support
// Node 22 and later. The other legs don't depend on the Node version, so they
// run on the LTS that .nvmrc names.
const jobs = [
  { name: 'node22', label: 'Node 22', leg: 'node', node: 22 },
  { name: 'node24', label: 'Node 24', leg: 'node', node: 24 },
  { name: 'node26', label: 'Node 26', leg: 'node', node: 26 },
  { name: 'typescript5', label: 'TypeScript 5', leg: 'typescript5', node: 24 },
  { name: 'typescript6', label: 'TypeScript 6', leg: 'typescript6', node: 24 },
  { name: 'typescript7', label: 'TypeScript 7', leg: 'typescript7', node: 24 },
  { name: 'browser', label: 'Browser', leg: 'browser', node: 24 },
];

// Each TypeScript leg runs tsc from one of the fixtures' dependencies.
const legs = {
  node,
  typescript5: () => types('typescript5'),
  typescript6: () => types('typescript6'),
  typescript7: () => types('typescript'),
  browser,
};
const [leg, tarballArg] = process.argv.slice(2);
if ((leg !== 'jobs' && !Object.hasOwn(legs, leg ?? '')) || !tarballArg) {
  console.error(
    `Usage: node check.mjs <jobs|${Object.keys(legs).join('|')}> <tarball>`,
  );
  process.exit(2);
}
const tarball = resolve(tarballArg);
const fixtures = import.meta.dirname;

const manifest = JSON.parse(
  execFileSync('tar', ['-xOzf', tarball, 'package/package.json'], {
    encoding: 'utf8',
  }),
);
const { name } = manifest;
// `./package.json` is metadata, and a pattern has no single specifier.
const specifiers = Object.keys(manifest.exports ?? { '.': null })
  .filter((key) => key !== './package.json' && !key.includes('*'))
  .map((key) => (key === '.' ? name : name + key.slice(1)));

if (leg === 'jobs') {
  const browserless = nodeOnly.has(name);
  console.log(
    JSON.stringify(
      jobs.filter((job) => !(browserless && job.leg === 'browser')),
    ),
  );
  process.exit(0);
}

console.log(`${name}@${manifest.version} on Node ${process.versions.node}`);
console.log(`Entry points: ${specifiers.join(', ')}`);

const dir = mkdtempSync(join(tmpdir(), 'consumer-'));
const failures = await legs[leg]();
if (failures.length > 0) {
  for (const failure of failures) console.log(`::error::${failure}`);
  process.exit(1);
}
console.log(`\n${leg}: passed`);

function run(command, args) {
  console.log(`\n$ ${[command, ...args].join(' ')}`);
  execFileSync(command, args, { cwd: dir, stdio: 'inherit' });
}

// The tools come from the fixtures' lockfile. The package's own dependencies
// resolve from the registry, as a consumer's would.
function install({ tools }) {
  if (tools) {
    copyFileSync(join(fixtures, 'package.json'), join(dir, 'package.json'));
    copyFileSync(
      join(fixtures, 'package-lock.json'),
      join(dir, 'package-lock.json'),
    );
    run('npm', ['ci', '--no-audit', '--no-fund']);
  } else {
    writeFileSync(
      join(dir, 'package.json'),
      '{ "private": true, "type": "module" }\n',
    );
  }
  run('npm', ['install', '--no-save', '--no-audit', '--no-fund', tarball]);
}

function write(file, lines) {
  mkdirSync(join(dir, file, '..'), { recursive: true });
  writeFileSync(join(dir, file), lines.join('\n') + '\n');
}

async function node() {
  install({ tools: false });
  const list = JSON.stringify(specifiers);
  const names = (m) =>
    `Object.keys(${m}).filter((key) => key !== '__esModule').sort()`;
  write('require.cjs', [
    `const out = {};`,
    `for (const s of ${list}) out[s] = ${names('require(s)')};`,
    `console.log(JSON.stringify(out));`,
  ]);
  write('import.mjs', [
    `const out = {};`,
    `for (const s of ${list}) out[s] = ${names('await import(s)')};`,
    `console.log(JSON.stringify(out));`,
  ]);

  const load = (file) => {
    console.log(`\n$ node ${file}`);
    return JSON.parse(
      execFileSync(process.execPath, [file], { cwd: dir, encoding: 'utf8' }),
    );
  };
  const cjs = load('require.cjs');
  const esm = load('import.mjs');

  const failures = [];
  for (const s of specifiers) {
    const [c, e] = [cjs[s], esm[s]];
    console.log(`${s}: ${e.length} exports`);
    if (e.length === 0) failures.push(`${s} exports nothing.`);
    const onlyCjs = c.filter((key) => !e.includes(key));
    const onlyEsm = e.filter((key) => !c.includes(key));
    if (onlyCjs.length > 0 || onlyEsm.length > 0) {
      failures.push(
        `${s} exports different names to require and import: ` +
          `only require has [${onlyCjs.join(', ')}], only import has [${onlyEsm.join(', ')}].`,
      );
    }
  }
  return failures;
}

// `compiler` is the fixtures' dependency to run tsc from. Each declares a
// `tsc` bin, so it's run by path rather than through node_modules/.bin.
async function types(compiler) {
  install({ tools: true });
  const imports = (style) =>
    specifiers.map((s, i) =>
      style === 'require'
        ? `import m${i} = require('${s}');`
        : `import * as m${i} from '${s}';`,
    );
  const all = `export const modules = [${specifiers.map((_, i) => `m${i}`).join(', ')}];`;
  write('consumer.mts', [...imports('import'), all]);
  write('consumer.cts', [...imports('require'), all]);
  write('consumer.ts', [...imports('import'), all]);

  const tsc = join('node_modules', compiler, 'bin', 'tsc');
  run(process.execPath, [tsc, '--version']);
  const failures = [];
  for (const config of ['node16', 'nodenext', 'bundler']) {
    copyFileSync(
      join(fixtures, `tsconfig.${config}.json`),
      join(dir, `tsconfig.${config}.json`),
    );
    try {
      run(process.execPath, [tsc, '-p', `tsconfig.${config}.json`]);
      console.log(`${config}: types resolve`);
    } catch {
      failures.push(`tsc failed with ${config} resolution.`);
    }
  }
  return failures;
}

async function browser() {
  if (nodeOnly.has(name)) {
    return [`${name} needs Node by design, so it has no browser leg.`];
  }
  install({ tools: true });
  copyFileSync(join(fixtures, 'vite.config.mjs'), join(dir, 'vite.config.mjs'));
  write(
    'consumer.js',
    specifiers.map((s, i) => `export * as m${i} from '${s}';`),
  );
  try {
    run('npx', ['--no-install', 'vite', 'build']);
  } catch {
    return ['The browser build failed.'];
  }
  return [];
}
