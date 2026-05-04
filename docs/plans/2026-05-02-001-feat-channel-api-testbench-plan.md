---
title: feat: 新增渠道 API 测试台
type: feat
status: active
date: 2026-05-04
origin: docs/brainstorms/2026-05-02-channel-api-testbench-requirements.md
---

# feat: 新增渠道 API 测试台

## Overview

本计划维护并扩展左侧独立模块“渠道 API 测试台”，用于手动测试 OpenAI-compatible、Anthropic-compatible 与 AWS Bedrock Converse Stream 渠道。用户输入本次测试的协议参数和内置题型后，系统发起真实 API 请求，记录首字/首响应时间、总耗时、输入/输出规模、响应体检查结果，并用 Semi UI 表格、展开行和分页展示历史记录。

原始 Unit 1-7 已建立 OpenAI-compatible 与 Anthropic-compatible 的测试台基础。本轮扩展重点是把 Bedrock 作为第三协议接入同一个测试台，而不是新建页面或把 Bedrock 伪装成 Anthropic-compatible：

- 前端保留 `channel-test` feature module，扩展协议选择、Bedrock 参数区、结果标签和展开详情。
- Tauri/Rust 继续使用 `channel_test` control-plane 模块，新增 Bedrock runner、AWS event-stream 解析、Bedrock 指标归一和失败语义检查。
- 测试记录使用独立表，不混入现有 `model_call_facts`，避免污染模型使用与成本看板口径。
- API Key/Bearer Token 只用于本次请求，不写入历史记录；表格和详情只展示脱敏后的请求摘要。

## Problem Frame

AgentNexus 当前已有“模型使用与成本看板”，但它分析的是历史调用事实；用户现在需要的是主动测试某个渠道是否可用、是否首字慢、是否输出异常、响应体是否符合协议预期（see origin: `docs/brainstorms/2026-05-02-channel-api-testbench-requirements.md`）。

Bedrock Converse Stream 不能被当成 Anthropic-compatible 的一个 Base URL：它使用 region/model endpoint、Bearer Token 和 AWS event-stream 响应帧，并在 metadata 中返回 usage 和 latency。这个能力不应被做成完整渠道管理平台或 AWS 凭证管理器；本轮只解决“在既有测试台中手动输入 Bedrock 参数，运行内置题库，得到可排障的 Bedrock 流式结果”这个闭环。

## Assumptions

- “渠道”在本计划中指模型 API 渠道，不指现有分发目标或 Agent 规则目标。
- API Key/Bearer Token 当前不持久化，也不写入测试记录；用户每次测试在表单输入，后续如需保存渠道配置应单独规划。
- OpenAI-compatible 以 Chat Completions 协议为目标，默认拼接到 `/v1/chat/completions`；不引入 Responses API、Assistants、Realtime 或批处理。
- Anthropic-compatible 以 Messages API 为目标，默认拼接到 `/v1/messages`；不扩展 Vertex 或厂商私有差异。
- Bedrock Converse Stream 以短期 Bearer Token 快测为目标，用户手动输入 region、model id、max tokens 和 timeout；不做 AWS profile、Access Key/Secret Key、STS、IAM role assume、模型列表自动发现或 region 可用性自动发现。
- “首字”对流式请求表示首个可见文本 delta 的时间；非流式请求明确显示为“首响应”，不伪装成真实 token 首字。
- Bedrock 固定按流式测试处理；主表首字为首个非空文本 delta，展开详情额外展示实际请求体、响应过程/SSE 事件、实际响应体、首个 event、Bedrock latency metadata、usage、stop reason 和 event timeline。
- 分页按页码/页大小查询，适配 Semi Table 受控分页；本地 SQLite 历史表当前范围不做清理策略。

## Requirements Trace

- R1-R3: 新增左侧独立模块，并在该模块内引入 Semi UI 作为主要组件来源。
- R4-R7: 支持 OpenAI-compatible、Anthropic-compatible 与 Bedrock Converse Stream 协议选择，按协议展示必要参数，并默认脱敏敏感字段。
- R8-R11: 内置题库固定为小请求、中等请求、大请求、连续追问型，用户手动选择本次题型。
- R12-R17: 用表格展示时间、模型、用时/首字、输入、输出；支持展开详情、分页、历史保留和非流式首响应降级说明。
- R18-R20: 响应体分析只做确定性检查，不做 AI 自动评分。
- R21-R23: 测试记录关闭应用后仍可查看，按时间倒序分页；不做趋势图、告警、导出或审计。
- R24-R27: Bedrock 展开详情展示实际请求体、响应过程/SSE 事件、实际响应体、首 event、首文本 delta、Bedrock latency、usage/stop reason、event timeline；失败语义覆盖鉴权、region/model、HTTP、超时、event-stream 解析和 stream exception。

## Scope Boundaries

- 不做完整渠道配置管理，不保存全局渠道。
- 不做定时巡检、告警、自动重试、趋势图、批量导出、审计日志。
- 不做 Gemini、Azure OpenAI 专有字段、Vertex、WebSocket、Realtime 等额外协议适配。
- 不把 Bedrock 伪装为 Anthropic-compatible；Bedrock 必须作为独立协议展示和解释。
- 不做 AWS profile、Access Key/Secret Key、STS、IAM role assume、模型列表自动发现或 region 可用性自动发现。
- 不新增 Bedrock 专属页面；Bedrock 结果复用现有表格、展开详情、检查项和历史记录形态。
- 不做可编辑题库、题库市场或复杂评分算法。
- 不估算 token 或成本；只有渠道真实返回 usage 时才展示 usage，否则展示字符数并标明来源。
- 不把主动测试记录写入 `model_call_facts` 或现有模型使用与成本看板。

## Context & Research

### Relevant Code and Patterns

