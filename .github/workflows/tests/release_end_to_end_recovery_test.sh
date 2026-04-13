#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SUBMIT_WORKFLOW="${ROOT_DIR}/.github/workflows/release.yml"
FINALIZE_WORKFLOW="${ROOT_DIR}/.github/workflows/release-finalize.yml"

fail() {
  echo "[FAIL] $*" >&2
  exit 1
}

pass() {
  echo "[PASS] $*"
}

assert_file() {
  local file="$1"
  [ -f "$file" ] || fail "missing file: ${file}"
}

assert_literal() {
  local file="$1"
  local literal="$2"
  local message="$3"
  grep -Fq -- "$literal" "$file" || fail "${message} (missing literal: ${literal})"
  pass "$message"
}

assert_file "$SUBMIT_WORKFLOW"
assert_file "$FINALIZE_WORKFLOW"
pass "submit/finalize workflows exist"

assert_literal "$SUBMIT_WORKFLOW" "notarization-state.json" "submit emits state asset"
assert_literal "$SUBMIT_WORKFLOW" "APP_SUBMISSION_ID" "submit records app submission id"
assert_literal "$SUBMIT_WORKFLOW" "DMG_SUBMISSION_ID" "submit records dmg submission id"
assert_literal "$FINALIZE_WORKFLOW" "APP_SUBMISSION_ID" "finalize loads app submission id"
assert_literal "$FINALIZE_WORKFLOW" "DMG_SUBMISSION_ID" "finalize loads dmg submission id"
assert_literal "$FINALIZE_WORKFLOW" "release_state_set_component_status" "finalize updates per-artifact status"

assert_literal "$FINALIZE_WORKFLOW" "\"accepted\"" "finalize handles accepted status"
assert_literal "$FINALIZE_WORKFLOW" "\"invalid\"" "finalize handles invalid status"
assert_literal "$FINALIZE_WORKFLOW" "\"waiting\"" "finalize keeps waiting phase"
assert_literal "$FINALIZE_WORKFLOW" "Wait for next finalize cycle" "finalize supports retry on next cycle"

assert_literal "$FINALIZE_WORKFLOW" "gh release edit" "finalize edits release metadata"
assert_literal "$FINALIZE_WORKFLOW" "--prerelease=false" "finalize promotes prerelease to release"
assert_literal "$FINALIZE_WORKFLOW" "[NOTARIZING]" "finalize removes notarizing marker"
