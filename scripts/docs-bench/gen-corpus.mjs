// Generates the same 42-page corpus for each tool: 6 sets of the 7 docs/api pages,
// each page with one JS/TS tab group in that tool's native syntax. The drafts
// left docs/api once they became the site's reference (#43), so DOCS_API
// points at a copy from history; see README.md.
import fs from 'node:fs';
import path from 'node:path';

const SRC =
  process.env.DOCS_API ??
  path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '../../docs/api',
  );
const BENCH = path.dirname(new URL(import.meta.url).pathname);
const SETS = ['set0', 'set1', 'set2', 'set3', 'set4', 'set5'];

const js = `const { parseAddress } = require('@email-utils/validator-syntax');\n\nconst result = parseAddress('ada@example.com');\nconsole.log(result.ok);`;
const ts = `import { parseAddress, type Result } from '@email-utils/validator-syntax';\n\nconst result: Result<unknown> = parseAddress('ada@example.com');\nconsole.log(result.ok);`;

const tools = {
  vitepress: {
    dir: 'vitepress/docs/api',
    ext: '.md',
    link: (name) => `./${name}.md`,
    tabs: () =>
      `::: code-group\n\n\`\`\`js [JavaScript]\n${js}\n\`\`\`\n\n\`\`\`ts [TypeScript]\n${ts}\n\`\`\`\n\n:::`,
  },
  docusaurus: {
    dir: 'docusaurus/docs/api',
    ext: '.mdx',
    link: (name) => `./${name}.mdx`,
    header: `import Tabs from '@theme/Tabs';\nimport TabItem from '@theme/TabItem';\n\n`,
    tabs: () =>
      `<Tabs groupId="lang">\n<TabItem value="js" label="JavaScript">\n\n\`\`\`js\n${js}\n\`\`\`\n\n</TabItem>\n<TabItem value="ts" label="TypeScript">\n\n\`\`\`ts\n${ts}\n\`\`\`\n\n</TabItem>\n</Tabs>`,
  },
  nextra: {
    dir: 'nextra/content/api',
    ext: '.mdx',
    link: (name) => `./${name}`,
    header: `import { Tabs } from 'nextra/components';\n\n`,
    tabs: () =>
      `<Tabs items={['JavaScript', 'TypeScript']}>\n<Tabs.Tab>\n\n\`\`\`js\n${js}\n\`\`\`\n\n</Tabs.Tab>\n<Tabs.Tab>\n\n\`\`\`ts\n${ts}\n\`\`\`\n\n</Tabs.Tab>\n</Tabs>`,
  },
  fumadocs: {
    dir: 'fumadocs/content/docs/api',
    ext: '.mdx',
    link: (name) => `./${name}`,
    frontmatterTitle: true,
    tabs: () =>
      `\`\`\`js tab="JavaScript"\n${js}\n\`\`\`\n\n\`\`\`ts tab="TypeScript"\n${ts}\n\`\`\``,
  },
};

const pages = fs.readdirSync(SRC).filter((f) => f.endsWith('.md'));
const only = process.argv[2];

for (const [tool, t] of Object.entries(tools)) {
  if (only && only !== tool) continue;
  const root = path.join(BENCH, t.dir);
  fs.rmSync(root, { recursive: true, force: true });
  for (const set of SETS) {
    fs.mkdirSync(path.join(root, set), { recursive: true });
    for (const file of pages) {
      const name = file === 'index.md' ? 'overview' : file.replace(/\.md$/, '');
      let body = fs.readFileSync(path.join(SRC, file), 'utf8');
      body = body.replace(
        /\]\(\.\/([\w-]+)\.md(#[\w-]*)?\)/g,
        (_, n, hash = '') =>
          `](${t.link(n === 'index' ? 'overview' : n)}${hash})`,
      );
      const title = body.match(/^# (.+)$/m)[1];
      const example = `\n\n## Example\n\n${t.tabs()}\n`;
      // Insert the tab group before the first H2 so it sits near the top.
      body = body.replace(/\n## /, `${example}\n## `);
      let front = `---\ntitle: '${title.replace(/'/g, "''")}'\n---\n\n`;
      if (t.frontmatterTitle) body = body.replace(/^# .+\n+/m, '');
      fs.writeFileSync(
        path.join(root, set, name + t.ext),
        front + (t.header ?? '') + body,
      );
    }
  }
  console.log(tool, SETS.length * pages.length, 'pages ->', root);
}