- 左侧模块类型在 `src/features/shell/types.ts`，当前 `MainModule` 包含 `prompts | skills | usage | agents | settings`。
- 左侧入口在 `src/features/shell/Sidebar.tsx`，已有 `usage` 独立模块接入模式。
- Workbench 中央区域在 `src/app/workbench/hooks/WorkbenchAppContent.tsx` 按 `activeModule` 分发模块，需要新增 `channel-test` 分支。
- 现有用量模块入口在 `src/app/workbench/hooks/useWorkbenchUsageController.tsx` 和 `src/features/usage/module/UsageModule.tsx`，可作为“壳层只接模块”的参考。
- 前端 Tauri 命令类型集中在 `src/shared/services/tauriClient.ts`，API façade 集中在 `src/shared/services/api/coreApi.ts` 与 `src/shared/services/api/index.ts`。
- 共享类型通过 `src/shared/types/index.ts` re-export，新增测试台类型应保持同样出口。
- Rust 命令注册集中在 `src-tauri/src/lib.rs` 的 `tauri::generate_handler!`，领域模块在 `src-tauri/src/control_plane/mod.rs` 导出。
- 数据库初始化在 `src-tauri/src/db.rs`，模型用量表迁移使用 `src-tauri/src/db/model_usage_migrations.rs` 的 `migration_meta` 一次性迁移模式。
- 现有 Rust control-plane 模块按 `api.rs / query.rs / persistence.rs / tests.rs` 拆分，`src-tauri/src/control_plane/model_usage/mod.rs` 是可复用结构参考。
- 当前 `src-tauri/Cargo.toml` 没有 HTTP client 依赖；实现真实 API 请求需要新增 Rust HTTP client 依赖。
- 当前 `package.json` 已使用 React 19，尚未引入 Semi UI。
- 当前实现已经存在 `src/features/channel-test`、`src/shared/types/channelApiTest.ts` 和 `src-tauri/src/control_plane/channel_test`，协议类型仍是 `openai | anthropic`，`validation.rs` 仍拒绝 Bedrock。Bedrock 扩展应在这些既有边界内增量修改。
- `src-tauri/src/control_plane/channel_test/openai.rs` 与 `anthropic.rs` 已经形成同步 HTTP runner、SSE/JSON 解析、`ProtocolResponse` 归一和脱敏错误记录的局部模式。
- `src-tauri/src/control_plane/channel_test/report.rs` 已经把 `firstSseEventMs`、`firstTextDeltaMs`、`completedMs` 写入 `conversationJson.metrics`，适合扩展 Bedrock 的 first event、latency metadata 和 event timeline。
- `src-tauri/src/control_plane/channel_test/attribution.rs` 已经把 Bedrock-like response shape 作为链路归因候选证据；本轮 Bedrock 原生协议应复用候选证据口径，但不能把归因判断当成测试成功条件。
- `src/features/channel-test/components/ChannelTestRunDetail.tsx` 已有耗时分解、链路归因、响应体、检查项和完整 JSON 展开区域；Bedrock 专属详情应进入这里，不新增页面。

### Institutional Learnings

- `docs/solutions/best-practices/workbenchapp-modularization-best-practice-2026-04-14.md`: Workbench 应保持壳层薄、模块厚，新增能力下沉到 feature module/controller，不把复杂逻辑回灌到 Workbench 壳层。
- `docs/solutions/best-practices/codebase-line-governance-best-practice-2026-04-19.md`: 前端按 controller hook / 展示组件分层，Rust control-plane 按 command API / domain logic / persistence helper 分层，并同步补对口测试。
- 既有 AgentNexus 模型使用看板上下文表明，主动测试数据与历史用量事实应保持分离，避免成本/用量口径被临时测试污染。

### External References

- OpenAI Chat Completions API 支持 `stream` 和 `stream_options.include_usage`；流式 Chat Completions 返回 data-only SSE chunks，文本增量在 `choices[0].delta` 中。参考：https://platform.openai.com/docs/api-reference/chat/create 与 https://platform.openai.com/docs/guides/streaming-responses?api-mode=chat
- Anthropic Messages API 示例使用 `x-api-key`、`anthropic-version`、`content-type`、`model`、`max_tokens` 和 `messages`；流式 Messages 使用 SSE，关键事件包括 `message_start`、`content_block_delta`、`message_delta`、`message_stop`，并要求对未知事件保持兼容。参考：https://docs.anthropic.com/en/api/messages-examples 与 https://docs.anthropic.com/en/docs/build-with-claude/streaming
- Semi Design 在 React 19 下使用 `@douyinfe/semi-ui-19`；Table 支持受控分页与 `expandedRowRender` 展开行。参考：https://semi.design/en-US/start/getting-started 与 https://semi.design/en-US/show/table
- Amazon Bedrock `ConverseStream` 使用 `POST /model/modelId/converse-stream`，请求体支持 `messages` 和 `inferenceConfig.maxTokens`，响应事件包含 `messageStart`、`contentBlockDelta`、`messageStop`、`metadata`、`modelStreamErrorException` 等。参考：https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ConverseStream.html
- Amazon Bedrock API key 可在直接 HTTP 请求中通过 `Authorization: Bearer $AWS_BEARER_TOKEN_BEDROCK` 传入，适合本轮短期 Bearer Token 快测边界。参考：https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys-use.html

## Key Technical Decisions

- **Semi UI 仅先用于测试台模块。** 本次不抽全局 shared UI 封装，避免为了一个模块重塑全站组件层。若后续多个模块复用 Semi，再单独抽 shared adapter。
- **API 请求放在 Tauri/Rust 侧执行。** 前端 WebView 直接请求第三方 API 容易遇到 CORS，也会扩大密钥暴露面；Rust 侧更适合统一脱敏、计时、错误归一和持久化。
- **API Key/Bearer Token 不持久化。** 测试记录只保存脱敏后的请求摘要、协议、模型、题型、耗时、规模、响应摘要、检查项和错误摘要。
- **新增独立 `channel_test` 数据域。** 不复用 `model_call_facts`，因为后者是历史调用事实和成本分析口径，主动测试记录语义不同。
- **协议适配最小化。** OpenAI-compatible 只覆盖 Chat Completions 的 messages 请求和 SSE delta；Anthropic-compatible 只覆盖 Messages 请求和 SSE content block delta。
- **Bedrock 作为第三协议。** Bedrock Converse Stream 的鉴权、endpoint、AWS event-stream 帧和 metadata 与 Anthropic-compatible 不同，必须使用独立 protocol 分支、标签和详情解释。
- **Bedrock 表单最小化。** 只新增 region、model id、Bearer Token、max tokens、timeout；不做 AWS profile、STS、模型发现、region 可用性检查。
- **Bedrock 入参使用最小扩展。** `model` 继续表示 model id，`apiKey` 继续承载本次请求 token，另在 run input 顶层增加 optional `region/maxTokens/timeoutMs`；不引入 provider config 嵌套结构。
- **Bedrock 详情不占首屏。** 主表继续保持时间、模型、用时/首字、输入、输出；Bedrock actual request、response stream、actual response、first event、latency metadata 和 event timeline 放在展开详情。
- **分页使用 page/pageSize/total。** Semi Table 受控分页天然适配远端分页；本地 SQLite 使用 `LIMIT/OFFSET` 足够支撑当前范围，不提前引入 cursor 复杂度。
- **响应体检查使用规则。** 检查空响应、HTTP/协议错误、错误 JSON、finish/stop reason、model 字段、usage 字段、截断和题型期望格式；不引入第二个模型评分。

## High-Level Technical Design

> 这是方向性设计，用来校验边界和数据流，不是实现代码。

