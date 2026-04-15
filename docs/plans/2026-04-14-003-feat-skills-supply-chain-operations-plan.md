---
title: feat: Skills 供应链运营界面与配置分舱实施计划
type: feat
status: active
date: 2026-04-14
origin: docs/brainstorms/2026-04-14-skills-supply-chain-shell-requirements.md
---

# feat: Skills 供应链运营界面与配置分舱实施计划

## Overview

将 Skills 域从“浏览/管理同层混排”重构为“运营模式（高频）+ 配置模式（低频）”双模式，并以“目标目录状态矩阵 + skills 列表摘要/行内展开”承载高频分发检查。  
在不破坏既有 `skills_*` 对外契约的前提下，补齐关键交互（两步分发、默认预选策略、局部乐观更新+后台校准、状态检查浮层）与收编冲突判定（全文件 diff + 进度 + 可中断）。

## Problem Frame

当前实现中，`SkillsCenter` 与 `SkillManagerPanel` 在同一层直接拼接，导致扫描、收编、分发、规则编辑心智冲突；高频分发检查路径被低频配置能力淹没。  
本计划基于已定稿 requirements，优先落地高频运营路径，保证“看状态 -> 判断 -> 分发 -> 校准”闭环顺畅，同时把低频扫描/收编下沉到配置模式，降低主界面认知负荷（see origin: `docs/brainstorms/2026-04-14-skills-supply-chain-shell-requirements.md`）。

## Requirements Trace

- R1-R4.1: 双模式导航与默认运营落点
- R2.0-R2.6: 运营模式混合布局、行内展开与交互密度
- R5-R6, R8-R9: 扫描/收编分组、关键状态覆盖与大规模可用性保护
- R7.1-R7.3: 同名冲突判定、全文件 diff、可中断
- R10-R10.6: 分发目标选择策略、两步弹窗、提交校验、局部乐观更新+全量校准
- R11: 规则/分发职责边界清晰化
- R12.1-R12.2: 7 类冲突 + 严格可重试口径
- R13-R14.1: 逐项决策、批量跳过、回规则保留上下文与阻断明细
- R15-R17: 目标矩阵状态、胶囊点击检查、精简状态明细、列表返回上下文恢复
- Success Criteria: 高频效率、分发可见性与回归稳定性

## Scope Boundaries

- 不修改 `skills_*` 既有命令签名与返回结构。
- 不新增 `skills_*` 对外字段，新增流程态由前端派生或 `skills_manager_*` 承载。
- 不引入独立后端服务，继续使用现有 React + Zustand + Tauri/Rust 架构。
- 不在本次计划落地自动漂移修复、时间线 Undo、硬删除目录。

### Deferred to Separate Tasks

- 大规模列表渲染进一步优化（虚拟滚动阈值调优、性能压测自动化）
- 三段链路密度进一步可视化微调（仅体验迭代，不影响主功能）

## Context & Research

### Relevant Code and Patterns

- 现有 Skills 视图与详情承载：`src/features/skills/components/SkillsCenter.tsx`
- 现有管理面板（sync/clean/batch/rules）：`src/features/skills/components/SkillManagerPanel.tsx`
- Skills 状态与动作聚合：`src/shared/stores/skillsStore.ts`
- Skills 模块控制器扩展位：`src/features/skills/module/useSkillsModuleController.ts`
- Workbench 壳层编排入口：`src/app/WorkbenchApp.tsx`
- Tauri 管理能力与状态语义：`src-tauri/src/control_plane/skills_manager.rs`
- 扫描能力基础：`src-tauri/src/execution_plane/skills.rs`

### Institutional Learnings

- 模块化迁移应优先下沉领域控制器，避免 `WorkbenchApp.tsx` 继续膨胀：`docs/solutions/best-practices/workbenchapp-modularization-best-practice-2026-04-14.md`
- Skills 管理增强需走 `skills_manager_*` 双轨，不回归旧 `skills_*` 契约：`.docs/2026-04-14-001-feat-skills-manager-borrowing-plan.md`
- 分发失败治理需固化 `partial_failed + 失败子集重试`：`.docs/02-v1-测试矩阵.md`

### External References

- 无（本次以仓内模式和既有约束为主，未引入外部框架新能力）

## Key Technical Decisions

- 决策1：默认首页为运营模式，配置模式次级入口（顶部 Tab）。
  - 理由：匹配高频路径，降低低频配置噪声。
