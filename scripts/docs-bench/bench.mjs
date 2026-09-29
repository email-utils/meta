// Times cold and warm builds (and npm ci) for each docs tool; writes results.json.
// Usage: node bench.mjs [runs=5] [tool...]
import { spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const BENCH = path.dirname(new URL(import.meta.url).pathname);
const RUNS = Number(process.argv[2] ?? 5);
const only = process.argv.slice(3);

const tools = {
  vitepress: {
    dir: 'vitepress',
    caches: ['docs/.vitepress/cache', 'docs/.vitepress/dist'],
    out: 'docs/.vitepress/dist',
    page: 'api/set0/classifier.html',
  },
  'docusaurus (webpack)': {
    dir: 'docusaurus',
    env: { DOCUSAURUS_FASTER: '0' },
    caches: ['.docusaurus', 'build', 'node_modules/.cache'],
    out: 'build',
    page: 'docs/api/set0/classifier/index.html',
  },
  'docusaurus (faster)': {
    dir: 'docusaurus',
    env: { DOCUSAURUS_FASTER: '1' },
    caches: ['.docusaurus', 'build', 'node_modules/.cache'],
    out: 'build',
    page: 'docs/api/set0/classifier/index.html',
  },
  nextra: {
    dir: 'nextra',
    caches: ['.next', 'out'],
    out: 'out',
    page: 'api/set0/classifier.html',
  },
  fumadocs: {
    dir: 'fumadocs',
    caches: ['.next', 'out', '.source'],
    out: 'out',
    page: 'docs/api/set0/classifier.html',
  },
};

function wipe(cwd, rels) {
  for (const rel of rels) {
    const p = path.join(cwd, rel);
    if (!p.startsWith(BENCH + '/')) throw new Error(`refusing to remove ${p}`);
    fs.rmSync(p, { recursive: true, force: true });
  }
}

function run(cwd, cmd, args, env = {}) {
  const t = performance.now();
  const r = spawnSync(cmd, args, {
    cwd,
    env: { ...process.env, ...env, NEXT_TELEMETRY_DISABLED: '1' },
    encoding: 'utf8',
  });
  const ms = performance.now() - t;
  if (r.status !== 0)
    throw new Error(
      `${cmd} ${args.join(' ')} failed in ${cwd}\n${r.stdout}\n${r.stderr}`,
    );
  return ms / 1000;
}

const stats = (xs) => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(
    xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1 || 1),
  );
  return {
    mean: +mean.toFixed(2),
    sd: +sd.toFixed(2),
    min: +Math.min(...xs).toFixed(2),
    runs: xs.map((x) => +x.toFixed(2)),
  };
};

const duKB = (p) => Number(execSync(`du -sk "${p}"`).toString().split('\t')[0]);

// Sum the JS the page references directly (script src + modulepreload), raw and gzipped.
function pageJs(outDir, pageRel, base) {
  const html = fs.readFileSync(path.join(outDir, pageRel), 'utf8');
  const refs = new Set();
  for (const m of html.matchAll(/(?:src|href)=["']?([^"' >]+\.js)/g))
    refs.add(m[1]);
  let raw = 0,
    gz = 0,
    n = 0;
  for (const ref of refs) {
    if (/^https?:/.test(ref)) continue;
    const rel = ref.startsWith(base)
      ? ref.slice(base.length)
      : ref.replace(/^\//, '');
    const file = path.join(outDir, rel);
    if (!fs.existsSync(file)) continue;
    const buf = fs.readFileSync(file);
    raw += buf.length;
    gz += zlib.gzipSync(buf).length;
    n++;
  }
  return {
    files: n,
    rawKB: Math.round(raw / 1024),
    gzipKB: Math.round(gz / 1024),
  };
}

const results = {
  machine: execSync('sysctl -n machdep.cpu.brand_string').toString().trim(),
  cpus: Number(execSync('sysctl -n hw.ncpu').toString()),
  node: process.version,
  npm: execSync('npm -v').toString().trim(),
  runs: RUNS,
  tools: {},
};

for (const [name, t] of Object.entries(tools)) {
  if (only.length && !only.some((o) => name.startsWith(o))) continue;
  const cwd = path.join(BENCH, t.dir);
  const r = {};
  process.stderr.write(`\n${name}: cold`);
  const cold = [];
  for (let i = 0; i < RUNS; i++) {
    wipe(cwd, t.caches);
    cold.push(run(cwd, 'npm', ['run', 'build'], t.env));
    process.stderr.write('.');
  }
  r.cold = stats(cold);
  process.stderr.write(' warm');
  const warm = [];
  for (let i = 0; i < RUNS; i++) {
    warm.push(run(cwd, 'npm', ['run', 'build'], t.env));
    process.stderr.write('.');
  }
  r.warm = stats(warm);
  r.outputKB = duKB(path.join(cwd, t.out));
  r.pageJs = pageJs(path.join(cwd, t.out), t.page, '/meta/');
  results.tools[name] = r;
  process.stderr.write(` cold ${r.cold.mean}s warm ${r.warm.mean}s\n`);
}

// npm ci with a warm npm cache, 3 runs per project (Docusaurus once, both variants share it).
for (const dir of ['vitepress', 'docusaurus', 'nextra', 'fumadocs']) {
  if (only.length && !only.some((o) => dir.startsWith(o))) continue;
  const cwd = path.join(BENCH, dir);
  process.stderr.write(`${dir}: npm ci`);
  const xs = [];
  for (let i = 0; i < 3; i++) {
    wipe(cwd, ['node_modules']);
    xs.push(run(cwd, 'npm', ['ci', '--no-audit', '--no-fund']));
    process.stderr.write('.');
  }
  const pkgs = JSON.parse(
    execSync('npm query "*"', { cwd, maxBuffer: 1 << 28 }).toString(),
  ).length;
  results[`install:${dir}`] = {
    ci: stats(xs),
    nodeModulesMB: Math.round(duKB(path.join(cwd, 'node_modules')) / 1024),
    packages: pkgs,
  };
  process.stderr.write(` ${results[`install:${dir}`].ci.mean}s\n`);
}

const outFile = path.join(
  BENCH,
  only.length ? `results-${only.join('-')}.json` : 'results.json',
);
fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
