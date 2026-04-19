---
date: 2026-04-18
topic: skills-usage-count
focus: skills 页面统计 skill 被 agent 使用次数（评估 session 解析与更优方案）
---

# Ideation: Skills 使用次数统计

## Codebase Context
- 仓库已存在埋点存储层：`usage_events` 表（`src-tauri/src/db.rs`）可存 `asset_type/asset_id/event_type/success/context/ts`。
- 仓库已存在埋点写入命令：`metrics_ingest_usage_event`（`src-tauri/src/control_plane/commands.rs`）会写入 `usage_events`，且 `asset_type == skill` 时会更新 `skills_assets.last_used_at`。
- 仓库已存在查询命令：`metrics_query_overview` / `metrics_query_by_asset`，但当前按资产聚合，不区分 skill 调用事件类别。
- 前端已暴露服务接口但未形成产品闭环：`settingsService` 有 ingest/query 方法，Skills 页面与 store 还未消费这些 metrics。
- Skills 页面当前数据主轴是“分发治理状态”（`SkillsManagerOperationsRow`），不包含 usage 次数字段。
- 审计事件链路完善（`audit_events` + skills manager 多事件），可作为短期代理指标，但与“真实调用次数”语义不同。

## Ranked Ideas

### 1. 双轨统计：显式埋点为主，Session 解析为补
**Description:** 把“真实调用次数”定义为 `usage_events` 中的 `asset_type=skill` + `event_type=invoke_*`；同时保留 Session 解析管道作为补全/回填来源，并打上 `source=observed|inferred`。
**Rationale:** 兼顾准确性与现实可落地性，既吸收你的 session 思路，也避免“全靠日志猜测”。
**Downsides:** 需要定义冲突去重策略（同一次调用被双来源看到）。
**Confidence:** 95%
**Complexity:** Medium
**Status:** Unexplored

### 2. Skill 调用事件规范（事件字典 + 上下文字段）
**Description:** 固化事件模型：`invoke_start/invoke_success/invoke_fail`，`context` 至少包含 `agentType/sessionId/requestId/workspaceId/tool`，并统一 `asset_id` 映射规则（id/identity/name）。
**Rationale:** 没有统一事件语义，后续统计会持续失真；这是所有方案的地基。
**Downsides:** 需要一次性梳理各 agent 适配层的可提供字段。
**Confidence:** 93%
**Complexity:** Medium
**Status:** Unexplored

### 3. Session 解析器插件化（Codex/Claude/Cursor 分适配器）
**Description:** 不做“万能 parser”，改为 `parser_codex / parser_claude / parser_cursor`，每个适配器维护独立解析规则与置信度，输出统一 usage event。
**Rationale:** 各 agent 会话格式演进快且不一致，插件化比单体解析器更可维护。
**Downsides:** 首版需要先做 1-2 个高价值 agent 的最小覆盖，不能一次全覆盖。
**Confidence:** 89%
**Complexity:** Medium-High
**Status:** Unexplored

### 4. 增量回填管道：checkpoint + 幂等写入
**Description:** 新增“回填最近 N 天”与“持续增量同步”两种任务；按文件偏移/最后事件时间做 checkpoint，写入前按 `sessionId + callId + skillIdentity` 幂等去重。
**Rationale:** 让 session 解析从一次性脚本变成可运行能力，避免重复计数。
**Downsides:** 需要任务状态与失败重试可视化，否则排障困难。
**Confidence:** 88%
**Complexity:** High
**Status:** Unexplored

### 5. Skills 页面新增“调用次数/近7天趋势/最近调用”
**Description:** 在 Skills 列表与运营页加入 `Total Calls`、`7d`、`Last Called At`，支持按 agent 过滤（Codex/Claude/Cursor）和按来源过滤（Observed/Inferred）。
**Rationale:** 直接回答“哪个 skill 真在被用”，并支持运营决策（下架、优化、重点维护）。
**Downsides:** 需要补充新的 query API（按 skill + 按 agent + 按时间窗聚合）。
**Confidence:** 91%
**Complexity:** Medium
**Status:** Unexplored

### 6. 过渡口径：先上“管理动作次数”与“调用次数”双指标
**Description:** 在调用统计尚未完全接入前，先用 `audit_events` 给出 `linked/unlinked/distributed` 次数，并明确标识为“运营动作，不等于调用”。
**Rationale:** 快速产出可见价值，避免等待完整埋点落地后才有任何指标。
**Downsides:** 容易被误读，需要 UI 强提示两类指标语义差异。
**Confidence:** 85%
**Complexity:** Low-Medium
**Status:** Unexplored

### 7. 质量维度扩展：调用成功率 + 冷热点识别
**Description:** 基于 `success` 字段输出 skill 成功率，并识别“已分发但 30 天零调用”的冷技能、以及“高频失败”的高风险技能。
**Rationale:** 只看次数不够，质量和运营价值需要一起看。
**Downsides:** 需要事件上报方稳定填写 success 与错误上下文。
**Confidence:** 83%
**Complexity:** Medium
**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | 只靠 `last_used_at` 推导调用次数 | 现有 `last_used_at` 会被分发动作更新，语义不纯 |
| 2 | 全量解析所有隐藏目录日志 | 成本高、噪声大、隐私风险高，且价值不成比例 |
| 3 | 仅统计分发/链接次数当作调用次数 | 与“被 agent 实际调用”目标不一致 |
| 4 | OS 文件读事件监控（FSEvents/inotify） | 会把编辑器/索引器读取误判为调用，准确率过低 |
| 5 | 强制所有 skill 走 AgentNexus wrapper 才能调用 | 侵入性过强，破坏现有用户工作流 |
| 6 | 先做云端集中 telemetry 再做本地统计 | 超出当前本地优先边界，投入过大 |

## Session Log
- 2026-04-18: Initial ideation - 23 generated, 7 survived
