# 2026-04-19 Line Governance Cutover Audit

## Metadata

- Executed at: `2026-04-19 19:55:05 CST`
- Owner: `@liuc`
- Branch HEAD: `8343b01`
- Scope: `src/**`, `src-tauri/src/**`

## 1. Governance Gate Result

### 1.1 Full scope

Command:

```bash
npm run check:line-governance
```

Result: `PASS` (`Checked files: 205`)

### 1.2 Changed scope

Command:

```bash
npm run check:line-governance:changed
```

Result: `PASS` (`Diff range: origin/main...HEAD`, `Checked files: 0`)

Note: current branch snapshot has no committed diff against `origin/main`; changed-scope gate is green.

### 1.3 Contract tests

Command:

```bash
npm run test:line-governance
```

Result: `PASS` (`Case 1` to `Case 5` all passed)

## 2. Regression Result

### 2.1 Frontend

Commands:

```bash
npm run typecheck
npm run test:run -- \
  src/app/WorkbenchApp.agents.test.tsx \
  src/app/WorkbenchApp.prompts.test.tsx \
  src/app/WorkbenchApp.skills-operations.test.tsx \
  src/app/WorkbenchApp.settings.test.tsx
```

Results:

- `typecheck`: `PASS`
- `vitest`: `4` files passed, `35` tests passed

### 2.2 Rust / Tauri

Command:

```bash
cd src-tauri && cargo check
```

Result: `PASS` (warnings only, no build failure)

## 3. Active Allowlist Snapshot

After cleanup, allowlist keeps only current `>500` files:

| Path | Current Lines | maxLines | reviewBy |
| --- | ---: | ---: | --- |
| `src-tauri/src/db.rs` | 899 | 900 | 2026-05-31 |
| `src-tauri/src/domain/models.rs` | 580 | 700 | 2026-05-31 |
| `src-tauri/src/control_plane/commands/distribution_commands.rs` | 794 | 900 | 2026-06-30 |
| `src-tauri/src/control_plane/commands/skills_support.rs` | 919 | 1000 | 2026-06-30 |
| `src-tauri/src/control_plane/skills_manager/api.rs` | 766 | 900 | 2026-06-30 |
| `src-tauri/src/control_plane/skills_usage/parser.rs` | 606 | 800 | 2026-06-30 |
| `src-tauri/src/control_plane/local_agent_translation/executor.rs` | 595 | 800 | 2026-06-30 |
| `src-tauri/src/control_plane/local_agent_translation/prompt_translation.rs` | 547 | 700 | 2026-06-30 |
| `src-tauri/src/control_plane/agent_rules_v2/apply.rs` | 580 | 600 | 2026-06-30 |
| `src/app/workbench/hooks/WorkbenchAppContent.tsx` | 909 | 1000 | 2026-06-30 |

## 4. Remaining Manual Actions

- Configure branch protection to require `line-governance` status check.
- Fill workflow run URLs and evidence links in PR description during merge.
