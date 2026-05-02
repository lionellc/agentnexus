---
date: 2026-05-02
topic: channel-network-chain-attribution
focus: 真实分析渠道中转链路、请求改写、号池分发与上游来源归因
---

# Ideation: 渠道网络链路与上游归因分析

## Assumptions

- AgentNexus 客户端当前可稳定掌握：用户填写的 protocol/model/baseUrl/key、实际请求体、响应头、响应体、SSE 到达时间、usage 与本地耗时。
- 用户想要的不是“直连候选/反代候选”这种二元标签，而是回答：请求经过中转后被改了什么、是否走号池、是否使用官方代理额度、最终上游更像 AWS Bedrock、Google Vertex、OpenRouter 还是官方 API。
- 不做绕过中转隐私、探测隐藏密钥、破解上游账号等能力；这类能力既不可靠，也不应该做。
- 真实结论必须分层表达：客户端侧只能归因和给置信度；只有中转侧日志、上游账单/API、或用户提供的链路追踪数据才能证明。

## Codebase Context

- 现有渠道测试模块已经在 `src/features/channel-test` 与 `src-tauri/src/control_plane/channel_test` 中成型，支持 OpenAI/Anthropic 协议、题库、分页、详情、完整对话 JSON、耗时分解。
- 当前后端会采集 `server`、`via`、`x-cache`、`cf-ray`、`x-request-id`、ratelimit、`openai-processing-ms` 等响应头，并在 `connectionDiagnostics` 中给出 `official_direct_candidate`、`proxy_candidate`、`unknown`。
- 当前连接诊断实现是保守候选判断：主要基于 baseUrl host 是否官方、响应头是否出现代理线索。它能解释“看到什么”，不能证明“中转背后实际走了哪里”。
- AgentNexus 既有 usage 看板设计强调“不估算，只统计真实数据”。链路归因也应沿用同一原则：证据不足时显示“不确定”，不要给用户制造确定性幻觉。
- 自建中转基座的历史决策偏向 New API，因为它更适合云厂商 API 对接与账号池路由治理。因此若用户控制 New API，中转侧协作追踪是最高性价比方向。

## Feasibility Boundary

| 问题 | 仅客户端可做到 | 主动探针可做到 | 中转/上游协作可做到 | 结论口径 |
|---|---|---|---|---|
| 是否直连官方 API | 通过 host、证书、响应头、错误体给候选 | 通过官方错误指纹提高置信度 | 可由请求日志确认 | 可推断，协作可证明 |
| 中转是否改写请求 | 只能从响应差异间接怀疑 | 可用边界参数和错误回显捕捉部分改写 | 可对比客户端请求与上游请求 | 客户端不能完整证明 |
| 是否走号池分发 | 可观察请求 ID、ratelimit、延迟簇变化 | 多轮重复请求可推断轮询/分桶 | 中转路由日志可证明 | 推断需要样本，证明需要日志 |
| 是否使用官方代理额度 | 客户端基本不能证明 | 只能发现与官方行为相似 | 上游账单、额度、channel 选择日志可证明 | 需要协作数据 |
| 上游是 AWS/Vertex/OpenRouter | 可收集响应头、错误体、usage 形态 | 针对 provider 指纹探针可提高置信度 | 中转 route/upstream URL 可证明 | 归因可以做，结论必须带置信度 |
| 中转背后真实网络路径 | traceroute 只能到中转入口 | 无法越过中转观测上游出口 | 中转出口日志或网络侧 tracing 可证明 | 客户端不能穿透中转 |

## Ranked Ideas

### 1. Evidence Ladder：证据分层归因报告

**Description:** 把“连接路径诊断”升级成证据分层报告，而不是单个标签。报告按证据来源分为客户端观测、协议指纹、重复采样、中转协作、上游对账五层，每层列出观察值、推断、置信度和不能证明的部分。

**Rationale:** 这是最符合当前代码和用户诉求的基础能力。它能直接解释为什么 AgentNexus 不能只靠一次响应就断言上游，也能让用户看到哪些结论是事实、哪些是推断。

