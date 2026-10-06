// Fills in the support matrix's tables from the installed packages as the
// site builds, so they can't drift from what the packages do. A page names a
// table with an empty JSX tag on a line of its own, like `<SyntaxSupport />`,
// and this replaces it with a Markdown table, which the HTML and the page's
// Markdown export both get. Nothing here touches the network: the Null MX
// rows run validator-dns on a stub resolver.
import { providers } from '@email-utils/classifier/providers';
import { providerSources } from '@email-utils/classifier/sources';
import {
  createDnsValidator,
  type DnsResolver,
} from '@email-utils/validator-dns';
import {
  isValidSyntax,
  type SyntaxOptions,
} from '@email-utils/validator-syntax';
import {
  presets,
  supportMatrix,
  type Preset,
  type SupportRow,
  type SyntaxFeature,
} from '@email-utils/validator-syntax/fixtures';
import type { PhrasingContent, Root, Table, TableCell } from 'mdast';

type Cell = string | PhrasingContent | readonly PhrasingContent[];

const text = (value: string): PhrasingContent => ({ type: 'text', value });
const code = (value: string): PhrasingContent => ({
  type: 'inlineCode',
  value,
});
const link = (url: string, label: string): PhrasingContent => ({
  type: 'link',
  url,
  children: [text(label)],
});

// A label's `backtick` spans become inline code.
const markdown = (label: string): PhrasingContent[] =>
  label
    .split(/`([^`]+)`/)
    .flatMap((part, i) =>
      part === '' ? [] : [i % 2 ? code(part) : text(part)],
    );

function cell(content: Cell): TableCell {
  const children =
    typeof content === 'string'
      ? [text(content)]
      : Array.isArray(content)
        ? [...content]
        : [content as PhrasingContent];
  return { type: 'tableCell', children };
}

function table(
  head: readonly Cell[],
  rows: readonly (readonly Cell[])[],
): Table {
  return {
    type: 'table',
    align: head.map(() => null),
    children: [head, ...rows].map((row) => ({
      type: 'tableRow',
      children: row.map(cell),
    })),
  };
}

const presetHeads = presets.map((preset) => code(preset));

const rfc = (n: number, section: string) =>
  link(
    `https://www.rfc-editor.org/rfc/rfc${n}#section-${section}`,
    `RFC ${n} §${section}`,
  );

const whatwg = link(
  'https://html.spec.whatwg.org/multipage/input.html#valid-e-mail-address',
  'WHATWG HTML',
);

// Where each feature is defined. Keyed by SyntaxFeature, so a feature the
// corpus adds fails the typecheck until it's cited here.
const specs: Record<SyntaxFeature, readonly PhrasingContent[]> = {
  'dot-atom': [rfc(5321, '4.1.2'), rfc(5322, '3.2.3')],
  'atext-specials': [rfc(5322, '3.2.3')],
  'route-chars': [rfc(5322, '3.2.3')],
  'misplaced-dots': [whatwg],
  'long-local': [rfc(5321, '4.5.3.1.1')],
  'quoted-local': [rfc(5321, '4.1.2'), rfc(5322, '3.2.4')],
  'quoted-pair': [rfc(5322, '3.2.1')],
  'obs-local': [rfc(5322, '4.4')],
  comments: [rfc(5322, '3.2.2')],
  fws: [rfc(5322, '3.2.2')],
  'obs-control': [rfc(5322, '4.1')],
  'ipv4-literal': [rfc(5321, '4.1.3')],
  'ipv6-literal': [rfc(5321, '4.1.3')],
  'general-literal': [rfc(5322, '3.4.1')],
  'dotless-domain': [whatwg],
  'unknown-tld': [
    link('https://www.iana.org/domains/root/db', 'IANA root zone'),
  ],
};

const list = (items: readonly PhrasingContent[]): PhrasingContent[] =>
  items.flatMap((item, i) => (i === 0 ? [item] : [text(', '), item]));

// Control characters show as their Unicode control pictures, like ␀ and ␍.
const visible = (address: string) =>
  address.replace(/[\u0000-\u001f\u007f]/g, (c) =>
    String.fromCharCode(c === '\u007f' ? 0x2421 : 0x2400 + c.charCodeAt(0)),
  );

// A feature's first fixture that reads plainly: no control characters and no
// whitespace at either end, unless the feature is about those.
const exampleOf = ({ fixtures }: SupportRow) =>
  (
    fixtures.find(
      ({ address }) =>
        !/[\u0000-\u001f\u007f]/.test(address) && address.trim() === address,
    ) ?? fixtures[0]
  )?.address;

function support(row: SupportRow, preset: Preset): string {
  switch (row.support[preset]) {
    case 'yes':
      return 'Yes';
    case 'no':
      return 'No';
    case 'partial': {
      const accepted = row.fixtures.filter((f) => f.expected[preset].ok);
      return `Partial (${accepted.length} of ${row.fixtures.length})`;
    }
  }
}

/** RFC 5321 and 5322 features × presets, from validator-syntax's corpus. */
function syntaxSupport(): Table {
  return table(
    ['Feature', 'Example', ...presetHeads, 'Defined in'],
    supportMatrix().map((row) => {
      const example = exampleOf(row);
      return [
        markdown(row.label),
        example === undefined ? '' : code(visible(example)),
        ...presets.map((preset) => support(row, preset)),
        list(specs[row.feature]),
      ];
    }),
  );
}