```mermaid
flowchart TB
  Sidebar[Sidebar: 渠道 API 测试台] --> Module[ChannelApiTestModule]
  Module --> Form[Semi Form: 协议/模型/Base URL/API Key/流式/题型]
  Module --> Table[Semi Table: 时间/模型/用时首字/输入/输出]
  Form --> FrontApi[channelApiTestApi.run]
  Table --> FrontApiQuery[channelApiTestApi.queryRuns]
  FrontApi --> TauriRun[channel_test_run]
  FrontApiQuery --> TauriQuery[channel_test_query_runs]
  TauriRun --> Adapter{Protocol Adapter}
  Adapter --> OpenAI[OpenAI-compatible /v1/chat/completions]
  Adapter --> Anthropic[Anthropic-compatible /v1/messages]
  Adapter --> Bedrock[Bedrock Converse Stream]
  OpenAI --> Normalize[Normalized Test Result]
  Anthropic --> Normalize
  Bedrock --> Normalize
  Normalize --> Checks[Deterministic Checks]
  Checks --> Persist[channel_api_test_runs]
  TauriQuery --> Persist
  Persist --> Table
  Table --> Detail[expandedRowRender: 响应体/检查项/错误/脱敏上下文]
```

## Data Model Direction

新增测试记录字段按“可扫表 + 可排障 + 不泄密”组织：

| 字段 | 用途 |
|---|---|
| `id`, `workspaceId`, `startedAt`, `completedAt` | 历史记录与排序 |
| `protocol`, `model`, `baseUrlDisplay` | 表格与脱敏排障 |
| `category`, `caseId`, `stream` | 题库与流式标识 |
| `status`, `errorReason`, `httpStatus` | 成功/失败和错误归因 |
| `totalDurationMs`, `firstTokenMs`, `firstMetricKind` | 用时/首字或首响应 |
| `inputSize`, `inputSizeSource`, `outputSize`, `outputSizeSource` | 输入/输出规模和口径 |
| `responseText`, `responseJsonExcerpt`, `rawErrorExcerpt` | 展开行排障片段 |
| `roundsJson` | 连续追问型每轮耗时、首字、输入/输出规模、错误摘要 |
| `checksJson` | 确定性检查结果列表 |
| `usageJson` | 渠道真实返回 usage；缺失则为空 |
| `conversationJson.metrics` | 各轮 header、first event、first text、completed 耗时 |
| `conversationJson.bedrock` | Bedrock event timeline、event samples 和 latency metadata |
| `createdAt` | 本地写入时间 |

敏感字段不入库：`apiKey`、`Bearer Token`、`Authorization` 原值、完整请求 headers。

## Implementation Units

- [x] **Unit 1: 引入 Semi UI 并接入左侧独立模块**

**Goal:** 建立“渠道 API 测试台”主入口和空模块骨架，Semi UI 只在该模块使用。

**Requirements:** R1-R3

**Dependencies:** None

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `src/features/shell/types.ts`
- Modify: `src/features/shell/Sidebar.tsx`
- Modify: `src/features/shell/Sidebar.test.tsx`
- Modify: `src/app/workbench/hooks/WorkbenchAppContent.tsx`
- Add: `src/app/workbench/hooks/useWorkbenchChannelTestController.tsx`
- Add: `src/features/channel-test/module/ChannelApiTestModule.tsx`
- Add: `src/features/channel-test/module/ChannelApiTestModule.test.tsx`
- Modify: `src/styles/globals.css`

**Approach:**
- 添加 `@douyinfe/semi-ui-19`，匹配当前 React 19。
- 在全局样式中接入 Semi 必要样式，避免在业务组件里重复 import。
- 新增 `MainModule` 值，例如 `channelTest`，并在 Sidebar 增加独立入口。
- Workbench 只新增一个 controller hook 和一个中心区域分支，复杂状态留在 `src/features/channel-test` 内。
- 初始模块只展示表单/表格容器空态，不接真实请求。

**Patterns to follow:**
- `src/app/workbench/hooks/useWorkbenchUsageController.tsx`
- `src/features/usage/module/UsageModule.tsx`
- `docs/solutions/best-practices/workbenchapp-modularization-best-practice-2026-04-14.md`

**Test scenarios:**
- Sidebar 中文环境显示“渠道 API 测试台”，点击后调用 `onChangeModule`。
- Workbench 在 `activeModule=channelTest` 时渲染测试台模块，不影响 prompts/skills/usage/agents/settings。
- 模块在 `workspaceId=null` 时显示不可运行空态或禁用态，不抛异常。
- Semi 样式接入后现有 shared UI 不因 import 顺序导致基础页面不可渲染。

**Verification:**
- 新模块可从左侧打开。
- 壳层改动只包含模块枚举、Sidebar、Workbench 分发和新 controller。

- [x] **Unit 2: 定义前端类型、API façade 和 Tauri 命令契约**

**Goal:** 建立测试台前后端契约，让 UI、Tauri invoke 和 Rust command 有一致的输入输出类型。

**Requirements:** R4-R7, R12-R18, R21-R22

**Dependencies:** Unit 1

**Files:**
- Add: `src/shared/types/channelApiTest.ts`
- Modify: `src/shared/types/index.ts`
- Modify: `src/shared/services/tauriClient.ts`
- Modify: `src/shared/services/api/coreApi.ts`
- Modify: `src/shared/services/api/index.ts`
- Modify: `src/shared/services/api/types.ts`
- Modify: `src/shared/services/tauriClient.test.ts`

**Approach:**
- 新增协议、题型、流式标识、运行状态、检查项、分页入参和结果类型。
- 新增两个命令契约：`channel_test_run` 和 `channel_test_query_runs`。
- `run` 入参包含 `workspaceId`、`protocol`、`model`、`baseUrl`、`apiKey`、`stream`、`category`、`caseId`，以及本次内置题型展开后的 `messages` 或固定追问 `rounds`。
- `queryRuns` 入参使用 `workspaceId`、`page`、`pageSize`，返回 `items` 和 `total`。
- 类型中显式区分 `firstMetricKind: "first_token" | "first_response"`。
- 历史结果类型包含可选 `rounds`，供连续追问型展开详情展示每轮耗时和首字。

**Patterns to follow:**
- `src/shared/types/modelUsage.ts`
- `src/shared/services/api/coreApi.ts`
- `src/shared/services/tauriClient.ts`

**Test scenarios:**
- `invokeCommand("channel_test_run", { input })` 可正确透传参数。
- `channelApiTestApi.queryRuns` 使用 `page/pageSize` 传参并返回分页结果。
- Tauri 错误仍通过 `TauriClientError` 映射，不新增第二套错误处理。

**Verification:**
- 前端契约集中、可类型检查。
- API Key 只在运行入参出现，不出现在历史记录返回类型中。

