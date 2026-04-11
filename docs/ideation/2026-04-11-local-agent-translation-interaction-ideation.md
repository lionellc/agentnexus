---
date: 2026-04-11
topic: local-agent-translation-interaction
focus: "本地 Agent 接入后，优化 Prompts 翻译场景交互（用户友好 + 设计感）"
---

# Ideation: 本地 Agent 翻译交互体验重构

## Codebase Context
- 前端是 React + Tauri 单仓，主交互集中在 [src/app/WorkbenchApp.tsx](/Users/liuc/liuc/work/Code/ai/ai-explore/AgentNexus/src/app/WorkbenchApp.tsx)。
- 已有“模型工作台测试”和“Prompt 详情翻译”两条入口，但状态与反馈分散：翻译动作、结果展示、运行日志分布在不同区域，心智切换成本高。
- 公共组件 [TranslatableTextViewer.tsx](/Users/liuc/liuc/work/Code/ai/ai-explore/AgentNexus/src/features/common/components/TranslatableTextViewer.tsx) 已抽出，但目前承担了过多操作（视图切换 + 翻译 + 输出查看），信息层级偏平。
- 设置页 [ModelWorkbenchPanel.tsx](/Users/liuc/liuc/work/Code/ai/ai-explore/AgentNexus/src/features/settings/components/ModelWorkbenchPanel.tsx) 偏“配置中心”，Prompts 详情偏“生产操作”，两者视觉与流程语义尚未统一。
- 运行输出已支持流式与滚动，但“业务结果”和“技术日志”仍混合呈现，普通用户不易快速判断成功与否。
- 仓库暂无 `docs/solutions/` 历史方案可复用；已有需求与计划文档聚焦“能力闭环已实现”，下一步更适合做“交互语义重构”。

## Ranked Ideas

### 1. 单一交互骨架：`Scenario Action Bar`（场景动作条）
**Description:** 在 Prompts 详情顶部固定一条“翻译动作条”，仅保留核心动作：`目标语言`、`翻译`、`查看日志`、`应用译文`。其它高级能力收进二级面板。  
**Rationale:** 先把“用户下一步应该点什么”做成单路径，减少按钮噪音和模块跳转。  
**Downsides:** 需要重排现有组件职责，短期会有较多 UI 改动。  
**Confidence:** 93%  
**Complexity:** Medium  
**Status:** Explored

### 2. 结果优先：`Result First, Logs Second` 双层反馈
**Description:** 翻译完成后默认展示“结果卡”（成功/失败、译文摘要、可执行下一步）；`stdout/stderr` 默认折叠在“技术日志”抽屉。  
**Rationale:** 对用户先回答“结果是否可用”，对开发者仍保留可深挖日志。  
**Downsides:** 需要重构当前输出 Sheet 的信息架构与状态映射。  
**Confidence:** 91%  
**Complexity:** Medium  
**Status:** Explored

### 3. 首次使用向导：本地 Agent 预检（Preflight）
**Description:** 首次进入翻译功能时弹轻量向导：`命令可执行`、`会话可用`、`仓库信任`、`JSON 协议测试`，并给一键修复建议。  
**Rationale:** 你当前遇到的“trusted directory / JSON 非法”等问题，本质是环境门槛未显式化。  
**Downsides:** 需要新增一次性引导状态与检测命令编排。  
**Confidence:** 89%  
**Complexity:** Medium  
**Status:** Unexplored

### 4. Prompt 翻译工作区：左右对照 + 行级定位
**Description:** 在 Prompts 详情提供“原文/译文并排工作区”，支持同步滚动、段落锚点、高亮差异，并保留 Markdown 预览。  
**Rationale:** 设计感来自“可读性与对照效率”，而不是增加更多卡片。  
**Downsides:** 需要处理长文性能与移动端降级方案。  
**Confidence:** 86%  
**Complexity:** High  
**Status:** Unexplored

### 5. 交互状态机可视化：`Idle -> Running -> Reviewing -> Applied`
**Description:** 把翻译流程抽成明确阶段，并在 UI 上显示当前阶段（含耗时、可操作按钮、阻塞原因）。  
**Rationale:** 当前“卡住一会儿再出结果”的主观感受，核心是状态不可见。  
**Downsides:** 需要梳理前后端状态字段和错误码映射一致性。  
**Confidence:** 84%  
**Complexity:** Medium  
**Status:** Explored

### 6. 模板中心升级：从“文本框”到“模板配置器”
**Description:** 翻译模板编辑改为结构化配置器（系统指令、变量片段、输出 schema 片段、预览），并提供 `codex/claude` 预设模板。  
**Rationale:** 降低用户写错模板概率，提升可维护性和产品质感。  
**Downsides:** 需要设计模板 DSL 或最小 schema，并考虑兼容旧模板文本。  
**Confidence:** 82%  
**Complexity:** High  
**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | 在详情页增加更多快捷按钮（收藏、重翻译、导出） | 信息负担更重，和“用户友好”目标冲突。 |
| 2 | 默认自动翻译每次保存 | 违背当前手动触发边界，且会放大调用成本。 |
| 3 | 保留所有历史译文卡片常驻页面 | 对长 Prompt 场景会明显挤压主编辑区。 |
| 4 | 将日志默认全展开并实时跳动 | 技术信息噪声太高，不适合普通用户。 |
| 5 | 引入复杂动画驱动“AI感” | 视觉收益低于实现成本，且可能干扰编辑任务。 |
| 6 | 多窗口拆分设置页与翻译页 | 路径更绕，破坏“单页闭环”。 |
| 7 | 在列表页直接批量翻译所有 Prompt | 价值不明确，失败恢复复杂，先不做。 |
| 8 | 支持任意自定义渲染主题切换 | 与当前核心痛点（流程怪异）关联弱。 |
| 9 | 增加“智能推荐目标语言” | 新奇但不解决主痛点，属于锦上添花。 |
| 10 | 在输出面板内直接编辑模板 | 语义混乱，运行态与配置态应分离。 |
| 11 | 继续保留旧侧栏 + 新工作区并存 | 重复交互路径，会造成更强混乱。 |
| 12 | 完全隐藏 stderr 仅显示结果 | 调试能力不足，排障场景不可接受。 |
| 13 | 一次性接入“总结/润色/改写”多场景 | 过早扩 scope，翻译体验本身还未打磨稳。 |
| 14 | 强制统一覆盖翻译，不保留变体 | 丢失已有资产管理优势。 |
| 15 | 把所有操作挪到 Settings 完成 | 破坏 Prompt 详情内就地操作体验。 |
| 16 | 新增外部云模型兜底开关 | 偏离“本地 Agent 差异化”主线。 |
| 17 | 全局 Command Palette 承载全部翻译操作 | 对新用户学习门槛更高。 |
| 18 | 用弹窗承载完整翻译工作流 | 对长文本不友好，易出现高度/滚动问题。 |

## Session Log
- 2026-04-11: Initial ideation — 24 candidates generated, 6 survivors kept
- 2026-04-11: Selected direction for brainstorming — #1 Scenario Action Bar + #2 Result First + #5 状态机可视化
