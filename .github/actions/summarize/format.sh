#!/usr/bin/env bash
# Summarizes `prettier --check` output ($1, ANSI-free) into `summary` and
# `details` on $GITHUB_OUTPUT. Prettier prints one `[warn] <file>` per file,
# counted directly since the trailing sentence varies. No `set -e`:
# `[ "$n" -eq 1 ] && word=singular` exits non-zero on its false branch.

log="$1"
files=$(grep -E '^\[warn\] ' "$log" | grep -vc 'Code style issues found' || true)
if [ "$files" -eq 0 ]; then
  summary="0 files need formatting"
else
  file_word="files"; verb="need"
  [ "$files" -eq 1 ] && file_word="file" && verb="needs"
  summary="$files $file_word $verb formatting"
fi
echo "summary=$summary" >> "$GITHUB_OUTPUT"

# Collapsible file list, capped.
max=15
file_list=$(grep -E '^\[warn\] ' "$log" | grep -v 'Code style issues found' | sed -E 's/^\[warn\] //' || true)
delim="ghadelim_$RANDOM$RANDOM"
{
  echo "details<<$delim"
  if [ -n "$file_list" ]; then
    total=$(echo "$file_list" | wc -l | tr -d ' ')
    echo '<details><summary>Files</summary>'
    echo ''
    # shellcheck disable=SC2016 # literal backticks, for markdown code
    echo "$file_list" | head -n "$max" | sed -E 's/^(.*)$/- `\1`/'
    if [ "$total" -gt "$max" ]; then
      echo ''
      echo "*…and $((total - max)) more.*"
    fi
    echo ''
    echo '</details>'
  fi
  echo "$delim"
} >> "$GITHUB_OUTPUT"
