---
title: WorkbenchApp 壳层化重构实践（6k+ 行到模块化编排）
date: 2026-04-14
category: best-practices
module: agentnexus-workbench
problem_type: best_practice
component: development_workflow
severity: medium
applies_when:
  - 单个前端容器组件持续膨胀并影响维护效率
  - 需要分阶段重构且必须保持回归可验证
tags: [workbenchapp, modularization, refactor, frontend-architecture, regression-safety]
symptoms:
  - 核心组件行数长期过大，职责耦合
  - 重构期间需要频繁回归 typecheck 与交互测试
root_cause: missing_workflow_step
resolution_type: workflow_improvement
related_components:
  - tooling
  - testing_framework
---

# WorkbenchApp 壳层化重构实践（6k+ 行到模块化编排）

## Context
`src/app/WorkbenchApp.tsx` 在持续迭代后承担了过多职责（模块编排、状态副作用、UI 细节、工具函数），文件规模一度到约 `6134` 行，导致改动定位困难、评审成本高、回归风险上升。

本次重构目标不是一次性重写，而是“分段收口 + 每段可验证”，最终将 `WorkbenchApp.tsx` 收敛到 `3056` 行。

历史会话中的迁移策略与教训（session history）：
- 按 `Prompts -> Skills -> Agents -> Settings` 顺序逐段迁移，避免大爆改。
- 每段迁移后执行 typecheck 与目标测试切片，先保证行为稳定再继续下一段。
- 在 runtime output 尚未完成接线前，先删旧符号会卡住；应先完成新模块接线再清理旧引用。
- 曾出现一次 `WorkbenchApp.prompts` 间歇超时，复跑后通过，说明需要用稳定测试切片持续观察，而不是以单次结果定论。

## Guidance
采用“壳层化（Shell）+ 领域模块（Feature）+ 基础资产（Workbench Base）+ 聚合 Hook”的拆分方式：

1. 先拆领域模块边界
- `src/features/prompts/module/PromptsModule.tsx`
- `src/features/agents/module/AgentsModule.tsx`
- `src/features/settings/module/SettingsModule.tsx`

2. 再抽高耦合 UI 与状态机
- `src/features/settings/components/ModelSettingsPanel.tsx`
- `src/features/common/hooks/useRuntimeOutputSheet.ts`

3. 下沉基础层资产（避免主文件继续堆叠）
- `src/app/workbench/constants.ts`
- `src/app/workbench/types.ts`
- `src/app/workbench/utils.ts`

4. 对“状态 + effects + handlers”聚合块抽 hook
- `src/app/workbench/hooks/useSkillScanDirectories.ts`

5. 主文件只保留“接线与编排”
- `WorkbenchApp.tsx` 只做模块组合、依赖注入、页面级调度。

## Why This Matters
- 变更定位从“全文件搜索”变为“按模块落点修改”，维护效率显著提升。
- 副作用集中到 hook 后，状态流更可推理，降低联动回归概率。
- `constants/types/utils` 统一后，复用路径稳定，避免重复实现和隐式耦合。
- 通过固定回归门禁，重构不以“感觉正确”为准，而以可重复验证为准。

## When to Apply
- React/Tauri 等前端项目中，单一容器文件长期承担多模块编排与副作用。
- 团队出现“改一个功能需要读半个文件”的评审瓶颈。
- 需要边重构边交付，无法接受长周期分支冻结。

## Examples
关键接线路径：
- `src/app/WorkbenchApp.tsx` 引入 `./workbench/constants`、`./workbench/types`、`./workbench/utils` 与 `useSkillScanDirectories`
- 将 settings/model/runtime output 逻辑分别迁入独立组件或 hook

验证命令（本次使用，需在仓库根目录执行）：

```bash
npm run typecheck
```

```bash
npm run test:run -- src/features/prompts/utils/promptCategory.test.ts src/features/prompts/utils/promptBrowseContext.test.ts src/features/prompts/module/PromptsModule.test.tsx src/features/prompts/dialogs/PromptRunDialog.test.tsx src/features/settings/module/SettingsModule.test.tsx src/app/WorkbenchApp.settings.test.tsx src/app/WorkbenchApp.prompts.test.tsx src/app/WorkbenchApp.agents.test.tsx --testTimeout=15000
```

结果：`44 passed (44)`。

说明：以上命令是“本次重构的最小验证基线”，用于快速防回归；涉及更大范围改动时，建议补充 `build` 或更广测试集。

## Related
- `docs/plans/2026-04-14-002-refactor-workbenchapp-modularization-completion-plan.md`
- `docs/plans/2026-04-14-001-refactor-workbench-prompts-module-extraction-plan.md`
- `docs/plans/2026-04-11-002-feat-prompts-category-favorites-browsing-plan.md`
- GitHub issue 检索尝试：`gh issue list --search "AgentNexus WorkbenchApp refactor modularization" --state all --limit 5`（本次环境受代理限制未获取结果）
