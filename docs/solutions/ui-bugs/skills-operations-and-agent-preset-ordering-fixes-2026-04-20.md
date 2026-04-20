---
title: Skills 中控排序失效、状态条不可关闭与 Agents 拖拽排序失效修复
date: 2026-04-20
category: ui-bugs
module: agentnexus-skills-operations
problem_type: ui_bug
component: tooling
symptoms:
  - Skills 中控切换“调用次数排序”后，列表顺序不变化
  - 调用次数分析状态条完成后仍常驻，无法手动关闭
  - 调用分析出现 `agent-format-unsupported` 类解析异常噪声
  - Agents 配置拖拽排序交互不稳定，顺序与技能看板不一致
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [skills-center, usage-analysis, agent-presets, drag-sort, parser]
related_components:
  - development_workflow
  - assistant
---

# Skills 中控排序失效、状态条不可关闭与 Agents 拖拽排序失效修复

## Problem
同一轮需求中，Skills 中控和 Agents 配置存在一组联动问题：排序动作不生效、分析状态条无法关闭、解析异常噪声干扰，以及 Agents 拖拽排序缺少稳定实现，导致“配置顺序 -> 看板顺序 -> 调用分析体验”不一致。

## Symptoms
- “调用次数排序”切换后，列表顺序未按调用次数变化。
- 调用次数分析完成后，状态条仍停留在页面上，用户无法主动关闭。
- 状态条中出现 `agent-format-unsupported` 等异常提示，影响有效信号识别。
- Agents 配置中的已启用平台拖拽后，排序体验和结果稳定性不足。

## What Didn't Work
- 先在错误仓库（`backend-uoc-module`）排查关键词，无法定位目标页面，导致排查路径偏离（session history）。
- 在上级目录做大范围全文检索，命中大量无关仓库内容，噪声过高（session history）。
- 仅在局部组件内切换排序 UI 状态，未联动衍生数据依赖与持久化状态，排序行为仍会“看起来可选、实际上无效”。

## Solution
1. 修复 Skills 中控排序链路并持久化排序模式。
- `src/features/skills/components/SkillsOperationsPanel.tsx`：排序从单一布尔值改为 `UsageSortMode`（`calls_desc/calls_asc/created_desc/created_asc`）。
- `src/shared/stores/shellStore.ts`：新增并持久化 `skillsHubSortMode`。
- `src/app/workbench/hooks/useWorkbenchSkillsDerivedData.ts`：让 `operationsSourceRows` 对 `usageStatsBySkillId` 变化重新计算，避免统计更新后列表不刷新。

2. 新增调用分析状态条的关闭能力。
- `src/shared/stores/skillsStore/actions/usageActions.ts`：新增 `dismissListUsageSyncJob`。
- `src/features/skills/components/operations/UsageFilters.tsx`：状态条增加关闭按钮（`X`），通过 `onDismissUsageSyncJob` 清空列表同步 job。

3. 处理 `agent-format-unsupported` 引起的异常噪声。
- `src-tauri/src/control_plane/skills_usage/parser.rs`：在 `discover_session_files` 中对非 `codex/claude` 的不支持日志格式做静默跳过，不再计入解析异常。
- `src-tauri/src/control_plane/skills_usage/tests.rs`：补充 `discover_session_files_ignores_unsupported_agents_without_failure` 测试，确保该策略可回归。

4. 使用第三方库稳定实现 Agents 拖拽排序，并打通顺序同步。
- `src/features/settings/components/data-settings/AgentPresetGrid.tsx`：基于 `@dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities` 实现拖拽排序。
- `src/app/workbench/hooks/useWorkbenchAgentConnections.ts`：`handleReorderEnabledAgentRows` 统一规范化并保存顺序。
- `src/shared/stores/shellStore.ts`：持久化 `agentPlatformOrderByWorkspace`，让 Agents 配置顺序与 Skills 看板顺序一致。

验证：
- `npm run typecheck`
- `npm run test:run -- src/features/skills/components/__tests__/SkillsOperationsPanel.test.tsx src/app/WorkbenchApp.skills-operations.test.tsx src/app/WorkbenchApp.agents.test.tsx src/shared/stores/shellStore.test.ts`
- `cd src-tauri && cargo test skills_usage -- --nocapture`

## Why This Works
- 排序失效的核心是“状态变了但衍生数据没有重算 + 排序模式未持久化”。将排序模式上提到持久化 store，并补齐衍生依赖后，排序动作会稳定映射到最终行数据。
- 状态条不可关闭是“缺少显式 dismiss action”的状态管理缺口；补齐 action + UI 关闭入口后，用户可主动结束提示。
- `agent-format-unsupported` 对当前链路不是“解析失败”，而是“暂不支持的数据源”。改为静默跳过能避免把能力边界误报为错误。
- 拖拽排序改为成熟 DnD 库后，Pointer/Keyboard 传感器、碰撞检测与数组重排行为可预测，顺序再经 workspace 级持久化即可跨视图一致。

## Prevention
- 任何“排序/筛选”功能上线前，必须覆盖：`store 状态变更 -> 衍生数据重算 -> 列表渲染变化` 的测试链路。
- 对“进行中/完成”状态条统一提供可关闭策略，避免 UI 残留。
- 解析器对“未知来源/不支持格式”采用分级策略：能力边界（skip）与真实失败（error）分离。
- 涉及拖拽的关键交互优先复用成熟库，并在持久化层统一顺序规范化（去重、标准化、小写化）。

## Related Issues
- 相关文档（低重叠）：
  - `docs/solutions/best-practices/workbenchapp-modularization-best-practice-2026-04-14.md`
  - `docs/solutions/best-practices/codebase-line-governance-best-practice-2026-04-19.md`
- GitHub issue 检索尝试：`gh issue list --search "skills usage agent preset drag sort" --state all --limit 5`；当前环境代理受限，未返回可用结果。
