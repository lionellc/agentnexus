#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT_PATH="${ROOT_DIR}/.github/scripts/check_line_limits.mjs"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "${TMP_ROOT}"' EXIT

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

write_lines_file() {
  local file_path="$1"
  local line_count="$2"
  mkdir -p "$(dirname "$file_path")"
  : > "$file_path"
  for ((i = 1; i <= line_count; i += 1)); do
    printf "const line_%04d = %d;\n" "$i" "$i" >> "$file_path"
  done
}

write_allowlist() {
  local case_dir="$1"
  local body="$2"
  mkdir -p "${case_dir}/config"
  cat > "${case_dir}/config/line-governance.allowlist.json" <<EOF_JSON
{
  "version": 1,
  "updatedAt": "2026-04-19",
  "description": "contract-test",
  "entries": ${body}
}
EOF_JSON
}

run_expect_pass() {
  local case_name="$1"
  local case_dir="$2"
  if node "$SCRIPT_PATH" --root "$case_dir" --scope all >/tmp/line-governance-pass.out 2>&1; then
    pass "${case_name}"
    return
  fi
  cat /tmp/line-governance-pass.out >&2 || true
  fail "${case_name} should pass but failed"
}

run_expect_fail() {
  local case_name="$1"
  local case_dir="$2"
  if node "$SCRIPT_PATH" --root "$case_dir" --scope all >/tmp/line-governance-fail.out 2>&1; then
    cat /tmp/line-governance-fail.out >&2 || true
    fail "${case_name} should fail but passed"
  fi
  pass "${case_name}"
}

assert_file "$SCRIPT_PATH"
pass "line governance script exists"

# Case 1: <=500 lines should pass.
CASE_1="${TMP_ROOT}/case-1"
mkdir -p "${CASE_1}"
write_allowlist "${CASE_1}" "[]"
write_lines_file "${CASE_1}/src/example.ts" 500
run_expect_pass "Case 1: file <= 500 passes" "$CASE_1"

# Case 2: >500 and no allowlist should fail.
CASE_2="${TMP_ROOT}/case-2"
mkdir -p "${CASE_2}"
write_allowlist "${CASE_2}" "[]"
write_lines_file "${CASE_2}/src/example.ts" 501
run_expect_fail "Case 2: file > 500 without allowlist fails" "$CASE_2"

# Case 3: allowlisted file <= maxLines and <=1000 should pass.
CASE_3="${TMP_ROOT}/case-3"
mkdir -p "${CASE_3}"
write_allowlist "${CASE_3}" '[
  {
    "path": "src/example.ts",
    "maxLines": 800,
    "owner": "@owner",
    "reason": "contract test",
    "reviewBy": "2026-05-31"
  }
]'
write_lines_file "${CASE_3}/src/example.ts" 700
run_expect_pass "Case 3: allowlisted file >500 and <=1000 passes" "$CASE_3"

# Case 4: >1000 should fail even if allowlisted.
CASE_4="${TMP_ROOT}/case-4"
mkdir -p "${CASE_4}"
write_allowlist "${CASE_4}" '[
  {
    "path": "src/example.ts",
    "maxLines": 1000,
    "owner": "@owner",
    "reason": "contract test",
    "reviewBy": "2026-05-31"
  }
]'
write_lines_file "${CASE_4}/src/example.ts" 1001
run_expect_fail "Case 4: file >1000 fails even with allowlist" "$CASE_4"

# Case 5: invalid allowlist maxLines >1000 should fail config validation.
CASE_5="${TMP_ROOT}/case-5"
mkdir -p "${CASE_5}"
write_allowlist "${CASE_5}" '[
  {
    "path": "src/example.ts",
    "maxLines": 1200,
    "owner": "@owner",
    "reason": "contract test",
    "reviewBy": "2026-05-31"
  }
]'
write_lines_file "${CASE_5}/src/example.ts" 10
run_expect_fail "Case 5: invalid allowlist entry fails validation" "$CASE_5"

pass "all line governance contract checks passed"