- [x] **Unit 3: 新增后端持久化、命令注册和分页查询**

**Goal:** 在 Rust/Tauri 侧建立独立测试记录表、命令注册和历史分页查询能力。

**Requirements:** R12-R17, R20-R22

**Dependencies:** Unit 2

**Files:**
- Add: `src-tauri/src/control_plane/channel_test/mod.rs`
- Add: `src-tauri/src/control_plane/channel_test/api.rs`
- Add: `src-tauri/src/control_plane/channel_test/persistence.rs`
- Add: `src-tauri/src/control_plane/channel_test/query.rs`
- Add: `src-tauri/src/control_plane/channel_test/checks.rs`
- Add: `src-tauri/src/control_plane/channel_test/tests.rs`
- Add: `src-tauri/src/db/channel_test_migrations.rs`
- Modify: `src-tauri/src/db.rs`
- Modify: `src-tauri/src/control_plane/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/domain/models.rs`

**Approach:**
- 使用 `migration_meta` 增加一次性迁移，创建 `channel_api_test_runs` 表与 `workspace_id, started_at DESC` 索引。
- `channel_test_query_runs` 校验 workspace 后按时间倒序返回 page/pageSize 数据和 total。
- `channel_test_run` 先校验 workspace 和入参，再调用协议执行器，最后无论成功失败都持久化一条脱敏记录；连续追问型作为一个测试 run 记录聚合结果，展开详情保存每轮明细。
- 错误结果也要有可排障记录，但 Tauri 命令返回应让前端能展示该条记录，而不是只抛异常。
- 连续追问型失败时仍保存已完成轮次和失败轮次摘要，整条 run 标记为 failed 或 partial failed。

**Patterns to follow:**
- `src-tauri/src/db/model_usage_migrations.rs`
- `src-tauri/src/control_plane/model_usage/api.rs`
- `src-tauri/src/control_plane/model_usage/query.rs`
- `src-tauri/src/control_plane/model_usage/persistence.rs`

**Test scenarios:**
- Migration 幂等执行，多次 bootstrap 不重复建表或报错。
- 查询默认按 `startedAt DESC, id DESC` 返回。
- page/pageSize 计算正确，total 为过滤后的总数。
- 成功记录不包含 API Key 原文。
- 失败记录持久化 `status=failed`、`errorReason`、`httpStatus` 或协议错误摘要。
- 连续追问型记录持久化 `roundsJson`，每轮都有耗时、首字/首响应、输入/输出规模和错误摘要。
- workspace 不存在时返回 `WORKSPACE_NOT_FOUND`，不写记录。

**Verification:**
- 后端命令能注册并被前端 invoke 类型覆盖。
- 历史记录关闭应用后可从 SQLite 查询恢复。

- [x] **Unit 4: 实现 OpenAI-compatible 与 Anthropic-compatible 协议适配**

**Goal:** 在 Rust 侧完成真实 HTTP 请求、流式解析、计时和协议响应归一。

**Requirements:** R4-R7, R15-R18, R20

**Dependencies:** Unit 3

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Add: `src-tauri/src/control_plane/channel_test/http.rs`
- Add: `src-tauri/src/control_plane/channel_test/openai.rs`
- Add: `src-tauri/src/control_plane/channel_test/anthropic.rs`
- Modify: `src-tauri/src/control_plane/channel_test/mod.rs`
- Modify: `src-tauri/src/control_plane/channel_test/tests.rs`

**Approach:**
- 引入最小 HTTP client 依赖，优先选能支持 blocking/streaming body 的成熟 crate；避免新增复杂 async runtime，除非 Tauri 命令实现确实需要。
- OpenAI-compatible:
  - POST `{baseUrl}/v1/chat/completions`。
  - Headers 使用 `Authorization: Bearer <apiKey>` 与 `Content-Type: application/json`。
  - 非流式解析 `choices[].message.content`、`finish_reason`、`model`、`usage`。
  - 流式解析 data-only SSE，累计 `choices[0].delta.content`，首个非空 content 作为首字时间；遇到 `[DONE]` 结束。
- Anthropic-compatible:
  - POST `{baseUrl}/v1/messages`。
  - Headers 使用 `x-api-key`、`anthropic-version`、`Content-Type: application/json`。
  - 非流式解析 `content[].text`、`stop_reason`、`model`、`usage`。
  - 流式解析 SSE，累计 `content_block_delta.delta.text`，首个非空 text 作为首字时间；处理 `message_delta.usage` 和 `message_stop`。
- Base URL 归一只做末尾斜杠和路径拼接，不猜测复杂供应商路径；如果用户输入已包含 `/v1/chat/completions` 或 `/v1/messages`，实现阶段可选择拒绝或规范化，但必须保持简单、可解释。
- 超时使用一个固定合理默认值，不做用户可配的复杂策略；失败记录中保留超时错误摘要。
- 连续追问型由后端按固定 2-3 轮顺序执行，每轮把上一轮 assistant 输出追加到下一轮上下文中；表格展示聚合耗时和聚合输入/输出，展开行展示每轮指标。

**Patterns to follow:**
- `src-tauri/src/error.rs` 的 `AppError` 返回结构。
- `src-tauri/src/security.rs` 的 URL 校验习惯可参考，但本功能允许用户主动测试本地/私有 Base URL 时，不应套用“只允许公共 HTTPS skill source”的规则。

**Test scenarios:**
- OpenAI 非流式成功：提取文本、model、finish_reason、usage，总耗时和首响应时间存在。
- OpenAI 流式成功：从 delta 内容累计输出，首个非空 delta 产生 `firstMetricKind=first_token`。
- OpenAI 流式缺最终 usage：不估算 token，规模回退为字符数。
- Anthropic 非流式成功：提取 `content[].text`、`stop_reason`、usage。
- Anthropic 流式成功：跳过 ping，处理 `content_block_delta`，未知事件不失败。
- 连续追问型成功：按顺序执行多轮请求，记录累计耗时和每轮首字/首响应。
- 连续追问型中途失败：保留已完成轮次，失败轮次记录错误摘要，后续轮次不再继续。
- HTTP 401/403/429/5xx：记录 failed、HTTP 状态、错误摘要和脱敏上下文。
- 错误 JSON：检查项中标记 error JSON。
- API Key 不出现在任何持久化字段、错误文本或 debug context。

**Verification:**
- 两种协议、流式/非流式各有单测覆盖。
- 缺失 usage 时不出现估算 token 或成本。

- [x] **Unit 5: 建立内置题库与测试运行表单**

**Goal:** 用户可选择协议和四类内置题型，输入本次测试参数并触发运行。

**Requirements:** R4-R11, R16-R17

