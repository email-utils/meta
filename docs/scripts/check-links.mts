// Fails on any link in content/docs that doesn't resolve to a page, or to a
// heading on it: URLs (/docs/…), relative .mdx paths, and #fragments. External
// links aren't fetched. Run with `npm run lint:links`.
import { join } from 'node:path';
import { register } from 'fumadocs-mdx/node';
import { printErrors, scanURLs, validateFiles } from 'next-validate-link';

// Compiles the `fumadocs-mdx/macro` collections in lib/source.ts under Node,
// as the Next.js plugin does in a build.
register();
const { source } = await import('../lib/source');

const pages = source.getPages();

const scanned = await scanURLs({
  preset: 'next',
  populate: {
    'docs/[[...slug]]': pages.map((page) => ({
      value: { slug: page.slugs },
      hashes: page.data.toc.map((item) => item.url.slice(1)),
    })),
  },
});

const pathOf = (page: (typeof pages)[number]) =>
  join('content/docs', page.path);
const urlOf = new Map(pages.map((page) => [pathOf(page), page.url]));

printErrors(
  await validateFiles(
    await Promise.all(
      pages.map(async (page) => ({
        path: pathOf(page),
        // The validator skips a bare #fragment, so point it at this page.
        // Only columns shift; error lines stay right.
        content: (await page.data.getText('raw')).replaceAll(
          '](#',
          `](${page.url}#`,
        ),
        url: page.url,
      })),
    ),
    {
      scanned,
      markdown: {
        components: { Card: { attributes: ['href'] } },
      },
      checkRelativePaths: 'as-url',
      // A relative .mdx link that names no page would otherwise pass
      // unchecked; its own path is never a site URL, so it fails.
      pathToUrl: (path) => urlOf.get(path) ?? path,
    },
  ),
  true,
);
