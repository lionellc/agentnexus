#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
STATE_HELPER="${ROOT_DIR}/.github/scripts/release_state.sh"
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
  local path="$1"
  [ -f "$path" ] || fail "missing file: ${path}"
}

assert_literal() {
  local file="$1"
  local literal="$2"
  local message="$3"
  grep -Fq -- "$literal" "$file" || fail "${message} (missing literal: ${literal})"
  pass "$message"
}

assert_file "$STATE_HELPER"
assert_file "$SUBMIT_WORKFLOW"
assert_file "$FINALIZE_WORKFLOW"
pass "state helper + workflows exist"

assert_literal "$STATE_HELPER" "\"schemaVersion\"" "state schema version field exists"
assert_literal "$STATE_HELPER" "\"phase\"" "state phase field exists"
assert_literal "$STATE_HELPER" "\"app\"" "state app node exists"
assert_literal "$STATE_HELPER" "\"dmg\"" "state dmg node exists"
assert_literal "$STATE_HELPER" "\"submissionId\"" "state submission id field exists"
assert_literal "$STATE_HELPER" "\"lastCheckedAt\"" "state last checked field exists"
assert_literal "$STATE_HELPER" "\"lastError\"" "state error field exists"

assert_literal "$SUBMIT_WORKFLOW" "notarization-state.json" "submit writes notarization state asset"
assert_literal "$SUBMIT_WORKFLOW" "APP_SUBMISSION_ID" "submit exposes app submission id"
assert_literal "$SUBMIT_WORKFLOW" "DMG_SUBMISSION_ID" "submit exposes dmg submission id"
assert_literal "$FINALIZE_WORKFLOW" "notarization-state.json" "finalize consumes notarization state asset"
assert_literal "$FINALIZE_WORKFLOW" "app.submissionId" "finalize reads app submission id from state"
assert_literal "$FINALIZE_WORKFLOW" "dmg.submissionId" "finalize reads dmg submission id from state"
