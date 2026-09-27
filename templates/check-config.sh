#!/usr/bin/env bash
# Compares a package's copy of templates/synced with meta's, printing each
# file that's missing or differs, and exits 1 if any is. Only the synced files
# are compared; anything else in the package is its own.
#
#   templates/check-config.sh [package-dir]    # default: the current directory
#
# mani's check-config task runs it in each package clone, and meta's Config
# drift workflow runs it against a fresh checkout of each package's main.
set -euo pipefail

synced="$(cd "$(dirname "$0")/synced" && pwd)"
package="${1:-.}"
status=0

while IFS= read -r file; do
  if [ ! -f "$package/$file" ]; then
    echo "missing: $file"
    status=1
  elif ! cmp -s "$synced/$file" "$package/$file"; then
    echo "differs: $file"
    status=1
  fi
done < <(cd "$synced" && find . -type f | sed 's|^\./||' | sort)

if [ "$status" -eq 0 ]; then
  echo "in sync"
fi
exit "$status"
