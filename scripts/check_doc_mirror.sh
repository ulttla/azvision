#!/usr/bin/env bash
set -u

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_docs="$repo_root/docs"
workspace_docs="${AZVISION_WORKSPACE_DOCS:-/Users/gun/.openclaw/workspace/docs/azvision}"
strict="${AZVISION_DOC_MIRROR_STRICT:-0}"

if [[ ! -d "$workspace_docs" ]]; then
  echo "Workspace docs mirror not found: $workspace_docs"
  if [[ "$strict" == "1" ]]; then
    exit 1
  fi
  exit 0
fi

echo "AzVision docs mirror visibility check"
echo "repo:      $repo_docs"
echo "workspace: $workspace_docs"
echo

if diff_output="$(diff -rq "$repo_docs" "$workspace_docs")"; then
  echo "No mirror drift detected."
  exit 0
fi

printf '%s\n' "$diff_output"
echo

if [[ "$strict" == "1" ]]; then
  echo "FAIL: docs mirror drift detected because AZVISION_DOC_MIRROR_STRICT=1."
  exit 1
fi

echo "Note: this script is visibility-only by default and exits 0."
echo "Set AZVISION_DOC_MIRROR_STRICT=1 to make drift fail."
echo "Expected deferred drift is documented in docs/MIRROR_POLICY.md."
exit 0
