// Serves each build under /meta/ like GitHub Pages and fetches a page, its first JS asset, and the search index.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const B = path.dirname(new URL(import.meta.url).pathname);
const sites = {
  vitepress: [
    'vitepress/docs/.vitepress/dist',
    'api/set0/classifier',
    /hashmap\.json|@localSearchIndex|localSearchIndex/,
  ],
  docusaurus: ['docusaurus/build', 'docs/api/set0/classifier/', /search-index/],
  nextra: ['nextra/out', 'api/set0/classifier', /_pagefind/],
  fumadocs: ['fumadocs/out', 'docs/api/set0/classifier', /api\/search/],
};
function resolve(root, url) {
  let p = path.join(root, decodeURIComponent(url.split('?')[0]));
  for (const c of [p, p + '.html', path.join(p, 'index.html')])
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
}
for (const [name, [dir, page, searchRe]] of Object.entries(sites)) {
  const root = path.join(B, dir);
  const srv = http
    .createServer((req, res) => {
      if (!req.url.startsWith('/meta/')) {
        res.writeHead(404).end();
        return;
      }
      const f = resolve(root, req.url.slice('/meta'.length));
      if (!f) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200).end(fs.readFileSync(f));
    })
    .listen(0);
  await new Promise((r) => srv.on('listening', r));
  const base = `http://localhost:${srv.address().port}/meta/`;
  const html = await (await fetch(base + page)).text();
  const js = [
    ...html.matchAll(/(?:src|href)=["']?(\/meta\/[^"' >]+\.js)/g),
  ].map((m) => m[1]);
  const jsStatus = js.length
    ? (await fetch(`http://localhost:${srv.address().port}${js[0]}`)).status
    : 'none';
  const unprefixed = [
    ...html.matchAll(/(?:src|href)=["']?(\/(?!meta\/)[^"' >]*)/g),
  ]
    .map((m) => m[1])
    .filter((u) => !u.startsWith('//'));
  let search = 'n/a';
  const all = fs.readdirSync(root, { recursive: true }).map(String);
  const hit = all.find((f) => searchRe.test(f));
  if (hit)
    search = `${hit} -> ${(await fetch(base + hit.replace(/\\/g, '/'))).status}`;
  console.log(
    name.padEnd(11),
    'page',
    html.length > 1000 ? 'ok' : 'FAIL',
    '| js',
    js.length,
    'refs, first',
    jsStatus,
    '| unprefixed',
    unprefixed.length ? unprefixed.slice(0, 3) : 0,
    '| search',
    search,
  );
  srv.close();
}
