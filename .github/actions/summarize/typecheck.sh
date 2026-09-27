#!/usr/bin/env bash
# Summarizes `tsc --noEmit` output ($1, ANSI-free) into `summary` and
# `details` on $GITHUB_OUTPUT. Piped, tsc prints one `file(line,col): error`
# line per error and no total. No `set -e`: `[ "$n" -eq 1 ] && word=singular`
# exits non-zero on its false branch.

log="$1"
errors=$(grep -cE '^[^(]+\([0-9]+,[0-9]+\): error TS[0-9]+:' "$log" || true)
files=$(grep -E '^[^(]+\([0-9]+,[0-9]+\): error TS[0-9]+:' "$log" | sed -E 's/\([0-9]+,[0-9]+\).*$//' | sort -u | wc -l | tr -d ' ' || true)
if [ "$errors" -eq 0 ]; then
  summary="0 errors"
else
  error_word="errors"; [ "$errors" -eq 1 ] && error_word="error"
  file_word="files"; [ "$files" -eq 1 ] && file_word="file"
  summary="$errors $error_word across $files $file_word"
fi
echo "summary=$summary" >> "$GITHUB_OUTPUT"

# Collapsible per-error breakdown, capped.
max=15
matches=$(grep -E '^[^(]+\([0-9]+,[0-9]+\): error TS[0-9]+:' "$log" || true)
delim="ghadelim_$RANDOM$RANDOM"
{
  echo "details<<$delim"
  if [ -n "$matches" ]; then
    total=$(echo "$matches" | wc -l | tr -d ' ')
    echo '<details><summary>Issues</summary>'
    echo ''
    echo "$matches" | head -n "$max" | sed -E 's/^([^(]+)\(([0-9]+),([0-9]+)\): error (TS[0-9]+): (.*)$/- **\1:\2:\3** — ❌ \4: \5/'
    if [ "$total" -gt "$max" ]; then
      echo ''
      echo "*…and $((total - max)) more — see full output below.*"
    fi
    echo ''
    echo '</details>'
  fi
  echo "$delim"
} >> "$GITHUB_OUTPUT"
