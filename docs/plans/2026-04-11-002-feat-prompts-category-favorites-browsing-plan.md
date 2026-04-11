---
title: "feat: Prompts Category/Favorites Browsing"
type: feat
status: active
date: 2026-04-11
origin: docs/brainstorms/2026-04-11-prompts-category-favorites-browsing-requirements.md
---

# feat: Prompts Category/Favorites Browsing

## Overview

本计划落地 Prompts 的双视角浏览壳（`All / Categories / Favorites`），把现有“可编辑但不可浏览”的 `category/favorite` 能力升级为一等导航入口，并保持现有 list/gallery/table 与批量操作不回归（see origin: docs/brainstorms/2026-04-11-prompts-category-favorites-browsing-requirements.md）。

## Problem Frame

当前 Prompts 页面只有关键词搜索，缺少分类导航与收藏夹入口，导致用户无法从结构化视角快速定位高频 Prompt。该改造需要在单页工作台内完成，不引入多收藏夹与全量路由重构（see origin）。

## Requirements Trace

- R1-R5：新增三视角入口，`Categories` 两栏布局，`Favorites` 作为一等入口。
- R6-R10：实现域内搜索与上下文展示，保持现有视图模式选择。
- R11-R13：批量操作后提供可选跳转，补齐分类/收藏空态下一步动作。
- R14-R15：同 workspace 恢复浏览上下文；查询链路接通结构化筛选语义。
- R16-R17：补齐浏览路径测试，并确保既有收藏/批量能力无回归。

## Scope Boundaries

- 仅支持单一 `favorite=true` 收藏集合，不做多收藏夹。
- 不做分类层级管理，仅基于现有 `category` 值聚合。
- 不做跨模块导航改造。
- 不做可分享 URL 深链接（仅本地状态恢复）。

## Context & Research

### Relevant Code and Patterns

- Prompts 主交互集中在 `src/app/WorkbenchApp.tsx`，当前 `filteredPrompts` 仅使用 `promptQuery` 与 `name/content/tags`。
- Prompt 数据模型与 Tauri 命令已支持 `category/favorite`：
  - `src/shared/types/prompts.ts`
  - `src/shared/services/promptService.ts`
  - `src-tauri/src/domain/models.rs`
  - `src-tauri/src/control_plane/commands.rs` (`prompt_search`)
- Shell 级持久化模式已存在（zustand persist）：`src/shared/stores/shellStore.ts`。
- Prompts 回归测试基线集中在 `src/app/WorkbenchApp.prompts.test.tsx`。

### Institutional Learnings

- `docs/solutions/` 当前无可复用条目；本计划以 origin requirements 与现有仓内模式为主。

### External Research Decision

- 本次不做外部研究。原因：当前仓库已有完整的 Prompt 搜索字段契约、状态存储范式与工作台交互模式，足以支撑本需求。

## Key Technical Decisions

- 浏览上下文采用显式状态模型：`scope = all | categories | favorites` + `selectedCategory`。
- `All` 视角允许 `category` 筛选，不允许 `favorite` 筛选；`Favorites` 固定 `favorite=true`。
- 分类聚合在前端归一化：`trim + lowercase`；`""/null/default` 合并为 `uncategorized` 展示项。
- 浏览上下文按 workspace 维度持久化，key 方案：`agentnexus.prompts.browseContext.<workspaceId>.v1`。
- 持久化分类失效时回退到 `Categories > 全部分类`，并保留当前关键词。
- 批量操作后只提供可选跳转 CTA，不强制切换视角。
- V1 以现有 `prompt_list + 前端域内过滤` 为主链路，同时把 store 搜索参数升级为结构化输入，保持与 `prompt_search` 契约对齐。

## Open Questions

### Resolved During Planning

- 分类排序：按归一化分类名升序。
- `未分类` 口径：空字符串、`NULL`、`default` 统一归并。
- 点击计数口径：从 Prompts 页面首屏可交互状态起算。

### Deferred to Implementation

- 浏览上下文状态放在 `shellStore` 还是独立 localStorage helper（按改动面与测试稳定性择优）。
- `prompt_search` 的接入策略是否在 V1 即切到远端查询优先，还是先保留前端本地过滤为权威。

## Output Structure