**Dependencies:** Unit 2, Unit 4

**Files:**
- Add: `src/features/channel-test/data/testCases.ts`
- Add: `src/features/channel-test/hooks/useChannelApiTestController.ts`
- Add: `src/features/channel-test/components/ChannelTestForm.tsx`
- Add: `src/features/channel-test/components/ChannelTestForm.test.tsx`
- Modify: `src/features/channel-test/module/ChannelApiTestModule.tsx`

**Approach:**
- 内置题库在前端固定声明，按 `small | medium | large | followup` 四类组织。
- 每个题型在原始阶段只保留必要的 1 个内置 case，避免题库管理复杂化。
- 普通题型发送单组 messages；连续追问型发送固定 2-3 轮 user prompts，由后端顺序执行并生成每轮指标。
- Semi Form 使用协议 Select、模型 Input、Base URL Input、API Key Password Input、流式 Switch、题型 Select、运行 Button。
- 表单校验只做必填和基本 URL 形态，不做复杂供应商规则。
- 运行期间按钮 loading/disabled，完成后刷新第一页历史。

**Patterns to follow:**
- `src/features/usage/hooks/useUsageDashboardController.ts` 的 controller 状态收口方式。
- `src/features/common/components/EmptyState.tsx` 的空态表达。

**Test scenarios:**
- 默认选择一个安全的小请求题型，但用户可切换到中等/大请求/连续追问。
- 协议、模型、Base URL、API Key 缺失时运行按钮不可提交或显示表单错误。
- 流式开关会进入 `channel_test_run` 入参。
- 连续追问型提交的 payload 包含固定轮次，且结果详情可展示每轮指标。
- 运行成功后调用历史刷新，并回到第一页。
- 运行失败但后端返回失败记录时，页面仍能在表格看到失败结果。
- API Key 输入框不会在结果区回显明文。

**Verification:**
- 用户能完成一次手动配置和发起测试。
- 当前范围没有题库编辑入口或“运行全部题型”强制路径。

- [x] **Unit 6: 用 Semi Table 展示历史、分页和展开详情**

**Goal:** 按用户截图形态展示结果表格，并支持分页和展开排障详情。

**Requirements:** R12-R23

**Dependencies:** Unit 3, Unit 5

**Files:**
- Add: `src/features/channel-test/components/ChannelTestResultsTable.tsx`
- Add: `src/features/channel-test/components/ChannelTestRunDetail.tsx`
- Add: `src/features/channel-test/components/ChannelTestResultsTable.test.tsx`
- Add: `src/features/channel-test/utils/format.ts`
- Modify: `src/features/channel-test/hooks/useChannelApiTestController.ts`
- Modify: `src/features/channel-test/module/ChannelApiTestModule.tsx`

**Approach:**
- Semi Table 列为：时间、模型、用时/首字、输入、输出。
- 模型列显示协议标签和流式标签；流式标签只反映本次请求开关。
- 用时/首字列同时展示总耗时和首字/首响应，非流式明确标注“首响应”。
- 输入/输出列按 usage 或字符数来源显示；缺 usage 时不展示 token 字样。
- `expandedRowRender` 展示请求摘要、响应体片段、检查项、错误摘要、脱敏 debug context。
- Semi Table 使用受控 pagination，前端状态为 `page/pageSize/total`，切页触发 `channel_test_query_runs`。

**Patterns to follow:**
- `src/features/usage/components/RequestDetailTable.tsx` 的表格字段口径可参考，但本模块用 Semi Table 重写。
- Semi Table `expandedRowRender` 与受控 pagination。

**Test scenarios:**
- 表格显示时间、模型、用时/首字、输入、输出五个核心列。
- 成功记录显示 success 状态，失败记录显示错误摘要。
- 流式记录显示“流”标签，非流式不显示或显示不同文案。
- 非流式记录的首字区域显示“首响应”，不是“首字”。
- usage 存在时展示真实 usage 来源；usage 缺失时展示字符数来源。
- 展开行显示检查项、响应体、错误信息和脱敏上下文。
- 连续追问型展开行显示每轮输入摘要、输出摘要、首字/首响应、耗时和错误状态。
- 展开行中不包含 API Key、Authorization 明文。
- 切换页码或 pageSize 会重新查询历史。
- 空历史时显示可行动空态，引导先运行一次测试。

**Verification:**
- 历史记录按时间倒序分页。
- 表格与展开行覆盖用户指定结果形态。

- [x] **Unit 7: 回归、文档和验收收口**

**Goal:** 收齐跨层测试和最小用户说明，确认功能边界没有污染现有模块。

**Requirements:** R1-R23

**Dependencies:** Unit 1-6

**Files:**
- Add: `docs/features/channel-api-testbench.md`
- Modify: `src/app/WorkbenchApp.agents.test.tsx` only if active module mocks need new union coverage
- Modify: `src/app/WorkbenchApp.prompts.test.tsx` only if active module mocks need new union coverage
- Modify: `src/app/WorkbenchApp.settings.test.tsx` only if active module mocks need new union coverage
- Modify: `src/app/WorkbenchApp.skills-operations.test.tsx` only if active module mocks need new union coverage

**Approach:**
- 写一页简短功能说明，原始阶段记录 API Key 不持久化、双协议范围、缺 usage 不估算 token/成本；当前执行以 Unit 12 的三协议说明为准。
- 跑前端模块测试、Tauri 类型/单测、line governance 和 typecheck/build。
- 回归确认 Usage 看板未读取或展示测试台记录。
- 若 Workbench 测试 mock 因 `MainModule` 联合类型变化失败，只做最小 mock 更新。

**Test scenarios:**
- 旧 Usage Dashboard 查询仍只调用 `modelUsageApi`，不读取 `channel_test` 命令。
- 左侧模块切换仍能进入 prompts/skills/usage/agents/settings。
- 新模块测试覆盖表单、运行、分页、展开详情、脱敏。
- Rust 测试覆盖迁移、分页、协议归一和敏感信息过滤。

**Verification:**
- `npm run typecheck`
- `npm run test:run -- src/features/shell/Sidebar.test.tsx src/features/channel-test src/shared/services/tauriClient.test.ts`
- `npm run test:run -- src/features/usage/components/__tests__/UsageDashboard.test.tsx`
- `cargo test channel_test`
- `npm run check:line-governance:changed`

- [x] **Unit 8: 扩展协议类型与 Bedrock 表单参数**

**Goal:** 让用户能在既有测试台中选择 Bedrock Converse Stream，并输入 Bedrock 所需的最小参数。

**Requirements:** R4-R7, R24-R26

**Dependencies:** Unit 1-7