**Downsides:** 产品文案需要克制，不能为了好看给出过度确定的结论。

**Confidence:** 92%

**Complexity:** Medium

**Status:** Unexplored

### 2. Provider Fingerprint Probe：上游指纹探针库

**Description:** 在题库之外新增一组“诊断探针”，专门发送低成本、可控的边界请求，例如非法模型名、协议专有参数、过小/过大的 max_tokens、stream 事件边界、工具调用 schema 边界。根据错误体结构、状态码、usage 字段、SSE 事件形态、ratelimit 头与 request id 形态，给 AWS Bedrock、Google Vertex、OpenRouter、OpenAI official、Anthropic official 等候选上游打分。

**Rationale:** 单纯看正常成功响应信息量很低，错误路径和边界路径往往更能暴露真实上游或中转改写行为。这个能力不需要中转配合，适合首期增强。

**Downsides:** provider 指纹会随上游版本变化，需要维护；中转如果强力归一化错误体，置信度会下降。

**Confidence:** 84%

**Complexity:** Medium

**Status:** Unexplored

### 3. Route Stability Sampling：路由稳定性与号池推断

**Description:** 对同一渠道、同一模型、同一探针连续执行 N 次，分析 request id 前缀、ratelimit bucket、响应头组合、首包/完成耗时分布、usage 差异、错误率和模型回包字段。如果出现多个稳定簇，标记为“疑似多上游/号池/负载均衡”。

**Rationale:** 号池分发很难单次证明，但重复采样可以发现分桶和轮询特征。它和现有分页、详情、耗时表天然兼容。

**Downsides:** 会消耗额度；样本太少时容易误判；不能证明“账号池”，只能证明“行为像多路由”。

**Confidence:** 80%

**Complexity:** Medium

**Status:** Unexplored

### 4. Cooperative Relay Trace：中转协作追踪模式

**Description:** 当用户控制 New API 或其他中转服务时，允许配置一个只读追踪接口或导入日志。AgentNexus 用本次测试 traceId 关联中转日志，展示 channelId、selected upstream、route group、account pool key、上游 URL host、上游 request id、重试次数、缓存命中、请求/响应改写摘要。

**Rationale:** 这是唯一能真正回答“中转对请求做了什么”的办法。相比客户端猜测，它能把证据从推断升级为证明。

**Downsides:** 需要中转侧配合；不同中转项目日志格式不一致；必须做脱敏，不能保存 key。

**Confidence:** 90%

**Complexity:** High

**Status:** Unexplored

### 5. Request Mutation Diff：请求改写对比

**Description:** 在详情页新增“请求改写”模块：左侧展示 AgentNexus 发出的 canonical request，右侧展示中转协作模式返回的 upstream request 摘要，突出 model remap、baseUrl/upstream host、headers 增删、stream_options、max_tokens、temperature、tool/schema、metadata、user 字段变化。

**Rationale:** 用户关心“通过中转后，中转对这个请求做了什么”。如果只显示上游来源，不显示改写差异，排障仍然不完整。

**Downsides:** 无中转协作时只能显示客户端请求，不能显示真实上游请求。

**Confidence:** 86%

**Complexity:** Medium

**Status:** Unexplored

### 6. Billing and Usage Reconciliation：账单与 usage 对账

**Description:** 把 AgentNexus 的本地 usage、relay 后台 usage、上游账单/额度快照放在同一详情页对账。若三者差异明显，标记为“中转重算 usage”“上游未返回 usage”“后台按字符/倍率计费”“可能走缓存”等候选原因。

**Rationale:** “真实官方代理额度”最终要靠上游账单或中转额度消耗来证明。只看响应体无法判断额度来源。

**Downsides:** 上游账单 API 权限敏感；不同服务账单延迟不同；首期可先支持手动导入或只读日志。

**Confidence:** 76%

**Complexity:** High

**Status:** Unexplored