- 决策2：行内状态不平铺，采用“摘要 + 单行展开 + 前3项 + 查看更多”。
  - 理由：多目录场景下保持可读性与密度平衡。
- 决策3：分发弹窗两步式（选目标 -> 预览确认），并执行前置校验（未选目录禁用确认）。
  - 理由：减少误操作和认知跳转。
- 决策4：执行后先局部乐观更新，再全量校准；不一致仅行内轻提示。
  - 理由：兼顾速度与一致性。
- 决策5：同名冲突先做“同一 skill 全文件 diff”判定，支持进度与中断。
  - 理由：保证覆盖决策有证据且可止损。
- 决策6：状态检查明细默认精简信息，动作区“主按钮 + 更多操作”。
  - 理由：高频操作优先，不牺牲扩展动作。

## Open Questions

### Resolved During Planning

- 运营/配置入口形式：顶部次级 Tab。
- 分发无历史时预选策略：默认不预选。
- 部分失败主 CTA：仅重试失败项。
- 矩阵卡片点击行为：仅过滤列表。

### Deferred to Implementation

- 全文件 diff 的性能阈值与分批策略（目录深度、二进制文件跳过策略）需结合真实样本调优。
- 列表大规模阈值（何时启用虚拟滚动）需基于实现后基准数据最终冻结。

## Output Structure

```text
src/features/skills/
  components/
    SkillsCenter.tsx
    SkillsOperationsPanel.tsx
    SkillsConfigPanel.tsx
    SkillDistributionDialog.tsx
    SkillStatusPopover.tsx
    __tests__/
      SkillsOperationsPanel.test.tsx
      SkillDistributionDialog.test.tsx
      SkillStatusPopover.test.tsx
  module/
    SkillsModule.tsx
    useSkillsModuleController.ts
src/shared/stores/
  skillsStore.ts
  __tests__/
    skillsStore.operations.test.ts
src/shared/types/
  skillsManager.ts
src/app/
  WorkbenchApp.tsx
  WorkbenchApp.skills-operations.test.tsx
src-tauri/src/control_plane/
  skills_manager.rs
```

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart TB
  A[运营模式] --> B[目标目录矩阵]
  A --> C[Skills 列表摘要]
  C --> D[单行展开(状态明细)]
  D --> E[状态检查浮层]
  C --> F[分发按钮]
  F --> G[两步分发弹窗]
  G --> H[预览确认执行]
  H --> I[局部乐观更新]
  I --> J[后台全量校准]
  J --> K[行内轻提示(若不一致)]

  L[配置模式] --> M[扫描/收编]
  M --> N[同名冲突全文件diff]
  N --> O[进度弹窗+可中断]
