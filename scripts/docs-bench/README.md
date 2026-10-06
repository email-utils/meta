# Docs framework benchmark

The evidence behind choosing Fumadocs for the docs site
([#41](https://github.com/email-utils/meta/issues/41)). It compares VitePress,
Docusaurus, Nextra, and Fumadocs building the same site. Results are in
[`results.json`](./results.json).

## Method

- **Corpus**: `gen-corpus.mjs` builds 42 pages (6 copies of the 7 `docs/api/`
  drafts), each with one JS/TS code-tab group in the tool's own syntax. The
  drafts became the site's reference pages in
  [#43](https://github.com/email-utils/meta/issues/43) and left the repo, so
  restore them first and point `DOCS_API` at the copy:
  `git archive fb32149 docs/api | tar -x -C /tmp && DOCS_API=/tmp/docs/api node gen-corpus.mjs`.
- **Sites**: each is a static export under `/meta/`, with local search and a
  home page. Only the Fumadocs site was committed, as `docs/`. To rerun, scaffold
  the other three next to these scripts:
  - `vitepress/`: VitePress 1.6.4 with `base: '/meta/'` and local search.
  - `docusaurus/`: `create-docusaurus` classic TypeScript with the blog removed,
    `baseUrl: '/meta/'`, `@easyops-cn/docusaurus-search-local`, and
    `future.faster` read from `DOCUSAURUS_FASTER`.
  - `nextra/`: Nextra 4.6.1 App Router with `output: 'export'`,
    `basePath: '/meta'`, and Pagefind. It needs an npm override pinning zod
    to 4.3.6
    ([shuding/nextra#5036](https://github.com/shuding/nextra/issues/5036)).
  - `fumadocs/`: `create-fumadocs-app` with the `+next+fuma-docs-mdx+static`
    template and Orama search, the OG-image route removed, and
    `basePath: '/meta'`.
- **Timing**: `node bench.mjs 5` runs 5 cold builds (build output and caches
  wiped first) and 5 warm builds per tool, then 3 `npm ci` runs with a warm
  npm cache. `serve-check.mjs` serves each build under `/meta/` and fetches a
  page, a JS asset, and the search index.

## Results (Apple M5 Pro, Node 26.7.0, 2026-09-29)

| Tool                | Cold build    | Warm build    | `node_modules` | Page JS (gzip) |
| ------------------- | ------------- | ------------- | -------------- | -------------- |
| VitePress           | 2.35 s ± 0.28 | 2.31 s ± 0.04 | 99 MB          | 60 KB          |
| Docusaurus          | 6.44 s ± 0.03 | 1.60 s ± 0.01 | 367 MB         | 165 KB         |
| Docusaurus (Faster) | 2.25 s ± 0.02 | 1.40 s ± 0.01 | 367 MB         | 159 KB         |
| Nextra              | 7.26 s ± 0.14 | 1.20 s ± 0.02 | 720 MB         | 272 KB         |
| Fumadocs            | 4.43 s ± 0.15 | 3.06 s ± 0.05 | 519 MB         | 405 KB         |

Build time didn't separate the tools. Fumadocs was chosen for React and
Next.js familiarity, and because it had the least setup friction of the React
options.
