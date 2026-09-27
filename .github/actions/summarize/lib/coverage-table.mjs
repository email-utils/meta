// coverage-v8's json-summary (istanbul's coverage-summary.json format) into a
// short stat and a collapsible per-file table.
import fs from 'node:fs';
import path from 'node:path';

const METRICS = ['lines', 'branches', 'functions', 'statements'];
const MAX_ROWS = 15;

function formatPct(pct) {
  return typeof pct === 'number' ? `${pct}%` : '—';
}

// The stat and table, or null when the run wrote no summary. Vitest skips
// coverage when a test fails, so this is the normal case for a red run.
// coverage-v8 keys files by absolute path, relativized against repoRoot.
export function buildCoverageSection(summaryPath, repoRoot) {
  if (!fs.existsSync(summaryPath)) return null;

  const data = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const { total, ...files } = data;

  const stat = METRICS.map(
    (metric) => `${formatPct(total[metric].pct)} ${metric}`,
  ).join(', ');

  const rows = Object.entries(files)
    .map(([file, metrics]) => ({
      file: path.isAbsolute(file) ? path.relative(repoRoot, file) : file,
      metrics,
    }))
    // Files with nothing to measure always show a meaningless 100%.
    .filter(({ metrics }) => METRICS.some((m) => metrics[m].total > 0))
    .sort((a, b) => {
      const aPct =
        typeof a.metrics.lines.pct === 'number' ? a.metrics.lines.pct : 0;
      const bPct =
        typeof b.metrics.lines.pct === 'number' ? b.metrics.lines.pct : 0;
      return aPct - bPct;
    });

  const header = `| File | ${METRICS.map((m) => `${m[0].toUpperCase()}${m.slice(1)}`).join(' | ')} |`;
  const divider = `|---|${METRICS.map(() => '---').join('|')}|`;
  const totalRow = `| **Total** | ${METRICS.map((m) => `**${formatPct(total[m].pct)}**`).join(' | ')} |`;
  const fileRows = rows
    .slice(0, MAX_ROWS)
    .map(
      ({ file, metrics }) =>
        `| \`${file}\` | ${METRICS.map((m) => formatPct(metrics[m].pct)).join(' | ')} |`,
    );

  const lines = [
    '<details><summary>Coverage by file</summary>',
    '',
    header,
    divider,
    totalRow,
    ...fileRows,
  ];
  if (rows.length > MAX_ROWS) {
    lines.push(
      '',
      `*…and ${rows.length - MAX_ROWS} more — see the coverage artifact for the full report.*`,
    );
  }
  lines.push('', '</details>');

  return { stat, table: lines.join('\n') };
}
