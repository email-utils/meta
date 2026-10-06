// Writes the API reference into content/docs/api/: one folder per package,
// one page per entry point, from the .d.ts files of the packages the site
// installs from npm, the same versions its code samples are checked against.
// The output is git-ignored; `npm run api` in docs/ runs this.
//
// TypeDoc doesn't support TypeScript 7 yet, so it lives in this folder's own
// npm project, on TypeScript 6, apart from the site.
import { readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Application, type TypeDocOptions } from 'typedoc';
import { MarkdownPageEvent, type PluginOptions } from 'typedoc-plugin-markdown';

const docs = join(import.meta.dirname, '..');
const out = join(docs, 'content/docs/api');

// In mani.yaml's order, which is dependency order.
const packages = [
  'validator-syntax',
  'classifier',
  'sanitizer',
  'validator-dns',
];

/** Each entry point's .d.mts, from the package's `exports` map. */
async function entryPoints(dir: string): Promise<string[]> {
  const { exports } = JSON.parse(
    await readFile(join(dir, 'package.json'), 'utf8'),
  ) as { exports: Record<string, string | { import: string }> };
  return Object.values(exports)
    .filter((target) => typeof target === 'object')
    .map(({ import: file }) => join(dir, file.replace(/\.mjs$/, '.d.mts')));
}

/**
 * Fits TypeDoc's pages to the site.
 *
 * - The root entry point becomes the package's page. With subpaths, TypeDoc
 *   writes a list of modules to index.md and the root module to index-1.md;
 *   the sidebar lists the modules already.
 * - Links to the other pages start with `./`, which is how Fumadocs and the
 *   link check tell a file path from a URL.
 * - Code blocks skip Twoslash. The signatures are declarations, not code that
 *   compiles, and the examples are the packages' own, which their doctests
 *   run.
 */
async function tidy(dir: string): Promise<void> {
  const files = await readdir(dir);
  if (files.includes('index-1.md')) {
    await rename(join(dir, 'index-1.md'), join(dir, 'index.md'));
  }
  for (const file of new Set(
    files.map((file) => file.replace('index-1.md', 'index.md')),
  )) {
    const path = join(dir, file);
    const text = await readFile(path, 'utf8');
    await writeFile(
      path,
      text
        .replaceAll('index-1.md', 'index.md')
        .replaceAll(/\]\(([\w-]+\.md)/g, '](./$1')
        .replaceAll(/^```(ts|tsx)$/gm, '```$1 no-twoslash'),
    );
  }
}

await rm(out, { recursive: true, force: true });

for (const name of packages) {
  const dir = join(docs, 'node_modules/@email-utils', name);
  const { version } = JSON.parse(
    await readFile(join(dir, 'package.json'), 'utf8'),
  ) as { version: string };
  // TypeDoc's own types don't know the plugins' options, so they're typed
  // here and passed as a whole.
  const options: Partial<TypeDocOptions> & PluginOptions = {
    entryPoints: await entryPoints(dir),
    name: `@email-utils/${name}`,
    out: join(out, name),
    plugin: ['typedoc-plugin-markdown', 'typedoc-plugin-frontmatter'],
    readme: 'none',
    disableSources: true,
    excludePrivate: true,
    excludeInternal: true,
    // Fumadocs renders the title from the frontmatter.
    hidePageTitle: true,
    hidePageHeader: true,
    hideBreadcrumbs: true,
    outputFileStrategy: 'modules',
    entryFileName: 'index',
    useCodeBlocks: true,
    // Parameters as tables. Properties keep TypeDoc's lists: their docs run
    // to paragraphs and examples, which a table cell flattens.
    parametersFormat: 'table',
    // Types from the packages a package depends on, like ParsedAddress, are
    // documented on their own package's pages.
    validation: { notExported: false },
    tsconfig: join(import.meta.dirname, 'tsconfig.packages.json'),
  };
  const app = await Application.bootstrapWithPlugins(options);

  // The markdown plugin emits its own page events under TypeDoc's names.
  app.renderer.on(MarkdownPageEvent.BEGIN, (event) => {
    const page = event as MarkdownPageEvent;
    // The root entry point's module is named after its file, index.d.mts.
    const entry = ['index', page.project.name].includes(page.model.name);
    page.frontmatter = {
      title: entry
        ? page.project.name
        : `${page.project.name}/${page.model.name}`,
      description: entry
        ? `The API of ${page.project.name} ${version}.`
        : `The API of the ${page.model.name} entry point.`,
      ...page.frontmatter,
    };
  });

  const project = await app.convert();
  if (project === undefined) {
    throw new Error(`TypeDoc couldn't convert ${name}`);
  }
  await app.generateOutputs(project);
  await tidy(join(out, name));
  console.log(`${name} ${version}: ${relative(docs, join(out, name))}`);
}

await writeFile(
  join(out, 'meta.json'),
  `${JSON.stringify({ title: 'API reference', pages: packages }, null, 2)}\n`,
);
