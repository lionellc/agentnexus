#!/usr/bin/env bash

# shellcheck shell=bash

notary_log() {
  echo "$@" >&2
}

is_transient_notary_error() {
  echo "$1" | grep -Eqi "NSURLErrorDomain Code=-1009|The Internet connection appears to be offline|timed out|network.*(offline|route|unreachable)|temporarily unavailable|HTTP status code: 5[0-9]{2}|service.*unavailable|gateway timeout|Connection reset by peer|Could not resolve host"
}

notary_preflight() {
  local max_attempts="${1:-2}"
  local attempt=1
  while [ "$attempt" -le "$max_attempts" ]; do
    notary_log "[notary][preflight] attempt ${attempt}/${max_attempts}"
    local output
    set +e
    output="$(xcrun notarytool history --keychain-profile "$NOTARY_PROFILE_NAME" --output-format json 2>&1)"
    local rc=$?
    set -e
    if [ "$rc" -eq 0 ]; then
      notary_log "[notary][preflight] ok"
      return 0
    fi
    notary_log "$output"
    if ! is_transient_notary_error "$output"; then
      notary_log "[notary][preflight] non-transient failure"
      return "$rc"
    fi
    if [ "$attempt" -ge "$max_attempts" ]; then
      notary_log "[notary][preflight] retries exhausted"
      return "$rc"
    fi
    local backoff=$((attempt * 15))
    notary_log "[notary][preflight] transient failure, retry in ${backoff}s"
    sleep "$backoff"
    attempt=$((attempt + 1))
  done
}

notary_submit_with_retry() {
  local artifact="$1"
  local label="$2"
  local max_attempts="${3:-3}"
  local attempt=1
  while [ "$attempt" -le "$max_attempts" ]; do
    notary_log "[notary][$label] submit attempt ${attempt}/${max_attempts}"
    local output
    set +e
    output="$(xcrun notarytool submit "$artifact" --keychain-profile "$NOTARY_PROFILE_NAME" --output-format json --no-progress 2>&1)"
    local rc=$?
    set -e
    if [ "$rc" -eq 0 ]; then
      local submission_id
      submission_id="$(printf '%s' "$output" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("id", ""))' 2>/dev/null || true)"
      if [ -n "$submission_id" ]; then
        printf '%s\n' "$submission_id"
        return 0
      fi
      notary_log "[notary][$label] submit succeeded but id parse failed"
      notary_log "$output"
      return 1
    fi
    notary_log "$output"
    if ! is_transient_notary_error "$output"; then
      notary_log "[notary][$label] non-transient submit failure"
      return "$rc"
    fi
    if [ "$attempt" -ge "$max_attempts" ]; then
      notary_log "[notary][$label] submit retries exhausted"
      return "$rc"
    fi
    local backoff=$((attempt * 30))
    notary_log "[notary][$label] transient submit failure, retry in ${backoff}s"
    sleep "$backoff"
    attempt=$((attempt + 1))
  done
}

notary_query_status() {
  local submission_id="$1"
  local label="$2"
  local max_attempts="${3:-3}"
  local retry_sleep_seconds="${4:-15}"
  local attempt=1

  while [ "$attempt" -le "$max_attempts" ]; do
    local output
    set +e
    output="$(xcrun notarytool info "$submission_id" --keychain-profile "$NOTARY_PROFILE_NAME" --output-format json 2>&1)"
    local rc=$?
    set -e
    if [ "$rc" -eq 0 ]; then
      local status
      status="$(printf '%s' "$output" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status", ""))' 2>/dev/null || true)"
      notary_log "[notary][$label][$(date -u +"%Y-%m-%dT%H:%M:%SZ")] status=${status:-unknown} id=${submission_id}"
      printf '%s\n' "$status"
      return 0
    fi

    notary_log "$output"
    if ! is_transient_notary_error "$output"; then
      notary_log "[notary][$label] non-transient status query failure"
      return "$rc"
    fi

    if [ "$attempt" -ge "$max_attempts" ]; then
      notary_log "[notary][$label] status query retries exhausted"
      return "$rc"
    fi

    notary_log "[notary][$label] transient status query failure, retry in ${retry_sleep_seconds}s"
    sleep "$retry_sleep_seconds"
    attempt=$((attempt + 1))
  done
}

notary_dump_log() {
  local submission_id="$1"
  local label="$2"
  notary_log "[notary][$label] fetching failure log for id=${submission_id}"
  set +e
  local log_output
  log_output="$(xcrun notarytool log "$submission_id" --keychain-profile "$NOTARY_PROFILE_NAME" 2>&1)"
  local rc=$?
  set -e
  notary_log "$log_output"
  return "$rc"
}
