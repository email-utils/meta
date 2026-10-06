import { llms, loader } from 'fumadocs-core/source';
import { docsContentRoute, docsRoute } from './shared';
import { defineDocs } from 'fumadocs-mdx/macro';
import { applyMdxPreset } from 'fumadocs-mdx/config';
import { remarkTypeScriptToJavaScript } from 'fumadocs-docgen/remark-ts2js';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import { rehypeCodeDefaultOptions } from 'fumadocs-core/mdx-plugins';
import { transformerTwoslash } from 'fumadocs-twoslash';

const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema,
    // Setting mdxOptions here replaces Fumadocs' defaults, so the preset puts
    // them back. A ```ts ts2js block renders as TypeScript and JavaScript
    // tabs, and the choice sticks across pages.
    mdxOptions: applyMdxPreset({
      remarkPlugins: (plugins) => [
        ...plugins,
        [remarkTypeScriptToJavaScript, { persist: { id: 'language' } }],
      ],
      rehypeCodeOptions: {
        ...rehypeCodeDefaultOptions,
        transformers: [
          ...(rehypeCodeDefaultOptions.transformers ?? []),
          // Every ts and tsx block is compiled against the packages installed
          // from npm, and a type error fails the build. `no-twoslash` in a
          // block's meta opts it out.
          transformerTwoslash({ explicitTrigger: false }),
        ],
      },
    }),
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
  plugins: [],
});

export const docsLlms = llms(source, {
  renderPage: async (page) => `# ${page.data.title} (${page.url})

${await page.data.getText('processed')}`,
});
