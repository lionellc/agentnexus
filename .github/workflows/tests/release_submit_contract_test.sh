#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORKFLOW_FILE="${ROOT_DIR}/.github/workflows/release.yml"

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

[ -f "$WORKFLOW_FILE" ] || fail "submit workflow not found: ${WORKFLOW_FILE}"
pass "submit workflow exists"

assert_literal "name: Release Submit" "workflow name"
assert_literal "push:" "push trigger"
assert_literal "tags:" "tag trigger"
assert_literal "- \"v*\"" "v* tag filter"
assert_literal "workflow_dispatch:" "manual trigger"
assert_literal "release_tag:" "release tag input"
assert_literal "cargo_text_updated, replacements = re.subn(" "cargo version replacement counts matches"
assert_literal "if replacements != 1:" "cargo version replacement allows unchanged target version"

assert_literal "Build app bundle" "build step exists"
assert_literal "Submit app and dmg to notary" "submit step exists"
assert_literal "notary_submit_with_retry" "notary submit helper call exists"
assert_literal "Write notarization state asset" "state write step exists"
assert_literal "release_state_init" "state init helper usage"
assert_literal "notarization-state.json" "state asset name"
assert_literal "app-notary.zip" "app notary zip generated"
assert_literal ".github/release-notes/\${TAG}.md" "final release notes source uses tag-specific file"
assert_literal "release-notes-final.md" "final release notes asset generated in submit"
assert_literal "Create or update NOTARIZING prerelease" "release upsert step exists"
assert_literal "gh release" "gh release operations exist"
assert_literal "--prerelease" "prerelease flag exists"
assert_literal "[NOTARIZING]" "notarizing marker exists"