**Files:**
- Modify: `src/shared/types/channelApiTest.ts`
- Modify: `src/features/channel-test/hooks/useChannelApiTestController.ts`
- Modify: `src/features/channel-test/components/ChannelTestForm.tsx`
- Modify: `src/features/channel-test/components/ChannelTestForm.test.tsx`
- Modify: `src/features/channel-test/utils/format.ts`
- Modify: `src/features/channel-test/components/ChannelTestResultsTable.tsx`
- Test: `src/features/channel-test/module/ChannelApiTestModule.test.tsx`

**Approach:**
- 将 `ChannelApiTestProtocol` 扩展为 `openai | anthropic | bedrock`，并补充协议标签 `Bedrock`。
- 表单按协议切换字段含义：OpenAI/Anthropic 保持 model、Base URL、API Key、stream；Bedrock 展示 region、model id、Bearer Token、max tokens、timeout，并隐藏或禁用 Base URL 与 stream 开关。
- Bedrock 默认按流式处理，提交入参中 `stream=true`，以便复用主表流式标签和首字口径。
- 不新增 Bedrock 专属页面，也不新增 AWS profile/STS 配置区域。
- 对现有命令契约做最小扩展：`model` 作为 Bedrock model id，`apiKey` 作为 Bearer Token，新增 optional `region/maxTokens/timeoutMs`；Bedrock 提交时由前端生成 `baseUrl=https://bedrock-runtime.{region}.amazonaws.com` 仅用于展示和脱敏摘要，不允许用户编辑。

**Patterns to follow:**
- `src/features/channel-test/components/ChannelTestForm.tsx` 的 Semi Select/Input/Switch 组合。
- `src/features/channel-test/hooks/useChannelApiTestController.ts` 的单一 form state 与 run payload 构造。
- `src/features/channel-test/utils/format.ts` 的 label helper。

**Test scenarios:**
- Happy path: 协议选择 Bedrock 后，表单显示 region、model id、Bearer Token、max tokens、timeout，并不显示 OpenAI/Anthropic 的 Base URL 输入语义。
- Happy path: Bedrock 表单提交时 run payload 带有 `protocol=bedrock`、模型、region、Bearer Token、max tokens、timeout，并强制 `stream=true`。
- Edge case: 从 Bedrock 切回 OpenAI 或 Anthropic 时，表单恢复 Base URL 与 stream 开关，不残留 Bedrock-only 校验错误。
- Error path: Bedrock 缺少 region、model id 或 Bearer Token 时不能运行。
- Security: Bearer Token 输入框使用 password 模式，结果区不回显明文。
- Integration: Results table 对 `protocol=bedrock` 显示 Bedrock 标签和 Stream 标签。

**Verification:**
- 前端类型检查能覆盖三协议。
- 用户能在一个测试台表单内切换 Bedrock，不需要新页面。

- [x] **Unit 9: 新增 Bedrock Converse Stream 后端 runner 与 AWS event-stream 解析**

**Goal:** 在 Rust `channel_test` 模块中实现 Bedrock 原生 Converse Stream 请求、AWS event-stream 帧解析和 `ProtocolResponse` 归一。

**Requirements:** R4-R7, R15-R17, R24-R27

**Dependencies:** Unit 8

**Files:**
- Add: `src-tauri/src/control_plane/channel_test/bedrock.rs`
- Modify: `src-tauri/src/control_plane/channel_test/mod.rs`
- Modify: `src-tauri/src/control_plane/channel_test/runner.rs`
- Modify: `src-tauri/src/control_plane/channel_test/validation.rs`
- Modify: `src-tauri/src/control_plane/channel_test/http.rs`
- Modify: `src-tauri/src/control_plane/channel_test/tests.rs`
- Test: `src-tauri/src/control_plane/channel_test/tests.rs`

**Approach:**
- 新增 `PROTOCOL_BEDROCK` 常量并让 validation 接受 `bedrock`。
- Bedrock endpoint 由 region 和 model id 生成，形态为 Bedrock Runtime `ConverseStream`；不要复用 Anthropic Messages endpoint。
- Bedrock 请求使用 `Authorization: Bearer <token>`、`Content-Type: application/json` 和 `Accept: application/vnd.amazon.eventstream`。
- 请求 body 使用内置题库 messages 映射到 Converse Stream 的 messages/content text 形态，并使用 `maxTokens`；不支持工具调用、system prompts、additionalModelRequestFields 或非文本 content。
- AWS event-stream 解析按帧读取 total length、headers length、payload JSON，抽取 event type、text delta、metadata.usage、metadata.metrics.latencyMs、stop reason 和 exception event。
- `ProtocolResponse` 中：
  - `first_event_ms` 为首个成功解析 event 到达时间；
  - `first_text_delta_ms` 与 `first_token_ms` 为首个非空文本 delta 到达时间；
  - `usage` 使用 Bedrock 原始 usage，例如 `inputTokens/outputTokens/totalTokens`；
  - `finish_reason` 使用 stop reason；
  - `response_json` 保存截断后的 event timeline、event samples、metadata summary 和 error event。
- 错误事件或 HTTP 非 2xx 必须返回 failed response，并保留脱敏错误摘要。

**Execution note:** 先补 AWS event-stream parser 的 characterization tests，再接真实 Bedrock runner，避免解析器和网络请求逻辑混在一起调试。

**Patterns to follow:**
- `src-tauri/src/control_plane/channel_test/openai.rs` 的 `ProtocolResponse` 归一结构。
- `src-tauri/src/control_plane/channel_test/anthropic.rs` 的流式文本累计与首字记录方式。
- `src-tauri/src/control_plane/channel_test/http.rs` 的 client/header/diagnostic helper。

**Test scenarios:**
- Happy path: 合成 Bedrock event-stream 包含 message start、content delta、message stop、metadata，解析后累计文本、usage、stop reason、first event 和 first text。
- Happy path: Bedrock metadata 中的 latencyMs 被保留到 response JSON，供报告层展示。
- Edge case: event-stream 分帧被拆成多个 read chunk 时仍能正确拼接。
- Edge case: metadata 在没有文本 delta 的情况下到达，first event 有值但 first text 为空，检查项能标记空输出。
- Error path: event-stream frame 长度非法或 trailing bytes 不为空时返回解析失败。
- Error path: Bedrock stream exception event 返回 failed response，错误摘要包含 exception 类型但不包含 Bearer Token。
- Error path: HTTP 401/403/429/5xx 返回 failed response 和 HTTP 状态。
- Security: Authorization/Bearer Token 不进入 `raw_excerpt`、`response_json`、`conversationJson` 或错误摘要。

**Verification:**
- `run_protocol` 能按 `protocol=bedrock` 分派到 Bedrock runner。
- Bedrock parser 单测不依赖真实 AWS 网络。

- [x] **Unit 10: 扩展 Bedrock 报告、检查项和调用过程记录**

