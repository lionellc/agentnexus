#!/usr/bin/env bash

# shellcheck shell=bash

release_state_now() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

release_state_init() {
  local file_path="$1"
  local tag="$2"
  local version="$3"
  local app_submission_id="$4"
  local dmg_submission_id="$5"
  local now
  now="$(release_state_now)"

  python3 - "$file_path" "$tag" "$version" "$app_submission_id" "$dmg_submission_id" "$now" <<'PY'
import json
import pathlib
import sys

file_path = pathlib.Path(sys.argv[1])
tag = sys.argv[2]
version = sys.argv[3]
app_submission_id = sys.argv[4]
dmg_submission_id = sys.argv[5]
now = sys.argv[6]

payload = {
    "schemaVersion": 1,
    "tag": tag,
    "version": version,
    "phase": "submitted",
    "createdAt": now,
    "updatedAt": now,
    "app": {
        "submissionId": app_submission_id,
        "status": "Submitted",
        "lastCheckedAt": None,
    },
    "dmg": {
        "submissionId": dmg_submission_id,
        "status": "Submitted",
        "lastCheckedAt": None,
    },
    "lastError": None,
}

file_path.parent.mkdir(parents=True, exist_ok=True)
file_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
}

release_state_validate() {
  local file_path="$1"
  python3 - "$file_path" <<'PY'
import json
import pathlib
import sys

file_path = pathlib.Path(sys.argv[1])
if not file_path.exists():
    raise SystemExit(f"release state file not found: {file_path}")

data = json.loads(file_path.read_text(encoding="utf-8"))

required_root = ("schemaVersion", "tag", "version", "phase", "app", "dmg", "updatedAt")
for key in required_root:
    if key not in data:
        raise SystemExit(f"release state missing field: {key}")

for component in ("app", "dmg"):
    value = data.get(component)
    if not isinstance(value, dict):
        raise SystemExit(f"release state field is not object: {component}")
    for field in ("submissionId", "status"):
        if not value.get(field):
            raise SystemExit(f"release state missing {component}.{field}")

allowed_phase = {"submitted", "notarizing", "waiting", "accepted", "finalized", "failed"}
if data.get("phase") not in allowed_phase:
    raise SystemExit(f"release state invalid phase: {data.get('phase')}")

print("release state validation ok")
PY
}

release_state_get() {
  local file_path="$1"
  local key_path="$2"
  python3 - "$file_path" "$key_path" <<'PY'
import json
import pathlib
import sys

file_path = pathlib.Path(sys.argv[1])
key_path = sys.argv[2]
parts = key_path.split(".")

data = json.loads(file_path.read_text(encoding="utf-8"))
value = data
for part in parts:
    if isinstance(value, dict) and part in value:
        value = value[part]
    else:
        raise SystemExit(f"release state key not found: {key_path}")

if value is None:
    print("")
elif isinstance(value, (dict, list)):
    print(json.dumps(value, ensure_ascii=False))
else:
    print(value)
PY
}

release_state_set_phase() {
  local file_path="$1"
  local phase="$2"
  local now
  now="$(release_state_now)"
  python3 - "$file_path" "$phase" "$now" <<'PY'
import json
import pathlib
import sys

file_path = pathlib.Path(sys.argv[1])
phase = sys.argv[2]
now = sys.argv[3]

data = json.loads(file_path.read_text(encoding="utf-8"))
data["phase"] = phase
data["updatedAt"] = now
file_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
}

release_state_set_component_status() {
  local file_path="$1"
  local component="$2"
  local status="$3"
  local now
  now="$(release_state_now)"
  python3 - "$file_path" "$component" "$status" "$now" <<'PY'
import json
import pathlib
import sys

file_path = pathlib.Path(sys.argv[1])
component = sys.argv[2]
status = sys.argv[3]
now = sys.argv[4]

data = json.loads(file_path.read_text(encoding="utf-8"))
if component not in ("app", "dmg"):
    raise SystemExit(f"unsupported component: {component}")

if component not in data or not isinstance(data[component], dict):
    raise SystemExit(f"missing component object: {component}")

data[component]["status"] = status
data[component]["lastCheckedAt"] = now
data["updatedAt"] = now
file_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
}

release_state_set_error() {
  local file_path="$1"
  local error_msg="$2"
  local now
  now="$(release_state_now)"
  python3 - "$file_path" "$error_msg" "$now" <<'PY'
import json
import pathlib
import sys

file_path = pathlib.Path(sys.argv[1])
error_msg = sys.argv[2]
now = sys.argv[3]

data = json.loads(file_path.read_text(encoding="utf-8"))
data["lastError"] = error_msg
data["updatedAt"] = now
file_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
}

release_state_clear_error() {
  local file_path="$1"
  local now
  now="$(release_state_now)"
  python3 - "$file_path" "$now" <<'PY'
import json
import pathlib
import sys

file_path = pathlib.Path(sys.argv[1])
now = sys.argv[2]

data = json.loads(file_path.read_text(encoding="utf-8"))
data["lastError"] = None
data["updatedAt"] = now
file_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
}
