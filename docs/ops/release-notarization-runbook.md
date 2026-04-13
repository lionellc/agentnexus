# Release Notarization Runbook (Submit / Finalize)

## Overview

The release pipeline is split into two phases:

1. `release.yml` (submit): build, sign, submit app + dmg to Apple notary, update release to `[NOTARIZING]` prerelease, upload status asset.
2. `release-finalize.yml` (finalize): poll notarization status, complete staple/publish when both are `Accepted`.

This design avoids long blocking waits in a single GitHub Actions job.

## `[NOTARIZING]` prerelease meaning

- The release artifacts are built and notarization is submitted.
- Notarization is still in progress.
- The release is intentionally marked as `prerelease`.
- Do not treat this release as production-ready until finalize completes.

## Manual finalize

Trigger finalize manually for a specific tag:

```bash
gh workflow run release-finalize.yml -f release_tag=v0.1.1
```

Then check runs:

```bash
gh run list --workflow release-finalize.yml --limit 5
```

## Status asset and fields

Primary status source: release asset `notarization-state.json`.

Use it to confirm:

- target tag/version
- `app` submission id and status
- `dmg` submission id and status
- last checked time / last update time
- last error summary (if present)

## Troubleshooting flow

1. Open target release and download `notarization-state.json`.
2. Verify both submission ids exist (`app` and `dmg`).
3. Check current statuses:
   - `Accepted`: success for that artifact.
   - `In Progress`: wait and rerun finalize later.
   - `Invalid` / `Rejected`: inspect finalize logs and notary log output.
4. Open `release-finalize.yml` run logs and locate artifact-scoped messages (`app` / `dmg`).
5. If transient network errors appear, rerun finalize (or wait for scheduled run).
6. If `Invalid` / `Rejected`, fix signing/notary issues and start a new release tag flow.

## Recovery rules

- Default recovery path: rerun `release-finalize.yml` (manual or wait schedule).
- Do not use rerun submit as default recovery, to avoid duplicate submissions and queue buildup.
- If status asset is missing or malformed, recreate release state from the successful submit run outputs before finalize.
