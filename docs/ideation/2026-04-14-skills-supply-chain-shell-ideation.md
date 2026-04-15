---
date: 2026-04-14
topic: skills-supply-chain-shell
focus: skills manager information architecture and borrowing-distribution workflow
---

# Ideation: Skills 供应链主壳

## Codebase Context
- `src/features/skills/components/SkillsCenter.tsx` 当前把扫描、列表浏览、治理入口放在同一层，认知任务混杂。
- `src/features/skills/components/SkillManagerPanel.tsx` 规则编辑、批量 link/unlink、同步清理能力齐全，但以技术状态和 JSON 为主，不够任务导向。
- `src/shared/types/skills.ts` 与 `src/shared/types/skillsManager.ts` 已有 `source/sourceParent/statusByTool/group/conflict` 等结构，足够支撑“项目分组 + 三段路径 + 任务态”。
- `.docs/2026-04-14-001-feat-skills-manager-borrowing-plan.md` 已明确收编/分发/软链治理方向，主要缺口在产品壳层与交互路径收敛。

## Ranked Ideas

### 1. 技能供应链主壳（扫描 -> 收编 -> 分发）
**Description:** 在 Skills 顶部固定三阶段导航，当前阶段只展示对应动作与状态，避免浏览与治理混层。规则作为“准入策略”，分发作为“执行动作”，显式拆分。
**Rationale:** 与用户目标完全一致，能同时解决概念混乱、功能重复、路径不清的问题。
**Downsides:** 需要重排 SkillsCenter 的信息架构与状态来源，改动范围中等。
**Confidence:** 93%
**Complexity:** Medium
**Status:** Explored

### 2. 扫描收件箱 + 项目分组单列表
**Description:** 扫描结果先进入收件箱，在同一列表按项目分组展示，组内可收编/忽略/查看详情。
**Rationale:** 直接满足“按项目分组在同列表展示”并减少跳页。
**Downsides:** 需新增“发现态/纳管态”边界与批量状态计算。
**Confidence:** 92%
**Complexity:** Medium
**Status:** Unexplored

### 3. 收编向导（原地保留软链）
**Description:** 三步向导：选择扫描目录 -> 按项目确认收编 -> 预演并确认写入资产库软链，明确“不移动原目录”。
**Rationale:** 使“扫描后下一步”可执行，显式承载你的核心心智。
**Downsides:** 需要预演结果模型与中间态交互。
**Confidence:** 90%
**Complexity:** Medium
**Status:** Unexplored

### 4. 三段路径可视化（Source -> Library -> Agent）
**Description:** 在技能详情中展示本机源目录、应用资产库、Agent 规则目录三段路径和连通状态。
**Rationale:** 把“收编/分发”变成可见链路，排障和理解成本显著下降。
**Downsides:** 信息密度较高，需要良好折叠层次。
**Confidence:** 89%
**Complexity:** Medium
**Status:** Unexplored

### 5. 状态转任务（Status-to-Action）
**Description:** 将技术状态归并为“待收编/待分发/待修复/已完成”，并附单击动作。
**Rationale:** 从“看状态”转为“做动作”，缩短完成路径。
**Downsides:** 需要稳定的状态映射规则与边界定义。
**Confidence:** 88%
**Complexity:** Medium-Low
**Status:** Unexplored

### 6. 可视化规则编排器（表单优先，JSON 降级）+ What-if
**Description:** 默认表单配置规则并在保存前模拟影响面，高级模式保留 JSON 兜底。
**Rationale:** 降低门槛且保留能力上限，适配新手与高级用户。
**Downsides:** 首版规则 UI 与模拟器投入较高。
**Confidence:** 86%
**Complexity:** Medium-High
**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | 纯复刻 Prompts IA 三视角 | 与“主壳分阶段 + 分舱”高度重叠，价值较弱 |
| 2 | 一键全自动收编并分发 | 首版风险高，失败语义和回滚复杂 |
| 3 | 后台守护自动漂移修复 | 偏二期运维能力，非当前核心痛点 |
| 4 | 操作时间线 + Undo | 有价值但不先解决认知主问题 |
| 5 | 先选 Agent 再选技能反转流程 | 更适合高级模式，不宜默认入口 |
| 6 | 抽屉+全页+双人格详情全部首发 | 交互负担过高，优先最短闭环 |

## Session Log
- 2026-04-14: Initial ideation - 40 generated, 6 survived
- 2026-04-14: Selected idea #1 for ce:brainstorm (skills supply-chain shell)