**Goal:** 让 Bedrock 结果在现有历史记录、检查项、耗时分解和 `conversationJson` 中可解释。

**Requirements:** R12-R20, R24-R27

**Dependencies:** Unit 9

**Files:**
- Modify: `src-tauri/src/control_plane/channel_test/runner.rs`
- Modify: `src-tauri/src/control_plane/channel_test/report.rs`
- Modify: `src-tauri/src/control_plane/channel_test/checks.rs`
- Modify: `src-tauri/src/control_plane/channel_test/attribution.rs`
- Modify: `src-tauri/src/control_plane/channel_test/tests.rs`
- Test: `src-tauri/src/control_plane/channel_test/tests.rs`

**Approach:**
- 调整 usage size mapping：Bedrock 输入优先 `inputTokens`，输出优先 `outputTokens`；缺失 usage 时回退字符数，不估算 token 或成本。
- 在 `conversationJson.metrics` 中保留 Bedrock `firstEventMs`、`firstTextDeltaMs`、`completedMs`、`bedrockLatencyMs`。
- 在 `conversationJson.bedrock` 中保存 event timeline、前若干 event samples、event counts、stop reason、usage。
- 每次 Bedrock 运行只执行一次 Converse Stream 调用；`conversationJson` 保存实际请求体、实际响应体和响应过程事件，供展开详情重放本次调用链路。
- Bedrock 检查项补充：
  - `bedrock_event_stream`：event-stream 是否成功解析；
  - `bedrock_latency_metadata`：metadata latency 是否存在；
  - `bedrock_stream_exception`：是否出现 exception event；
  - `region_model`：region/model 相关错误只做保守提示，不做未验证断言。
- attribution 中的 Bedrock-like 候选证据应兼容原生 Bedrock 协议，但不把“原生 Bedrock 测试成功”混同为“某个代理链路一定是 Bedrock”。

**Patterns to follow:**
- `src-tauri/src/control_plane/channel_test/report.rs` 的 `build_conversation_json_with_details`。
- `src-tauri/src/control_plane/channel_test/checks.rs` 的确定性检查列表。
- `src-tauri/src/control_plane/channel_test/sampling.rs` 的多响应聚合思路。

**Test scenarios:**
- Happy path: Bedrock success record 的 `usageJson` 包含真实 usage，input/output size source 为 `usage`。
- Happy path: `conversationJson.bedrock` 包含 timeline、event samples、event counts、latency metadata 和 stop reason。
- Happy path: Bedrock 每次运行只发起一次 Converse Stream 调用，详情展示该次调用的请求体、响应过程和响应体。
- Edge case: Bedrock stream exception 时，run 状态为 failed，详情保留错误事件和响应过程。
- Error path: metadata latency 缺失时检查项为 warn，不导致整体失败。
- Error path: stream exception 导致检查项 fail，错误摘要可排障。
- Integration: attribution report 对 Bedrock 原生协议保留 evidence，但 summary 不声称代理链路被证明。

**Verification:**
- Bedrock 历史记录能用既有 query/pagination 返回。
- 记录中没有 token 估算或成本估算字段。

- [x] **Unit 11: 展示 Bedrock 详情与对账说明**

**Goal:** 在既有结果表格和展开详情中展示 Bedrock 专属指标，而不新增页面或干扰 OpenAI/Anthropic 结果。

**Requirements:** R12-R17, R24-R27

**Dependencies:** Unit 8-10

**Files:**
- Modify: `src/features/channel-test/components/ChannelTestRunDetail.tsx`
- Modify: `src/features/channel-test/components/ChannelTestResultsTable.tsx`
- Modify: `src/features/channel-test/components/ChannelAttributionPanel.tsx`
- Modify: `src/features/channel-test/utils/format.ts`
- Modify: `src/features/channel-test/utils/reportI18n.ts`
- Modify: `src/features/channel-test/components/ChannelTestResultsTable.test.tsx`
- Test: `src/features/channel-test/components/ChannelTestResultsTable.test.tsx`

**Approach:**
- 主表保持时间、模型、用时/首字、输入、输出五列，仅新增 Bedrock 协议标签和流式标签。
- `ChannelTestRunDetail` 从 `conversationJson` 解析实际请求体、实际响应体，并从 `conversationJson.bedrock` 解析 Bedrock timing、event timeline、event samples、latency metadata。
- 增加一个轻量的 Bedrock 详情块，展示：
  - actual request body；
  - response stream / SSE events；
  - actual response body；
  - first event；
  - first text delta；
  - Bedrock latency；
  - stop reason；
  - usage；
  - event counts/timeline；
- 对账说明中补充：Bedrock latency 是 AWS metadata 返回口径，本地 total duration 是客户端观察口径，二者不能简单相减当作网络耗时。
- 没有 Bedrock 详情的历史记录应继续按旧逻辑展示，不抛异常。

**Patterns to follow:**
- `src/features/channel-test/components/ChannelTestRunDetail.tsx` 的 `parseMetrics` 和 `formatJson` 容错解析模式。
- `src/features/channel-test/components/ChannelAttributionPanel.tsx` 的证据展示和不可判断项文案。
- `src/features/channel-test/utils/reportI18n.ts` 的中英文文本映射。

**Test scenarios:**
- Happy path: Bedrock 记录展开后显示 first event、first text、Bedrock latency、usage、stop reason 和 event timeline。
- Happy path: Bedrock 记录展开后显示该次调用的实际请求体、响应过程/SSE 事件和实际响应体。
- Edge case: `conversationJson.bedrock` 缺失时仍显示通用响应体和完整 JSON，不报错。
- Edge case: latency metadata 缺失时显示 `-` 或 warning 文案，不显示错误数字。
- Error path: Bedrock stream exception 记录在详情中展示错误类型和检查项。
- Security: 展开详情、完整 JSON 和错误摘要不包含 Bearer Token。
- Regression: OpenAI/Anthropic 记录的详情展示和链路归因不变。

**Verification:**
- Bedrock 信息进入展开详情，首屏表格不膨胀。
- 旧历史记录兼容。

- [x] **Unit 12: 更新文档、回归测试和旧边界清理**

**Goal:** 收齐 Bedrock 扩展的用户说明、计划一致性和跨模块回归，确保旧“排除 Bedrock”边界不再误导实现。

**Requirements:** R1-R27

**Dependencies:** Unit 8-11

**Files:**
- Modify: `docs/features/channel-api-testbench.md`
- Modify: `docs/plans/2026-05-02-001-feat-channel-api-testbench-plan.md`
- Modify: `docs/brainstorms/2026-05-02-channel-api-testbench-requirements.md`
- Modify: `docs/ideation/2026-05-02-channel-api-testbench-ideation.md`
- Test: `src/features/channel-test/module/ChannelApiTestModule.test.tsx`
- Test: `src/features/channel-test/components/ChannelTestResultsTable.test.tsx`
- Test: `src-tauri/src/control_plane/channel_test/tests.rs`

