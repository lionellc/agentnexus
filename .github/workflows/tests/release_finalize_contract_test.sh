#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORKFLOW_FILE="${ROOT_DIR}/.github/workflows/release-finalize.yml"

fail() {
  echo "[FAIL] $*" >&2
  exit 1
}

pass() {
  echo "[PASS] $*"
}

assert_literal() {
  local literal="$1"
  local message="$2"
  grep -Fq -- "$literal" "$WORKFLOW_FILE" || fail "${message} (missing literal: ${literal})"
  pass "$message"
}

[ -f "$WORKFLOW_FILE" ] || fail "finalize workflow not found: ${WORKFLOW_FILE}"
pass "finalize workflow exists"

assert_literal "name: Release Finalize" "workflow name"
assert_literal "schedule:" "schedule trigger"
assert_literal "cron: \"*/30 * * * *\"" "30-minute cron"
assert_literal "workflow_dispatch:" "manual trigger"
assert_literal "release_tag:" "manual release_tag input"
assert_literal "concurrency:" "concurrency config exists"
assert_literal 'release-finalize-${{ needs.resolve-target.outputs.release_tag }}' "tag level concurrency key"

assert_literal "notarization-state.json" "state asset name"
assert_literal "notary_query_status" "notary info helper call exists"
assert_literal "xcrun stapler staple" "staple step exists"
assert_literal "xcrun stapler validate" "staple validate step exists"
assert_literal "--context context:primary-signature" "dmg spctl uses primary-signature context"
assert_literal "source=Insufficient Context" "dmg spctl insufficient-context fallback exists"
assert_literal "release-notes-final.md" "finalize downloads and uses final notes asset"
assert_literal "Missing final release notes asset" "finalize fails when final notes asset missing"
assert_literal "gh release upload" "release upload step exists"
assert_literal "gh release edit" "release edit step exists"
assert_literal "--prerelease=false" "promote to stable release"
assert_literal "[NOTARIZING]" "notarizing marker handling"