```text
docs/plans/
  2026-04-11-002-feat-prompts-category-favorites-browsing-plan.md
src/app/
  WorkbenchApp.tsx
  WorkbenchApp.prompts.test.tsx
src/shared/stores/
  promptsStore.ts
  shellStore.ts
src/shared/types/
  prompts.ts
src/shared/services/
  promptService.ts
  api.ts
```

## Implementation Units

- [x] **Unit 1: 浏览上下文模型与分类归一化基础**

**Goal:** 定义可复用的浏览上下文与分类归一化语义，避免在页面内散落条件分支。

**Requirements:** R1, R4, R4.1, R9

**Dependencies:** None

**Files:**
- Modify: `src/app/WorkbenchApp.tsx`
- Modify: `src/shared/types/prompts.ts`
- Test: `src/app/WorkbenchApp.prompts.test.tsx`

**Approach:**
- 引入浏览上下文状态：`promptBrowseScope`、`promptBrowseCategory`。
- 抽离分类归一化逻辑：统一 `uncategorized` 判定与显示名映射。
- 构建分类导航数据源（全部分类、未分类、动态分类项）。

**Patterns to follow:**
- `src/app/WorkbenchApp.tsx` 中 `useMemo` 派生列表模式。
- `src/shared/types/prompts.ts` 既有 Prompt 类型扩展方式。

**Test scenarios:**
- Happy path: 分类列表正确聚合并按升序展示。
- Edge case: `""/default` 被归并到 `未分类`。
- Edge case: 分类大小写差异合并为同一展示项。

**Verification:**
- 分类导航源数据与列表条目统计一致。

- [x] **Unit 2: 三视角入口与域内过滤主链路**

**Goal:** 落地 `All / Categories / Favorites` 三视角入口和域内搜索。

**Requirements:** R1-R3, R5-R8, R10

**Dependencies:** Unit 1

**Files:**
- Modify: `src/app/WorkbenchApp.tsx`
- Modify: `src/shared/stores/promptsStore.ts`
- Modify: `src/shared/services/promptService.ts`
- Modify: `src/shared/services/api.ts`
- Test: `src/app/WorkbenchApp.prompts.test.tsx`

**Approach:**
- 在 Prompts 顶部新增浏览视角切换控件。
- 在 `Categories` 视角启用两栏布局：左栏分类导航，右栏沿用现有列表/卡片/表格渲染。
- 重构 `filteredPrompts` 为“先定域再搜索”的过滤流水线：
  - `All`：全量 + 关键词 + 可选分类。
  - `Categories`：当前分类域 + 关键词。
  - `Favorites`：`favorite=true` 域 + 关键词。
- 统一视角切换与 `promptViewMode` 的兼容行为，保证 list/gallery/table 不被重置。
- `searchPrompts` 升级为接收结构化输入（含 `category/favorite`），确保契约完整。

**Execution note:** 先补失败测试（分类域/收藏域）再改过滤流水线。

**Patterns to follow:**
- `src/app/WorkbenchApp.tsx` 现有 Tabs 与分页交互模式。
- `src/shared/stores/promptsStore.ts` 现有批量动作状态更新模式。

**Test scenarios:**
- Happy path: 三视角切换可达，列表正确变化。
- Happy path: `Favorites` 视角仅展示收藏项。
- Happy path: `Categories` 视角搜索不跨域。
- Regression: 切换视角不影响 list/gallery/table 当前选择。

**Verification:**
- 三视角行为满足 R1-R10，既有详情页与编辑入口不受影响。

- [x] **Unit 3: 上下文条、空态与可选跳转闭环**

**Goal:** 补齐浏览可理解性与操作后回看路径。

**Requirements:** R9, R11-R13

**Dependencies:** Unit 2

**Files:**
- Modify: `src/app/WorkbenchApp.tsx`
- Test: `src/app/WorkbenchApp.prompts.test.tsx`

**Approach:**
- 在列表区域增加上下文条：显示当前域与分类，支持一键回到 `All`。
- 分类空态与收藏空态提供明确动作：创建 Prompt、回到 All、清空搜索。
- 在批量收藏/批量移动成功 toast 中增加可选跳转动作（按钮/二次 CTA），将用户带到对应视角并定位列表。