const international: readonly {
  label: string;
  address: string;
  option: keyof SyntaxOptions;
}[] = [
  {
    label: 'UTF-8 local part',
    address: 'josé@example.com',
    option: 'allowUnicode',
  },
  { label: 'U-label domain', address: 'ada@bücher.de', option: 'allowIdn' },
  { label: 'U-label TLD', address: 'ada@пример.рф', option: 'allowIdn' },
];

function judge(address: string, options: SyntaxOptions): boolean | 'throws' {
  try {
    return isValidSyntax(address, options);
  } catch {
    return 'throws';
  }
}

function internationalCell(
  { address, option }: (typeof international)[number],
  preset: Preset,
): Cell {
  if (judge(address, { preset })) return 'Yes';
  switch (judge(address, { preset, [option]: true })) {
    case true:
      return [text('With '), code(option)];
    case 'throws':
      return [code(option), text(' throws')];
    default:
      return 'No';
  }
}

/** RFC 6531 addresses × presets, judged by validator-syntax. */
function internationalSupport(): Table {
  return table(
    ['Feature', 'Example', ...presetHeads],
    international.map((row) => [
      row.label,
      code(row.address),
      ...presets.map((preset) => internationalCell(row, preset)),
    ]),
  );
}

type Mx = Awaited<ReturnType<DnsResolver['resolveMx']>>;

// Node reports a Null MX's host `.` as an empty exchange.
const nullMx = { exchange: '', priority: 0 };
const realMx = { exchange: 'mx.example.com', priority: 10 };

const stub = (mx: Mx): DnsResolver => ({
  resolveMx: async () => mx,
  resolve4: async () => ['192.0.2.1'],
  resolve6: async () => [],
  resolveTxt: async () => [],
});

/** RFC 7505 answers, checked by validator-dns on a stub resolver. */
async function nullMxSupport(): Promise<Table> {
  const cases: readonly [string, Mx][] = [
    ['A Null MX alone', [nullMx]],
    ['A Null MX next to another MX', [nullMx, realMx]],
  ];
  const rows = await Promise.all(
    cases.map(async ([label, mx]): Promise<Cell[]> => {
      const result = await createDnsValidator({ resolver: stub(mx) }).check(
        'example.com',
      );
      return [
        label,
        result.ok
          ? [
              text('Passes, with '),
              code(`nullMx: ${String(result.value.nullMx)}`),
              text(' and '),
              code(`mxHosts: ${JSON.stringify(result.value.mxHosts)}`),
            ]
          : [text('Fails with '), code(result.reason)],
      ];
    }),
  );
  return table(['MX answer', code('checkDns')], rows);
}

// Long lists show the main domain, the canonical one or `<id>.com`, and a
// count; `providers` has the rest.
function domains({
  id,
  domains,
  canonicalDomain,
}: (typeof providers)[number]): string {
  if (domains.length === 0) return 'none; found by MX';
  if (domains.length <= 7) return domains.join(', ');
  const main =
    canonicalDomain ??
    domains.find((domain) => domain === `${id}.com`) ??
    domains[0];
  return `${main} and ${domains.length - 1} more`;
}

/** Every provider in the classifier's registry, with its local-part rules. */
function providerTable(): Table {
  return table(
    [
      'ID',
      'Name',
      'Kind',
      'Domains',
      'Canonical domain',
      'Dots',
      'Subaddress',
      'Hyphens',
      'Subdomain addressing',
    ],
    providers.map((provider) => [
      code(provider.id),
      provider.name,
      provider.kind,
      domains(provider),
      provider.canonicalDomain ?? '',
      provider.dotsSignificant ? 'count' : 'ignored',
      provider.subaddressSeparator === undefined
        ? 'none'
        : code(provider.subaddressSeparator),
      provider.hyphensSignificant
        ? 'count'
        : provider.dotsSignificant
          ? 'same as dots'
          : 'ignored',
      provider.subdomainAddressing ? 'yes' : 'no',
    ]),
  );
}

/** Where each provider rule comes from, from the classifier's `/sources`. */
function providerSourceTable(): Table {
  return table(
    ['Provider', 'Rule', 'Source', 'Checked'],
    providers.flatMap((provider) =>
      (providerSources[provider.id] ?? []).map((source, i) => [
        i === 0 ? provider.name : '',
        code(source.rule),
        [
          source.url ? link(source.url, source.url) : text('DNS lookup'),
          ...(source.note
            ? [text(`${source.url ? '. ' : ': '}${source.note}`)]
            : []),
        ],
        source.verified,
      ]),
    ),
  );
}

const tables: Record<string, () => Table | Promise<Table>> = {
  SyntaxSupport: syntaxSupport,
  InternationalSupport: internationalSupport,
  NullMxSupport: nullMxSupport,
  ProviderTable: providerTable,
  ProviderSources: providerSourceTable,
};

export function remarkSupportMatrix() {
  return async (tree: Root) => {
    for (const [i, node] of tree.children.entries()) {
      if (node.type !== 'mdxJsxFlowElement' || !node.name) continue;
      const build = tables[node.name];
      if (build) tree.children[i] = await build();
    }
  };
}
