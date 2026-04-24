#!/usr/bin/env bash
set -u

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_docs="$repo_root/docs"
workspace_docs="${AZVISION_WORKSPACE_DOCS:-/Users/gun/.openclaw/workspace/docs/azvision}"

if [[ ! -d "$workspace_docs" ]]; then
  echo "Workspace docs mirror not found: $workspace_docs"
  exit 0
fi

echo "AzVision docs mirror visibility check"
echo "repo:      $repo_docs"
echo "workspace: $workspace_docs"
echo

diff -rq "$repo_docs" "$workspace_docs" || true

echo
echo "Note: this script is visibility-only and always exits 0."
echo "Expected deferred drift is documented in docs/MIRROR_POLICY.md."
exit 0
