// The audit-comment action's script, under actions/github-script: a
// [!WARNING] on a step that passed, which the job-summary and pr-comment
// actions' pass/fail vocabulary can't say. The summary is always written; the
// comment only with a PR number (under `act` there is none). `env` is
// process.env, passed in so a test can supply its own.
const fs = require('node:fs');
const path = require('node:path');

module.exports = async ({ github, context, core, env }) => {
  const marker = '<!-- ci-audit -->';
  const { owner, repo } = context.repo;
  // The head commit, not context.sha, which is GitHub's merge commit on a PR.
  const sha = context.payload.pull_request?.head?.sha ?? context.sha;
  const runUrl = `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`;
  const meta = [
    `\`${sha.slice(0, 7)}\``,
    'non-blocking',
    `[view run](${runUrl})`,
  ].join(' · ');

  const severityOrder = ['critical', 'high', 'moderate', 'low', 'info'];
  const severityRank = (severity) => {
    const i = severityOrder.indexOf(severity);
    return i === -1 ? severityOrder.length : i;
  };
  const fixCell = (fixAvailable) => {
    if (fixAvailable === true) return 'Yes';
    if (fixAvailable && typeof fixAvailable === 'object') {
      const { name, version, isSemVerMajor } = fixAvailable;
      return `Yes (${name}@${version}${isSemVerMajor ? ', major' : ''})`;
    }
    return 'No';
  };

  let report;
  try {
    const resultsFile = path.resolve(
      env.GITHUB_WORKSPACE ?? '.',
      env.RESULTS_FILE,
    );
    const data = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
    const vulns = data.metadata?.vulnerabilities ?? {};
    const total = vulns.total ?? 0;

    if (total === 0) {
      report = `> [!NOTE]\n> ✅ **npm audit passed** — 0 vulnerabilities · ${meta}`;
    } else {
      const severityTable = [
        '| Severity | Count |',
        '| --- | --- |',
        ...severityOrder.map(
          (s) => `| ${s[0].toUpperCase()}${s.slice(1)} | ${vulns[s] ?? 0} |`,
        ),
      ].join('\n');

      const packages = Object.values(data.vulnerabilities ?? {}).sort(
        (a, b) => {
          const rankDiff = severityRank(a.severity) - severityRank(b.severity);
          return rankDiff !== 0 ? rankDiff : a.name.localeCompare(b.name);
        },
      );

      const max = 20;
      const rows = packages
        .slice(0, max)
        .map(
          (p) => `| ${p.name} | ${p.severity} | ${fixCell(p.fixAvailable)} |`,
        );
      const packageTable = [
        '| Package | Severity | Fix available |',
        '| --- | --- | --- |',
        ...rows,
      ].join('\n');
      const more =
        packages.length > max
          ? `\n\n*…and ${packages.length - max} more — run \`npm audit\` locally for the rest.*`
          : '';

      const label = total === 1 ? 'vulnerability' : 'vulnerabilities';
      report =
        `> [!WARNING]\n> ⚠️ **npm audit found ${total} ${label}** · ${meta}` +
        `\n\n${severityTable}` +
        `\n\n<details><summary>Vulnerable packages</summary>\n\n${packageTable}${more}\n\n</details>`;
    }
  } catch (error) {
    report = `> [!WARNING]\n> ⚠️ **npm audit: could not read the results** (${error.message}) · ${meta}`;
  }

  // Summary first: the one place the result shows on a run with no PR.
  await core.summary.addRaw(report, true).write();

  const prNumber = Number(env.PR_NUMBER);
  if (!prNumber) {
    core.info('No PR number, so the job summary only.');
    return;
  }

  const body = `${marker}\n${report}`;
  try {
    const comments = await github.paginate(github.rest.issues.listComments, {
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });
    // Bots only: a person quoting the marker must not have their comment edited.
    const existing = comments.find(
      (c) => c.user?.type === 'Bot' && c.body?.includes(marker),
    );

    if (existing) {
      await github.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existing.id,
        body,
      });
    } else {
      await github.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body,
      });
    }
  } catch (error) {
    // A PR from a fork gets a read-only token; the summary above still stands.
    if (error.status === 403) {
      core.warning(
        `No permission to comment on #${prNumber} (a fork's PR?), so no comment.`,
      );
      return;
    }
    throw error;
  }
};
