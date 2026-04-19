# Codebase Line Governance Cutover Checklist

## Execution Record

- Executed at: `2026-04-19 19:55:05 CST`
- Owner: `@liuc`
- Rollback baseline commit: `8343b01`

## 1. Pre-cutover

- [x] Freeze window announced and active.
- [x] Plan units 1-8 implementation complete in branch.
- [x] `config/line-governance.allowlist.json` reviewed:
  - [x] each entry has `owner`
  - [x] each entry has `reason`
  - [x] each entry has `reviewBy`
  - [x] no entry has `maxLines > 1000`
- [x] Baseline report generated:
  - `docs/reports/2026-04-19-line-governance-baseline.md`

## 2. Technical Gate Checks

Run and archive outputs:

```bash
npm run check:line-governance
npm run check:line-governance:changed
npm run test:line-governance
```

- [x] Full scope check passes.
- [x] Changed-scope check passes.
- [x] Contract tests for governance script pass.

## 3. Frontend Regression

- [x] Typecheck passes:

```bash
npm run typecheck
```

- [x] Workbench module regressions pass:

```bash
npm run test:run -- \
  src/app/WorkbenchApp.agents.test.tsx \
  src/app/WorkbenchApp.prompts.test.tsx \
  src/app/WorkbenchApp.skills-operations.test.tsx \
  src/app/WorkbenchApp.settings.test.tsx
```

## 4. Rust / Tauri Regression

- [x] `cargo check` passes under `src-tauri/`.
- [x] Existing control-plane contract tests pass (if present). (`N/A`: no `src-tauri/tests/*contract*` test files in this branch snapshot.)
- [x] Decomposed command registration in `src-tauri/src/lib.rs` is complete and consistent with frontend invoke names.

## 5. Workflow Enforcement

- [x] `.github/workflows/line-governance.yml` enabled on PR.
- [ ] `line-governance` job set as required status check in branch protection. (Repo admin action)
- [ ] No bypass exception left undocumented. (Confirm during PR merge window)

## 6. Post-cutover Audit

- [x] Re-run `npm run check:line-governance` on latest branch head.
- [x] Update this checklist with execution date and owner.
- [ ] Publish final evidence links in PR description: (to fill when opening PR)
  - Baseline report
  - Cutover audit report
  - Workflow run URLs
  - Key test logs
- [x] Create/refresh best practice doc:
  - `docs/solutions/best-practices/codebase-line-governance-best-practice-2026-04-19.md`

## 7. Rollback Readiness

- [x] Keep previous passing commit SHA noted.
- [x] If gate unexpectedly blocks unrelated critical fix: process predefined (not triggered in this run)
  - [ ] temporary exception documented
  - [ ] rollback/forward-fix owner assigned
  - [ ] follow-up cleanup issue created