**Approach:**
- 更新功能说明：支持 OpenAI-compatible、Anthropic-compatible、Bedrock Converse Stream；Bearer Token 不持久化；缺 usage 不估算 token/成本；Bedrock 固定按流式测试。
- 清理计划和文档中“Bedrock 不支持/排除”的旧描述，保留“非 Converse Stream Bedrock API、AWS profile/STS、模型发现不支持”的新边界。
- 回归确认 Usage Dashboard 仍不读取 channel test 记录。
- 回归确认链路归因只把 Bedrock evidence 作为候选证据，不把原生 Bedrock 测试成功误解释为代理链路证明。

**Patterns to follow:**
- `docs/features/channel-api-testbench.md` 的简短用户说明风格。
- `docs/plans/2026-05-02-002-feat-channel-chain-attribution-plan.md` 对 Bedrock-like evidence 的保守措辞。

**Test scenarios:**
- Documentation: 功能说明列出三协议和各自输入字段。
- Documentation: 明确不支持 AWS profile/STS/模型发现/非 Converse Stream。
- Regression: Usage Dashboard 测试仍只调用 `modelUsageApi`。
- Regression: Sidebar/Workbench 现有模块切换不受 Bedrock 协议扩展影响。
- Regression: Rust channel test 旧 OpenAI/Anthropic 流式和非流式解析测试仍通过。
- Security: 文档和测试都覆盖 API Key/Bearer Token 不持久化、不展示。

**Verification:**
- 文档、需求和计划对 Bedrock 范围一致。
- 前端和 Rust channel test 的核心回归覆盖三协议。

## System-Wide Impact

- **Navigation:** 新增一个左侧主模块，Settings 和 Usage 不新增子 Tab。
- **Frontend API:** 继续使用 `channelApiTestApi`，扩展三协议入参和结果类型，不改变既有 `modelUsageApi`。
- **Tauri Commands:** 继续使用 `channel_test_run` 和 `channel_test_query_runs`，扩展 `protocol=bedrock` 分支，不新增独立 Bedrock command。
- **Database:** 复用独立 channel test 表和 `conversationJson` 承载 Bedrock 详情，不写入 `model_call_facts`。
- **Dependencies:** 新增 `@douyinfe/semi-ui-19`；Rust 新增 HTTP client 依赖。
- **Security:** API Key/Bearer Token 仅用于本次执行，不持久化；所有展示和记录都走脱敏。
- **Network:** 测试请求由用户主动触发，失败不会影响应用启动和其他模块。
- **External API:** Bedrock 请求依赖用户提供的短期 Bearer Token、region 和 model id；计划不接管 AWS IAM 生命周期。
- **Attribution:** Bedrock 原生结果可增强链路归因 evidence，但归因结论仍是候选判断，不是 provider 证明。

## Risks and Mitigations

- **密钥泄漏风险:** 不持久化 API Key/Bearer Token；错误摘要、debug context、event samples 和响应片段写入前统一脱敏，并补单测。
- **协议兼容差异:** 当前范围只支持最小 OpenAI Chat Completions、Anthropic Messages 和 Bedrock Converse Stream；非标准渠道失败时显示协议错误，不做猜测性适配。
- **AWS event-stream 解析复杂度:** 先为 frame parser 写 characterization tests，再接 runner；解析失败作为可排障失败记录，不让 UI 崩溃。
- **Bedrock 指标口径误读:** 详情文案区分 first event、first text、client total duration 和 Bedrock metadata latency，不把 metadata latency 当成本地总耗时。
- **Semi UI 样式影响全局:** 仅在测试台使用 Semi 组件，接入后做基础页面渲染回归；不重写 shared UI。
- **历史表增长:** 当前范围按用户要求全量保留并分页；清理策略、导出、趋势图延后。
- **本地/私有 Base URL:** 用户主动测试场景可能需要内网地址；不直接复用 external skill source 的公共 HTTPS 限制，但错误展示必须清晰。

## Open Questions

### Resolved During Planning

- Semi UI 是否全局抽象：当前不抽，限定在测试台模块内使用。
- API Key/Bearer Token 是否持久化：当前不持久化，只用于本次测试请求。
- 历史记录存储：独立 SQLite 表，全量保留，页码分页。
- 流式首字指标：流式为首个可见文本 delta；非流式为首响应时间并明确标注。
- Bedrock 是否作为 Anthropic-compatible：不作为兼容协议变体，作为第三协议单独展示和解释。
- Bedrock 凭证范围：只支持短期 Bearer Token，不做 AWS profile/STS/IAM role。

### Deferred to Implementation

- Bedrock event-stream parser 的具体 helper 边界由实现时决定，但必须有不依赖真实 AWS 的 parser 单测。
- 内置题库 prompt 文案可在实现时微调，但必须覆盖四类题型并保持题量克制。
- Semi UI 细节样式在实现时按现有 AgentNexus 视觉做轻量适配，不做全站视觉重构。

## Acceptance Criteria

- 用户能从左侧打开“渠道 API 测试台”独立模块。
- 用户能选择 OpenAI-compatible、Anthropic-compatible 或 AWS Bedrock Converse Stream。
- OpenAI/Anthropic 用户能输入模型、Base URL、API Key，选择流式和题型后发起测试。
- Bedrock 用户能输入 region、model id、Bearer Token、max tokens 和 timeout 后发起 Converse Stream 测试。
- 用户能运行小请求、中等请求、大请求、连续追问型中的任一题型。
- 测试结果表格显示时间、模型、用时/首字、输入、输出，并支持分页。
- 展开行显示请求摘要、响应体片段、检查项、错误信息和脱敏排障上下文。
- Bedrock 展开行显示首 event、首文本 delta、总耗时、Bedrock latency、usage/stop reason、event timeline。
- Bedrock 失败时，用户能从错误摘要区分鉴权、region/model、HTTP、超时、event-stream 解析和 stream exception 等类型。
- 非流式记录明确显示首响应时间，不显示为真实首 token。
- 缺失 usage 时不估算 token 或成本，只显示可解释字符数或真实返回字段。
- 关闭并重开应用后仍能查看历史记录。
- 现有模型使用与成本看板不展示、不统计、不计费这些主动测试记录。

## Planning Confidence

Confidence: 84%

主要不确定性来自 Bedrock AWS event-stream parser 边界和不同失败事件的真实形态。产品范围、模块接入、数据隔离、三协议定位、分页表格和安全策略已经足够明确，可以进入实现。