### 7. Provider Evidence Registry：可维护的归因规则表

**Description:** 新建 provider evidence registry，以数据配置方式维护 provider 指纹规则：匹配字段、证据权重、过期说明、文档链接、最后验证时间。诊断报告只消费规则结果，不把 AWS/Vertex/OpenRouter 逻辑散落在 UI 和 Rust 代码里。

**Rationale:** Provider 指纹会变，写死在代码里会很快失真。规则表能让每条判断都可追溯，也符合“不要估算，只展示证据”的产品原则。

**Downsides:** 如果首期规则过少，用户会感觉覆盖不足；如果规则过多，维护成本会上升。

**Confidence:** 78%

**Complexity:** Medium

**Status:** Unexplored

## Product Shape

### 详情页新增模块

| 模块 | 内容 | 结论类型 |
|---|---|---|
| 链路结论 | 最可能路径、置信度、证据等级、不能证明的边界 | 推断/证明分层 |
| 证据表 | host、证书、响应头、错误体、SSE、usage、request id、ratelimit | 原始事实 |
| 上游候选 | OpenAI official、Anthropic official、AWS Bedrock、Google Vertex、OpenRouter、未知中转 | 评分 |
| 路由稳定性 | 多次采样的延迟簇、header 簇、request id 簇 | 推断 |
| 请求改写 | 客户端请求 vs 上游请求摘要 | 需要中转协作 |
| 对账 | 本地 usage、relay usage、上游账单/额度 | 需要日志或账单 |

### 结论标签建议

| 标签 | 含义 |
|---|---|
| 已证明 | 来自中转日志、上游日志或账单，可追溯到本次 traceId |
| 高置信推断 | 多个客户端可见证据一致，且没有强冲突 |
| 弱推断 | 只有单类证据，例如 header 或错误体 |
| 不确定 | 证据不足或被中转归一化 |
| 不可从客户端判断 | 需要中转或上游协作，不应继续猜 |

## Candidate Generation Summary

- 生成候选方向 18 个。
- 合并重复方向 5 个。
- 保留 7 个可落地想法。
- 核心收敛：不要做“神谕式识别”，做“证据链 + 置信度 + 协作证明”的链路归因系统。

## Rejection Summary

| # | Idea | Reason Rejected |
|---|---|---|
| 1 | 只用响应头判断最终上游 | 太脆弱；中转可删除、改写或统一响应头 |
| 2 | 用 traceroute 判断中转背后的 AWS/Vertex/OpenRouter | traceroute 只能观察到客户端到中转入口，不能穿透中转看到上游出口 |
| 3 | 根据模型回答风格判断真实 provider | 不可控且误报高，不适合作为工程证据 |
| 4 | 尝试探测或绕过中转隐藏 key | 不合规，也不符合产品目标 |
| 5 | 自动保存用户 API key 以便后续复测 | 安全风险高；应保持一次性使用或本地安全存储策略 |
| 6 | 给每次请求强行输出唯一 provider 结论 | 证据不足时会误导用户，应允许“不确定” |
| 7 | 首期直接接入所有上游账单 API | 成本过高；更适合在协作追踪闭环后逐步接入 |

## Recommended Path

1. 先实现 Evidence Ladder，把当前 `connectionDiagnostics` 从二元候选改成证据表和置信度。
2. 再实现 Provider Fingerprint Probe，以低成本探针提高 AWS/Vertex/OpenRouter/official API 的归因能力。
3. 接着实现 Route Stability Sampling，用重复采样解释“疑似号池/多路由”。
4. 如果用户控制 New API，再做 Cooperative Relay Trace；这是证明中转改写和真实上游的关键能力。
5. 最后再考虑账单/usage 对账，避免首期把敏感权限和高复杂度一次性引入。

## Session Log

- 2026-05-02: Initial ideation — 18 candidates generated, 7 survived. 用户选择新建独立 ideation 文档；结论收敛为“客户端归因 + 协作证明”的链路分析方案。
