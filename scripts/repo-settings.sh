#!/usr/bin/env bash
# Applies the organization's repository settings to every email-utils repo:
# squash-only merges that use the PR title and body, auto-merge, branch
# deletion on merge, the security features, and a `main` ruleset that
# requires a PR, linear history, and each repo's PR gate checks. Rerunning it
# is safe: the ruleset is updated in place by name.
#
#   scripts/repo-settings.sh [--dry-run] [repo...]    # default: every repo
#
# --dry-run prints each request instead of sending it. Needs a gh login with
# admin rights on the repos.
set -euo pipefail

org=email-utils
ruleset_name=main
# GitHub Actions, the app that reports every check below.
actions_app=15368

# The checks each repo's ruleset requires, as GitHub reports them. The
# packages' come from templates/synced/.github/workflows; `checks / audit`
# is non-blocking, so it's left out. Meta's come from its own pr-gate.yml;
# its Config drift legs report rather than gate. .github has no CI.
package_checks=(
  'pr-title / pr-title'
  'checks / lint'
  'checks / format'
  'checks / typecheck'
  'checks / build'
  'checks / package'
  'test / vitest'
)
meta_checks=(
  'pr-title / pr-title'
  actionlint
  zizmor
  shellcheck
  format
)

dry_run=false
if [ "${1:-}" = --dry-run ]; then
  dry_run=true
  shift
fi
repos=("$@")
if [ "${#repos[@]}" -eq 0 ]; then
  repos=(meta validator-syntax classifier sanitizer validator-dns .github)
fi

# gh api, or with --dry-run, the request it would send.
api() {
  if "$dry_run"; then
    echo "  gh api $*"
    if [ -n "${body:-}" ]; then
      jq . <<<"$body" | sed 's/^/    /'
    fi
  elif [ -n "${body:-}" ]; then
    gh api "$@" --input - <<<"$body" >/dev/null
  else
    gh api "$@" >/dev/null
  fi
}

# The ruleset for one repo, with its required checks as arguments.
ruleset() {
  jq -n --arg name "$ruleset_name" --argjson app "$actions_app" '
    {
      name: $name,
      target: "branch",
      enforcement: "active",
      conditions: {ref_name: {include: ["~DEFAULT_BRANCH"], exclude: []}},
      bypass_actors: [],
      rules: (
        [
          {type: "deletion"},
          {type: "non_fast_forward"},
          {type: "required_linear_history"},
          {
            type: "pull_request",
            parameters: {
              required_approving_review_count: 0,
              dismiss_stale_reviews_on_push: false,
              require_code_owner_review: false,
              require_last_push_approval: false,
              required_review_thread_resolution: true,
              allowed_merge_methods: ["squash"]
            }
          }
        ] + (
          if $ARGS.positional == [] then []
          else [{
            type: "required_status_checks",
            parameters: {
              # Not strict: squash merges keep main linear anyway, and
              # requiring an up-to-date branch would stall every queued
              # auto-merge whenever one lands.
              strict_required_status_checks_policy: false,
              do_not_enforce_on_create: false,
              required_status_checks: [
                $ARGS.positional[] | {context: ., integration_id: $app}
              ]
            }
          }]
          end
        )
      )
    }' --args "$@"
}

for repo in "${repos[@]}"; do
  echo "$org/$repo"
  case "$repo" in
    meta) checks=("${meta_checks[@]}") ;;
    .github) checks=() ;;
    *) checks=("${package_checks[@]}") ;;
  esac

  # Squash only, with the PR title as the subject. The body carries the
  # PR's `Closes` lines and any footers release-please reads.
  body=$(jq -n '{
    allow_squash_merge: true,
    allow_merge_commit: false,
    allow_rebase_merge: false,
    squash_merge_commit_title: "PR_TITLE",
    squash_merge_commit_message: "PR_BODY",
    allow_auto_merge: true,
    allow_update_branch: true,
    delete_branch_on_merge: true,
    security_and_analysis: {
      secret_scanning: {status: "enabled"},
      secret_scanning_push_protection: {status: "enabled"}
    }
  }')
  api -X PATCH "repos/$org/$repo"

  body=''
  api -X PUT "repos/$org/$repo/private-vulnerability-reporting"
  api -X PUT "repos/$org/$repo/vulnerability-alerts"
  api -X PUT "repos/$org/$repo/automated-security-fixes"

  body=$(ruleset ${checks[@]+"${checks[@]}"})
  id=$(gh api "repos/$org/$repo/rulesets" \
    --jq ".[] | select(.name == \"$ruleset_name\") | .id")
  if [ -n "$id" ]; then
    api -X PUT "repos/$org/$repo/rulesets/$id"
  else
    api -X POST "repos/$org/$repo/rulesets"
  fi
done
