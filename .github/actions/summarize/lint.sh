#!/usr/bin/env bash
# Summarizes oxlint's output ($1, ANSI-free) into `summary` and `details` on
# $GITHUB_OUTPUT. Warnings exit 0, so this runs regardless of outcome. No
# `set -e`: `[ "$n" -eq 1 ] && word=singular` exits non-zero on its false
# branch.
#
# Piped, oxlint prints one `file:line:col: severity rule: message` line per
# finding. On GitHub Actions it prints workflow commands instead, which the
# runner turns into annotations on the diff:
#   ::error file=src/a.ts,line=3,endLine=3,col=3,endColumn=12,title=eslint(no-debugger)::src/a.ts:3:3: `debugger` statement is not allowed
# Those are rewritten into the piped form first, so one parser reads both.

log=$(mktemp)
sed -E \
  -e 's/^::(error|warning) [^:]*title=([^:]*)::([^:]+:[0-9]+:[0-9]+): (.*)$/\3: \1 \2: \4/' \
  -e 's/^::(error|warning) [^:]*::([^:]+:[0-9]+:[0-9]+): (.*)$/\2: \1 \3/' \
  "$1" > "$log"
errors=$(grep -cE '^[^:]+:[0-9]+:[0-9]+: error' "$log" || true)
warnings=$(grep -cE '^[^:]+:[0-9]+:[0-9]+: warning' "$log" || true)
files=$(grep -E '^[^:]+:[0-9]+:[0-9]+: (error|warning)' "$log" | cut -d: -f1 | sort -u | wc -l | tr -d ' ' || true)
error_word="errors"; [ "$errors" -eq 1 ] && error_word="error"
warning_word="warnings"; [ "$warnings" -eq 1 ] && warning_word="warning"
if [ "$errors" -eq 0 ] && [ "$warnings" -eq 0 ]; then
  summary="0 errors, 0 warnings"
else
  file_word="files"; [ "$files" -eq 1 ] && file_word="file"
  summary="$errors $error_word, $warnings $warning_word across $files $file_word"
fi
echo "summary=$summary" >> "$GITHUB_OUTPUT"

# Collapsible per-finding breakdown, capped.
max=15
matches=$(grep -E '^[^:]+:[0-9]+:[0-9]+: (error|warning)' "$log" || true)
delim="ghadelim_$RANDOM$RANDOM"
{
  echo "details<<$delim"
  if [ -n "$matches" ]; then
    total=$(echo "$matches" | wc -l | tr -d ' ')
    echo '<details><summary>Issues</summary>'
    echo ''
    echo "$matches" | head -n "$max" | sed -E \
      -e 's/^([^:]+):([0-9]+):([0-9]+): error:? ?(.*)$/- **\1:\2:\3** — ❌ \4/' \
      -e 's/^([^:]+):([0-9]+):([0-9]+): warning:? ?(.*)$/- **\1:\2:\3** — ⚠️ \4/'
    if [ "$total" -gt "$max" ]; then
      echo ''
      echo "*…and $((total - max)) more — see full output below.*"
    fi
    echo ''
    echo '</details>'
  fi
  echo "$delim"
} >> "$GITHUB_OUTPUT"