**Patterns to follow:**
- `src/app/WorkbenchApp.tsx` 现有 `toast` 与批量动作结果展示模式。
- `src/shared/ui` 中 EmptyState/SectionTitle 的既有组合样式。

**Test scenarios:**
- Happy path: 批量收藏后可一键进入 Favorites。
- Happy path: 批量移动后可一键进入目标分类。
- Edge case: 当前搜索无结果时空态动作可恢复可见数据。

**Verification:**
- 批量动作到浏览验证路径可闭环，且无强制跳转。

- [x] **Unit 4: workspace 级持久化与恢复回退**

**Goal:** 实现浏览上下文恢复并处理失效分类回退。

**Requirements:** R2.1, R14, R14.1

**Dependencies:** Unit 2

**Files:**
- Modify: `src/app/WorkbenchApp.tsx`
- Modify: `src/shared/stores/shellStore.ts`
- Modify: `src/features/shell/types.ts`
- Test: `src/app/WorkbenchApp.prompts.test.tsx`

**Approach:**
- 持久化 `scope + selectedCategory` 到 workspace 维度存储。
- 页面初始化按“先恢复、后默认”规则加载视角。
- 当恢复分类不存在时自动回退到 `Categories > 全部分类` 并保留关键词。
- 实现落地选择了 `WorkbenchApp.tsx` 内 localStorage helper（`agentnexus.prompts.browse-context.<workspaceId>.v1`），未改动 `shellStore`。

**Patterns to follow:**
- `src/shared/stores/shellStore.ts` 的 persist partialize 机制。
- `src/app/WorkbenchApp.tsx` 既有 localStorage 列设置键管理方式。

**Test scenarios:**
- Happy path: 同 workspace 重开后恢复上次视角与分类。
- Edge case: 分类被删除后回退规则生效。
- Regression: 不同 workspace 间浏览上下文互不污染。

**Verification:**
- 恢复逻辑与默认逻辑优先级符合 R2.1。

- [x] **Unit 5: 回归与新增测试收口**

**Goal:** 建立浏览能力回归网，并覆盖现有能力不回归约束。

**Requirements:** R16-R17

**Dependencies:** Unit 1-4

**Files:**
- Modify: `src/app/WorkbenchApp.prompts.test.tsx`
- Create (optional): `src/app/WorkbenchApp.prompts.browsing.test.tsx`

**Approach:**
- 新增浏览主路径测试：入口可达、域内过滤、上下文条、空态动作、恢复逻辑。
- 保留并复跑既有测试断言：单条收藏切换、批量收藏/取消收藏、批量移动、批量删除、详情保存。
- 若单文件过大，拆分 browsing 专项测试文件，避免夹具复杂度失控。

**Patterns to follow:**
- `src/app/WorkbenchApp.prompts.test.tsx` 当前 mock store 结构与交互驱动方式。

**Test scenarios:**
- Feature: `All/Categories/Favorites` 切换与过滤正确。
- Feature: 分类归一化与未分类归并正确。
- Feature: workspace 级恢复与回退正确。
- Regression: 既有批量/详情链路通过。

**Verification:**
- 新增浏览测试通过，既有 prompts 交互测试不退化。

## Risk Register

- `WorkbenchApp.tsx` 变更面大，容易引入交互回归。
- 视角状态、分页、多选状态之间可能出现耦合 bug。
- workspace 持久化若设计不当会产生跨项目污染。

## Sequencing Summary

1. 先完成 Unit 1（语义与归一化基线），避免后续 UI 与过滤逻辑重复返工。
2. 再做 Unit 2（主链路），尽早形成可用浏览壳。
3. 然后做 Unit 3（闭环与可理解性）和 Unit 4（恢复语义）。
4. 最后 Unit 5 集中补齐回归网并稳定交付。

## Execution Notes (2026-04-11)

- 已完成 `All / Categories / Favorites` 三视角、分类导航、域内搜索与上下文条。
- 已完成批量收藏/批量移动后的可选跳转 CTA（不强制跳转）。
- 已完成 workspace 级浏览上下文恢复与分类失效回退。
- 测试：
  - `npm run test:run -- src/app/WorkbenchApp.prompts.test.tsx`（15 passed）
  - `npm run typecheck`（passed）
