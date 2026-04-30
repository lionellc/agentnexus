---
date: 2026-04-29
topic: model-usage-cost-dashboard-ux
---

# Ideation: 模型使用与成本看板 UX 优化

## Codebase Context

- AgentNexus 是 React + Vite + TypeScript + Tauri/Rust 的本地优先 Agent control plane。
- 模型看板已作为独立左侧模块接入，当前入口在 `src/features/shell/Sidebar.tsx`，页面主体在 `src/features/usage/components/UsageDashboard.tsx`。
- 当前实现已覆盖需求中的主要功能：筛选、同步、KPI、来源覆盖、ECharts 图表、定价覆盖、请求明细。
- 当前 UX 问题不是“功能缺失”，而是信息架构偏工程清单：过滤器、同步按钮、状态条、KPI、来源、图表、定价表、明细表顺序平铺，用户很难先回答“现在花了多少钱、异常在哪里、数据可信不可信、下一步点什么”。
- 既有约束必须保留：Apache ECharts、双来源融合、真实数据口径、不估算缺失 model/token、USD/CNY、汇率过期标记、文件行数治理。

## Ranked Ideas

### 1. 首屏重排为“判断区”：成本健康摘要 + 数据可信度 + 主操作

**Description:** 把页面首屏从 `SectionTitle + 过滤器按钮组` 改为一个 dashboard header：左侧显示当前范围、总成本、请求数、失败/未知状态、数据不完整数；右侧只保留主动作“同步调用”和“刷新”。来源覆盖、汇率过期、定价来源用紧凑状态 chips 显示在同一区域。


**Downsides:** 需要调整 `UsageDashboard.tsx` 与 `UsageFiltersBar.tsx` 的职责边界，首屏文案和响应式布局需要补测试。

**Confidence:** 92%

**Complexity:** Medium

**Status:** Explored via `docs/brainstorms/2026-04-29-model-usage-cost-dashboard-ux-requirements.md`

### 2. 把筛选从“表单网格”改为“任务导向筛选带”

**Description:** 保留 7/30/90 天、币种、Agent、模型、状态筛选，但重排为两层：第一层是时间范围和币种，第二层是“定位异常”筛选区，包含 Agent/模型/状态。状态筛选提供更贴近任务的标签，例如“全部 / 失败 / 未知 / 成功”，选中后同时影响 KPI、图表、明细。


**Downsides:** 若未来增加自定义时间范围，筛选带空间会变紧；需要避免把筛选状态拆散到多个组件后产生口径漂移。

**Confidence:** 88%

**Complexity:** Low

**Status:** Explored via `docs/brainstorms/2026-04-29-model-usage-cost-dashboard-ux-requirements.md`

### 3. KPI 卡片改成“可解释指标”，突出异常和不可计费数据

**Description:** 将 `UsageKpiCards` 从 5 张同权重卡片改成 4 个主指标加 1 个解释条：总成本、请求数、Token、成功率/失败率为主指标；不完整记录、汇率过期、USD/CNY 换算、可计费请求作为每张卡的副信息或独立 warning strip。

**Downsides:** 需要确认后端是否已有成功率/失败率汇总字段；若没有，前端可先从 status 分布派生，但必须避免重复口径。

**Confidence:** 86%

**Complexity:** Low

**Status:** Explored via `docs/brainstorms/2026-04-29-model-usage-cost-dashboard-ux-requirements.md`

### 4. 图表区从“四宫格”改成“成本趋势主图 + 辅助洞察”

**Description:** 把成本趋势作为一张横跨全宽的主图，Token 趋势、模型成本分布、状态分布作为下方辅助卡。图表标题增加一句可扫描结论，例如“最近 30 天成本峰值出现在 x 日”或“Top 模型占比 x%”。没有数据时给具体下一步，而不是只说暂无数据。

**Downsides:** 自动生成结论需要从已有 dashboard 数据派生，不能引入复杂分析逻辑；首版只做简单 max/top/share 文案即可。

**Confidence:** 84%

**Complexity:** Medium

**Status:** Deferred

### 5. 明细表升级为“排障工作台”，定价配置默认折叠

**Downsides:** 如果一期尚无模型排行独立接口，模型排行可先复用 `modelCostDistribution`，不要为 tab 新增后端接口。

**Confidence:** 90%

**Complexity:** Medium

**Status:** Explored via `docs/brainstorms/2026-04-29-model-usage-cost-dashboard-ux-requirements.md`

### 6. 同步状态从技术状态条改成“可关闭的进度反馈”

**Description:** 当前同步状态显示 `status · processedFiles/totalFiles`。建议改成紧凑 progress callout：显示“正在扫描 session/埋点来源”、“已处理 x/y”、“失败原因可复制”，完成后给“本次新增/更新记录”摘要，并允许用户关闭完成态。

**Rationale:** 记忆中同仓曾出现状态条不可关闭导致 UI 残留的问题，已有解决经验是补显式 dismiss action。模型看板同步是用户主动触发的长任务，状态反馈应告诉用户是否还要等、是否失败、下一步怎么处理，而不是只暴露内部字段。

**Downsides:** 若后端 sync job 暂未返回新增/更新计数，首版只能展示进度和完成态，后续再补摘要。

**Confidence:** 82%

**Complexity:** Low

**Status:** Explored via `docs/brainstorms/2026-04-29-model-usage-cost-dashboard-ux-requirements.md`

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | 新增预算告警、阈值通知、自动优化建议 | 已超出现有一期 scope，且会扩大后端与通知链路。 |
| 2 | 做完整自定义时间范围选择器 | 当前需求只要求 7/30/90 天，先优化信息架构更有价值。 |
| 3 | 把看板拆成多个独立路由 | 当前产品是本地桌面工作台，模块内分区即可，不需要路由复杂化。 |
| 4 | 新增全局搜索跨日志检索 | 有价值但不属于“界面用户友好”的第一优先级。 |
| 5 | 将定价面板做成独立设置页 | 会增加入口跳转成本；当前更适合默认折叠在看板内。 |
| 6 | 新增模型成本预测 | 与“不做估算，只统计真实数据”的口径冲突。 |
| 7 | 重做后端聚合接口以支持所有 UI 洞察 | 成本过高；首版应优先从现有 dashboard payload 派生轻量结论。 |
| 8 | 统一替换全站视觉风格 | 当前任务是 usage 页面优化，不应顺手改全站设计系统。 |

## Recommended Handoff

建议选择 Idea 1 + 2 + 3 + 5 + 6 作为首轮实现包：

- 覆盖“首屏判断、筛选、指标解释、明细排障、同步反馈”五个用户痛点。
- 不需要新增后端能力，主要改 `src/features/usage/components/*`。
- 定价折叠与图表主次可以作为第二轮，避免首轮一次性改动过大。

## Session Log

- 2026-04-29: Brainstorm handoff - ideas 1, 2, 3, 5, and 6 captured in `docs/brainstorms/2026-04-29-model-usage-cost-dashboard-ux-requirements.md`; idea 4 deferred to a later chart-focused pass.