```

## Implementation Units

- [ ] **Unit 1: Skills 状态模型与 Store 派生层重构**

**Goal:** 为运营模式提供稳定的聚合摘要、单行展开、目标目录状态矩阵派生数据，并承接“局部乐观更新+全量校准”状态流。

**Requirements:** R2.0-R2.6, R10.4-R10.5, R15.1-R15.3, R17

**Dependencies:** None

**Files:**
- Modify: `src/shared/stores/skillsStore.ts`
- Modify: `src/shared/types/skillsManager.ts`
- Create: `src/shared/stores/__tests__/skillsStore.operations.test.ts`

**Approach:**
- 在 store 中新增运营态切片（mode、expandedRowId、matrixFilters、optimisticPatch）。
- 新增派生选择器：列表摘要（已链接x/y、异常数）、行内前3项状态、可展开全量状态。
- 封装局部乐观更新与校准对账逻辑，校准不一致写入行级轻提示状态。

**Execution note:** 从 store 单测先定义状态转移，再回填实现。

**Patterns to follow:**
- `src/shared/stores/skillsStore.ts`
- `src/features/prompts/hooks/usePromptBrowse.ts`

**Test scenarios:**
- Happy path: 分发成功后当前行立即变更，随后校准保持一致。
- Edge case: 切换展开行时旧行自动收起，仅保留一个 `expandedRowId`。
- Error path: 校准失败时不覆盖现有展示并保留轻提示可见。
- Integration: 目标矩阵过滤与列表摘要同步更新。

**Verification:**
- store 选择器输出可直接驱动运营 UI，无需组件层重复计算。

- [ ] **Unit 2: Workbench 编排下沉到 Skills 模块控制器**

**Goal:** 将运营/配置分舱编排从 `WorkbenchApp` 下沉到 `useSkillsModuleController`，降低壳层复杂度与回归半径。

**Requirements:** R1-R4.1

**Dependencies:** Unit 1

**Files:**
- Modify: `src/features/skills/module/useSkillsModuleController.ts`
- Modify: `src/features/skills/module/SkillsModule.tsx`
- Modify: `src/app/WorkbenchApp.tsx`
- Create: `src/app/WorkbenchApp.skills-operations.test.tsx`

**Approach:**
- 控制器统一提供运营/配置模式切换、入口提示与行为回调。
- `WorkbenchApp` 保留模块挂载与最少必要 props，移除 Skills 细颗粒交互拼装。
- 复用 Prompts 模块化的“壳层薄、领域厚”组织方式。

**Patterns to follow:**
- `src/features/prompts/module/usePromptsModuleController.ts`
- `docs/solutions/best-practices/workbenchapp-modularization-best-practice-2026-04-14.md`

**Test scenarios:**
- Happy path: 默认进入运营模式；存在待收编项时展示“前往配置处理”入口。
- Edge case: 模式切换后保留当前筛选与分页上下文。
- Error path: 控制器异常不影响模块渲染基础能力（降级显示）。
- Integration: Workbench 其他模块（Prompts/Agents/Settings）行为不受 Skills 下沉影响。

**Verification:**
- `WorkbenchApp` 中 Skills 相关控制逻辑显著减少，模块职责清晰。

- [ ] **Unit 3: 运营模式 UI（矩阵总览 + 列表摘要 + 行内展开）**

**Goal:** 落地默认高频运营界面，支持矩阵过滤、列表摘要展示、单行展开双列布局和“前3项+查看更多”。

**Requirements:** R2, R2.0-R2.6, R15.1-R15.3, R15.8

**Dependencies:** Unit 1, Unit 2

**Files:**
- Modify: `src/features/skills/components/SkillsCenter.tsx`
- Create: `src/features/skills/components/SkillsOperationsPanel.tsx`
- Create: `src/features/skills/components/__tests__/SkillsOperationsPanel.test.tsx`

**Approach:**
- 将 `SkillsCenter` 拆为运营面板与配置面板插槽，运营面板渲染上矩阵下列表。
- 列表行主操作固定为 `分发 + 详情`。
- 行内展开采用双列（左状态、右动作），并发单展开策略在组件层与 store 双重约束。

**Patterns to follow:**
- `src/features/prompts/components/PromptCenter.tsx`
- `src/features/skills/components/SkillsCenter.tsx`

**Test scenarios:**
- Happy path: 点击矩阵卡片仅过滤列表，不打开额外面板。
- Edge case: 目标目录 >3 时默认仅显示前3项，点击“查看更多”展开全部。
- Edge case: 展开区目录搜索命中/未命中时均有稳定反馈（包含空结果态）。
- Error path: 目标目录为空时显示可理解空态与引导文案。
- Integration: 列表摘要与矩阵过滤条件保持一致；从详情返回后分组展开、筛选条件、滚动位置恢复。

**Verification:**
- 运营面板成为 Skills 默认主视图，且低频配置能力不干扰主路径。

- [ ] **Unit 4: 分发弹窗两步流与结果回流**

**Goal:** 实现“选择目标 -> 预览确认”两步式分发流程，以及未选目录校验、默认预选策略、部分失败重试主路径。

**Requirements:** R10-R10.6, R12-R14.1, R13.1, R16

**Dependencies:** Unit 1, Unit 3

**Files:**
- Create: `src/features/skills/components/SkillDistributionDialog.tsx`
- Modify: `src/features/skills/components/SkillsOperationsPanel.tsx`
- Modify: `src/shared/stores/skillsStore.ts`
- Create: `src/features/skills/components/__tests__/SkillDistributionDialog.test.tsx`

**Approach:**
- Step 1: 目录勾选（优先预选历史成功目录，无历史默认不选）。
- Step 2: 预览分类（7 类冲突）并按严格口径标识可重试（仅 `名称冲突/源异常`）。
- 无目录勾选时禁用确认按钮并就地提示。
- 预览交互支持逐项决策、批量跳过、回规则配置并保留当前上下文。
- 部分失败结果页主 CTA 固定“仅重试失败项”。

**Execution note:** 优先补两步流集成测试再接入 UI 细节，避免回归单页分发逻辑。

**Patterns to follow:**
- `src/shared/services/api.ts` 中 `skills_distribute` 与 `skills_manager_*`
- `.docs/02-v1-测试矩阵.md` 的 `partial_failed` 口径

**Test scenarios:**
- Happy path: 有历史目录时自动预选并可一键执行成功。
- Edge case: 无历史目录默认不选，确认按钮禁用且提示出现。
- Edge case: 预览中“逐项决策/批量跳过/回规则再返回”上下文保持不丢失。
- Error path: 执行返回 `partial_failed` 时仅失败项进入重试集。
- Integration: 7 类冲突分类与可重试判定映射正确；执行后当前行乐观更新，后台校准后聚合摘要正确回流。

**Verification:**
- 分发交互从“单次提交”变为“可预期、可解释、可重试”的两步闭环。

- [ ] **Unit 5: 状态检查浮层与胶囊交互**

**Goal:** 为目标目录胶囊提供覆盖式状态检查浮层，默认精简三行信息与“主按钮 + 更多操作”。

**Requirements:** R15.4-R15.7, R17

**Dependencies:** Unit 3

**Files:**
- Create: `src/features/skills/components/SkillStatusPopover.tsx`
- Modify: `src/features/skills/components/SkillsOperationsPanel.tsx`
- Create: `src/features/skills/components/__tests__/SkillStatusPopover.test.tsx`

**Approach:**
- 点击胶囊打开浮层：状态结论、原因、建议动作。
- `规则阻断` 胶囊默认进入阻断原因明细，不直接跳配置页。
- 主按钮按状态映射推荐动作（如重试/修复链接/前往配置）。

**Patterns to follow:**
- `src/features/common/components/*` 已有浮层与交互样式
- `src/features/skills/components/SkillManagerPanel.tsx` 状态语义映射

**Test scenarios:**
- Happy path: 点击胶囊打开对应目标目录的精简明细。
- Edge case: 同行切换不同目录胶囊时浮层内容正确切换。
- Error path: 明细数据缺失时展示可恢复占位文案而非空白。
- Integration: 浮层主按钮触发动作后状态变更回流到行摘要。

**Verification:**
- 用户可在不离开列表上下文的情况下完成“检查->动作”闭环。

- [ ] **Unit 6: 配置模式整合与收编冲突 diff 能力**

**Goal:** 低频配置模式承载规则与冲突治理，并补齐“同一 skill 全文件 diff + 进度 + 可中断”能力。

**Requirements:** R3, R7.1-R7.3

**Dependencies:** Unit 2

**Files:**
- Create: `src/features/skills/components/SkillsConfigPanel.tsx`
- Modify: `src/features/skills/components/SkillManagerPanel.tsx`
- Modify: `src/features/skills/components/SkillsCenter.tsx`
- Modify: `src-tauri/src/control_plane/skills_manager.rs`
- Create: `src-tauri/src/control_plane/tests/skills_manager_diff_tests.rs`
- Create: `src/features/skills/components/__tests__/SkillsConfigPanel.test.tsx`
- Test: `src-tauri/src/control_plane/tests/skills_manager_diff_tests.rs`

**Approach:**
- 配置模式复用现有 manager 能力，统一放入低频入口。
- 在 `skills_manager` 增加冲突 diff 命令（启动、进度、取消、结果），前端用弹窗承载。
- 中断后状态标记为“待人工决策”，不触发自动覆盖。

**Execution note:** 先做后端 characterization（现有冲突处理语义）再扩展 diff/cancel，避免破坏既有规则行为。

**Patterns to follow:**
- `src-tauri/src/control_plane/skills_manager.rs`
- `.docs/2026-04-14-001-feat-skills-manager-borrowing-plan.md`

**Test scenarios:**
- Happy path: 同一 skill 判定完成并返回可覆盖结论。
- Edge case: 目录文件数量大时进度持续更新且前端可轮询展示。
- Error path: 用户取消后返回中断态，且不会触发覆盖动作。
- Integration: 冲突处理结果可回流到运营模式摘要与状态矩阵。

**Verification:**
- 收编冲突决策可视可控，且低频配置不会干扰高频运营主界面。
- 在 1k 文件样本下可持续刷新进度，取消操作在可接受延迟内生效（阈值在实施中落盘）。

- [ ] **Unit 7: 扫描/收编配置流程与关键状态完备化**

**Goal:** 完成配置模式中的扫描/收编主流程交付，覆盖项目分组、待收编计数、关键异常态与大规模可用性保护。

**Requirements:** R5-R6, R8-R9

**Dependencies:** Unit 2, Unit 6

**Files:**
- Modify: `src/features/skills/components/SkillsConfigPanel.tsx`
- Modify: `src/features/skills/components/SkillManagerPanel.tsx`
- Modify: `src/shared/stores/skillsStore.ts`
- Create: `src/features/skills/components/__tests__/SkillsConfigScanFlow.test.tsx`

**Approach:**
- 在配置模式中提供按项目分组的扫描结果视图与待收编计数。
- 补齐空结果、加载中、失败、部分成功、无权限目录五类状态与对应动作。
- 加入大规模场景保护（默认折叠、分组懒加载、分页/虚拟滚动开关策略）。

**Patterns to follow:**
- `src/app/workbench/hooks/useSkillScanDirectories.ts`
- `src/features/skills/components/SkillsCenter.tsx`

**Test scenarios:**
- Happy path: 扫描后按项目分组展示并显示待收编数量。
- Edge case: 大量结果下默认折叠生效，展开后按需加载不卡顿。
- Error path: 无权限目录和部分成功场景可见可重试。
- Integration: 收编动作完成后状态从配置模式正确回流到运营模式摘要。

**Verification:**
- 扫描/收编流程达到 requirements 约定的关键状态覆盖，且不影响运营模式主路径。

## System-Wide Impact

- **Interaction graph:** `WorkbenchApp -> SkillsModuleController -> SkillsOperations/Config Panels -> skillsStore -> skillsApi/skillsManagerApi -> Tauri commands`
- **Error propagation:** 分发预览和执行错误统一回流到行级/弹窗级错误提示，避免全局噪音。
- **State lifecycle risks:** 乐观更新与校准对账可能产生瞬时不一致，需通过行内轻提示收敛。
- **API surface parity:** `skills_*` 旧链路保持不变，新增行为优先复用/扩展 `skills_manager_*`。
- **Integration coverage:** 必须覆盖“部分失败重试”“规则阻断检查”“diff取消回流”“详情返回列表上下文恢复”四类跨层场景。
- **Unchanged invariants:** `settings` 中扫描目录管理和现有 skills 浏览/文件预览能力保持可用。

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| 运营/配置分舱后状态来源分裂 | 将状态派生集中到 `skillsStore` 选择器，组件只消费只读视图模型 |
| 不改 `skills_*` 契约导致前端派生过重 | 通过 `skills_manager_*` 承载新语义，保持旧接口只读展示职责 |
| Workbench 回归半径扩大 | 先完成控制器下沉（Unit 2）再做 UI 大改，降低壳层冲击 |
| diff 全量比较耗时 | 增加进度与取消机制，二进制/超大文件采用可配置跳过策略 |
| 多目录状态渲染性能问题 | 单展开策略 + 前3项默认展示 + 延迟加载明细 |

## Documentation / Operational Notes

- 更新 `.docs/2026-04-14-001-feat-skills-manager-borrowing-plan.md` 与本计划保持一致（状态语义与交互约束）。
- 在 `docs/solutions/` 补充“Skills 运营/配置分舱”复盘条目（落地后）。
- 对新增分发交互补充 QA 场景脚本：无历史首分发、部分失败重试、阻断明细检查、diff中断。

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-14-skills-supply-chain-shell-requirements.md](docs/brainstorms/2026-04-14-skills-supply-chain-shell-requirements.md)
- 方案输入：`.docs/2026-04-14-001-feat-skills-manager-borrowing-plan.md`
- 模块化实践：`docs/solutions/best-practices/workbenchapp-modularization-best-practice-2026-04-14.md`
- 测试矩阵：`.docs/02-v1-测试矩阵.md`
- 关键代码：`src/app/WorkbenchApp.tsx`, `src/features/skills/components/SkillsCenter.tsx`, `src/features/skills/components/SkillManagerPanel.tsx`, `src/shared/stores/skillsStore.ts`, `src-tauri/src/control_plane/skills_manager.rs`
