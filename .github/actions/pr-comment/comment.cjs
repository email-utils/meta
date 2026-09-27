// The pr-comment action's script, under actions/github-script. Each check
// keeps one comment, found by its hidden marker and updated in place, so a PR
// carries one thread per check however often CI runs. `env` is process.env,
// passed in so a test can supply its own.
const fs = require('node:fs');

// CI=true turns colour on in most tools, so logs arrive with ANSI codes.
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

function readLog(logFile) {
  if (!fs.existsSync(logFile))
    return `(no output captured: ${logFile} does not exist)`;
  return fs
    .readFileSync(logFile, 'utf8')
    .replace(ANSI, '')
    .trimEnd()
    .split('\n')
    .slice(-100)
    .join('\n');
}

// One backtick longer than any run in the text, so the log can't close it.
function fence(text) {
  const longest = Math.max(
    0,
    ...(text.match(/`+/g) ?? []).map((run) => run.length),
  );
  const marks = '`'.repeat(Math.max(3, longest + 1));
  return `${marks}\n${text}\n${marks}`;
}

module.exports = async ({ github, context, core, env }) => {
  const prNumber = Number(env.PR_NUMBER);
  if (!prNumber) {
    core.info('No PR number, so no comment.');
    return;
  }

  const checkName = env.CHECK_NAME;
  const outcome = env.OUTCOME;
  const summary = env.SUMMARY;
  const details = env.DETAILS;
  const marker = `<!-- ci-${env.MARKER_SLUG} -->`;
  const { owner, repo } = context.repo;

  // The head commit, not context.sha, which is GitHub's merge commit on a PR.
  const sha = context.payload.pull_request?.head?.sha ?? context.sha;
  const runUrl = `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`;
  const metaParts = [`\`${sha.slice(0, 7)}\``];
  if (env.DURATION) metaParts.push(env.DURATION);
  metaParts.push(`[view run](${runUrl})`);
  const meta = metaParts.join(' · ');

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

    if (outcome === 'success' && env.SUCCESS_MODE === 'minimize') {
      if (!existing) return;
      const statLine = summary
        ? ` — ${summary} (previously failed)`
        : ' (previously failed)';
      const body = `${marker}\n> [!NOTE]\n> ✅ **${checkName} passed**${statLine} · ${meta}`;
      await github.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existing.id,
        body,
      });
      await github.graphql(
        `mutation($id: ID!) {
          minimizeComment(input: { subjectId: $id, classifier: RESOLVED }) {
            minimizedComment { isMinimized }
          }
        }`,
        { id: existing.node_id },
      );
      return;
    }

    // A success in 'comment' mode, or any failure: always upsert, and
    // un-minimize first so the latest result is never left hidden.
    const verb = outcome === 'success' ? 'passed' : 'failed';
    const callout = outcome === 'success' ? '[!NOTE]' : '[!CAUTION]';
    const emoji = outcome === 'success' ? '✅' : '❌';
    const statLine = summary ? ` — ${summary}` : '';

    let body = `${marker}\n> ${callout}\n> ${emoji} **${checkName} ${verb}**${statLine} · ${meta}`;
    if (details) body += `\n\n${details}`;
    if (outcome !== 'success') {
      body += `\n\n<details><summary>Output</summary>\n\n${fence(readLog(env.LOG_FILE))}\n</details>`;
    }

    if (existing) {
      try {
        await github.graphql(
          `mutation($id: ID!) {
            unminimizeComment(input: { subjectId: $id }) {
              unminimizedComment { isMinimized }
            }
          }`,
          { id: existing.node_id },
        );
      } catch {
        // Wasn't minimized, so there's nothing to undo.
      }
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
    // A PR from a fork gets a read-only token. The check's own result still
    // stands, so a refused comment mustn't fail the job.
    if (error.status === 403) {
      core.warning(
        `No permission to comment on #${prNumber} (a fork's PR?), so no comment.`,
      );
      return;
    }
    throw error;
  }
};
