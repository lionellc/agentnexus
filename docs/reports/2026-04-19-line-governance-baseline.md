# 2026-04-19 Line Governance Baseline

## Report Metadata

- Date: 2026-04-19
- Repo: `AgentNexus`
- Scope: `src/**`, `src-tauri/src/**`
- Policy:
  - Hard limit: `>1000` forbidden
  - Soft limit: `>500` requires allowlist

## Allowlist Snapshot (Baseline Capture)

Snapshot source at baseline capture time: `config/line-governance.allowlist.json`

- total entries: 7
- key temporary entries:
  - `src-tauri/src/db.rs` (max 900)
  - `src-tauri/src/domain/models.rs` (max 700)
  - `src/shared/services/api.ts` (max 650)
  - `src/features/settings/components/DataSettingsPanel.tsx` (max 800)
  - `src/shared/stores/skillsStore.ts` (max 900)
  - `src/shared/stores/agentRulesStore.ts` (max 900)
  - `src/features/skills/components/SkillsOperationsPanel.tsx` (max 900)

## Baseline Command

```bash
npm run check:line-governance
```

## Baseline Result (Captured 2026-04-19)

Gate status: `FAIL`

Violations:

1. `src/app/WorkbenchApp.tsx`: 3258 (`E_MAX_1000`)
2. `src-tauri/src/control_plane/commands.rs`: 3130 (`E_MAX_1000`)
3. `src-tauri/src/control_plane/skills_manager.rs`: 2550 (`E_MAX_1000`)
4. `src-tauri/src/control_plane/local_agent_translation.rs`: 1934 (`E_MAX_1000`)
5. `src-tauri/src/control_plane/agent_rules_v2.rs`: 1687 (`E_MAX_1000`)
6. `src-tauri/src/control_plane/skills_usage.rs`: 1552 (`E_MAX_1000`)
7. `src/app/workbench/hooks/useWorkbenchAgentsController.tsx`: 669 (`E_MAX_500_NO_ALLOWLIST`)

## Remediation Mapping

- Unit 4: `WorkbenchApp.tsx`, `useWorkbenchAgentsController.tsx`
- Unit 5: `commands.rs`
- Unit 6: `skills_manager.rs`, `skills_usage.rs`
- Unit 7: `local_agent_translation.rs`, `agent_rules_v2.rs`
- Unit 8: workflow hardening + cutover evidence

## Acceptance Exit Criteria

- No `E_MAX_1000` violations in scope.
- No `E_MAX_500_NO_ALLOWLIST` violations in scope.
- Allowlist remains temporary and reviewable (`owner/reason/reviewBy` complete).
- Core regression tests remain green after decomposition.
