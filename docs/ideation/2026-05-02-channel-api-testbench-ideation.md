---
date: 2026-05-02
topic: channel-api-testbench
focus: 新增一个 tab，用内置题库测试渠道 API 的首字、用时、响应体分析等情况
---

# Ideation: 渠道 API 测试台

## Assumptions

- “渠道”按“大模型 API 渠道/供应商配置”理解，不按 AgentNexus 现有分发目标理解。
- 首期协议范围需要同时覆盖 OpenAI-compatible 和 Anthropic-compatible，用户可在测试前选择渠道类型。
- 用户本次测试时需要能直接输入模型、Base URL、API Key 等参数；这些字段先服务测试闭环，不默认等同于完整渠道管理。
- 内置题库按请求规模与对话形态分为：小请求、中等请求、大请求、连续追问型。
- 分析结果用表格表达，核心列为时间、模型、用时/首字、输入、输出；行内可用标签标识流式请求，详情通过展开行承载。
- “首字”暂按流式响应中的首包/首 token/首个可见字符时间处理；如果后续进入 brainstorm，需要先统一指标命名。
- 这次是 ideation，不进入需求、计划或代码实现。

## Codebase Context

- AgentNexus 是 React + Vite + TypeScript + Tauri/Rust 的本地优先 Agent control plane，已有左侧主模块入口：Prompts、Skills、模型使用与成本、全局 Agent 规则、Settings。
- 现有模型能力集中在 Settings 的 AI 模型配置，`src/features/settings/components/ModelWorkbenchPanel.tsx` 已有 `localAgent | api` 类型雏形，但 API 模型当前明确显示“API 模型暂未支持”。
- 现有测试执行链路主要服务本地 Agent 翻译场景：`local_agent_translation_test` 支持运行测试、流式输出、右侧运行输出面板，但不是通用 API 渠道探测。
- 现有 `usage` 主模块和 `model_usage` 后端用于历史调用事实统计、成本与请求明细分析；它复用 `provider/model/status` 口径，但不是主动发起测试的交互。
- 已有产品决策倾向于“独立模块 + 壳层薄、模块厚”：模型使用看板已作为独立 `usage` 模块接入，不塞进 Skills 子页。
- 相关约束：不要估算缺失数据；新增能力应最小化，不要一次引入复杂调度、告警、全供应商适配或完整渠道管理平台。

## Ranked Ideas

### 1. 独立“渠道测试”主模块，首屏就是一次可运行的测试台

**Description:** 在左侧新增一个主模块或在模型相关区域新增独立 tab，默认展示渠道选择、内置题库选择、运行按钮、结果摘要和响应体分析。首期只支持手动单次测试，不做定时巡检。

**Rationale:** 用户目标是主动验证渠道质量，不是查看历史用量。独立入口能避免和 `usage` 历史统计混淆，也符合 AgentNexus 已有“模型使用与成本”独立成模块的先例。

**Downsides:** 需要扩展 `MainModule`、Sidebar 和 Workbench 接线；如果真实“渠道配置”尚未落库，还需要先补最小渠道配置来源。

**Confidence:** 90%

**Complexity:** Medium

**Status:** Unexplored

### 2. 内置题库按请求规模和连续对话分层

**Description:** 首期题型固定为 4 类：小请求、中等请求、大请求、连续追问型。小请求用于测基础可用性和首字速度；中等请求用于测常规生成质量与耗时；大请求用于测长上下文、超时、截断和稳定性；连续追问型用于测多轮上下文承接、累计耗时和每轮首字表现。每个题型保留 1-2 个内置题目，题目声明测试目的和期望检查点，而不是只保存 prompt 文本。

**Rationale:** 用户关心的是渠道在不同负载和对话形态下的真实表现。按请求规模分层比按抽象能力分层更贴近“首字、用时、响应体分析”的目标，也更容易横向比较 GPT/Claude 等不同渠道。

**Downsides:** 大请求和连续追问型会增加测试耗时与成本；首期需要明确它们是用户主动选择的题型，不默认一次跑全量。

**Confidence:** 88%

**Complexity:** Low

**Status:** Unexplored

### 3. 结果摘要用四个硬指标：连接成功、首字时间、总耗时、响应完整性

**Description:** 每次测试生成标准摘要：是否成功、首字时间、总耗时、响应字数/token 估计不做强依赖、是否流式、是否截断/错误。分析结果用表格展示，建议列为：时间、模型、用时/首字、输入、输出；流式请求用行内标签标识；响应体、请求参数、错误详情和检查项放在展开行中，不遮挡关键判断。

**Rationale:** 用户明确关心首字、用时、响应体分析，并给出表格样式参考。表格能让多次测试、不同题型和不同渠道横向比较，四个硬指标足够支撑第一判断，也避免首期引入复杂评分模型。

**Downsides:** token 数如果渠道不返回 usage，首期不应估算；“首字”在非流式接口上只能退化为首响应时间。表格列不应过多，避免把首屏变成日志清单。

**Confidence:** 92%

**Complexity:** Low

**Status:** Unexplored

### 4. 响应体分析只做可解释检查，不做 AI 自动打分

**Description:** 对响应体做确定性分析：是否为空、是否包含错误 JSON、是否符合题目期望的 JSON 格式、是否出现拒答/明显错误状态、是否包含模型/usage/finish_reason 等元信息。结果以检查项列表展示。

**Rationale:** 这符合奥卡姆剃刀。首期用规则检查就能发现大多数渠道接入问题，不需要再调用一个模型做“评测模型”。

**Downsides:** 无法判断复杂语义质量；但语义评分可以留到后续 brainstorm，而不是首期必做。

**Confidence:** 86%

**Complexity:** Low

**Status:** Unexplored

### 5. 复用运行输出面板经验，记录请求/响应原文但默认隐藏敏感头

**Description:** 借鉴本地 Agent 翻译测试的输出面板，测试运行时实时显示流式片段和阶段状态；完成后可展开查看请求摘要、响应头、响应体、错误详情。API Key、Authorization 等字段默认脱敏。

**Rationale:** AgentNexus 已有“结果优先、技术日志次级”的交互经验。渠道测试天然需要排障信息，但不能让原始报文压过结论。

**Downsides:** 需要定义脱敏规则；如果渠道配置来自用户手填，需要避免把密钥持久化到测试记录里。

**Confidence:** 84%

**Complexity:** Medium

**Status:** Unexplored

### 6. 测试记录轻量持久化，支持同渠道最近几次对比

**Description:** 保存最近 N 次测试结果，字段包括渠道、模型、题目、时间、成功状态、首字时间、总耗时、错误原因和响应摘要。首期不做趋势图，只在结果区展示最近几次同渠道对比。

**Rationale:** 单次测试只能说明当下可用；最近几次对比能帮助用户判断“这次是否异常”。这和现有 usage 看板的历史统计相邻，但数据来源应独立。

**Downsides:** 需要新增表或本地存储结构；如果首期只做临时测试台，可把持久化延后。

**Confidence:** 78%

**Complexity:** Medium

**Status:** Unexplored

### 7. 最小双协议测试配置：OpenAI-compatible + Anthropic-compatible

**Description:** 首期支持用户选择 OpenAI-compatible 或 Anthropic-compatible。测试表单包含渠道类型、显示名称、Base URL、API Key、模型名、是否流式等字段；协议适配只覆盖 chat/messages 的最小请求和流式解析，不做完整供应商管理。

**Rationale:** 用户明确需要 Anthropic 协议支持，同时希望测试 gpt、claude 等不同渠道。OpenAI-compatible + Anthropic-compatible 是首期最小但可用的双协议范围，能覆盖主流测试场景，又避免把项目扩成通用 API 网关。

**Downsides:** 需要维护两套请求/响应/流式解析分支；但仍应拒绝 Gemini、WebSocket、私有协议等额外适配，除非后续明确进入新阶段。

**Confidence:** 88%

**Complexity:** Medium

**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | 直接并入模型使用与成本看板 | 现有 usage 是历史事实统计，新需求是主动测试，语义不同。 |
| 2 | 一期做定时巡检和告警 | 价值存在，但会引入调度、通知、失败去重和历史趋势，超出首期测试台。 |
| 3 | 一期做完整渠道管理平台 | 当前 API 模型尚未支持，应先用测试表单打通 OpenAI/Anthropic 双协议闭环。 |
| 4 | 用另一个 LLM 给响应质量打分 | 成本和不确定性高，且首期确定性检查已能解决接入排障。 |
| 5 | 做可编辑题库和题库市场 | 会把范围从测试能力扩展成内容管理；首期按小/中/大/连续追问四类内置题库即可。 |
| 6 | 强行估算 token 和成本 | 与本仓模型 usage 既有“缺失 model/token 不估算”口径冲突。 |
| 7 | 首期支持所有供应商协议 | 适配成本高；首期按用户要求覆盖 OpenAI-compatible 与 Anthropic-compatible 即可。 |
| 8 | 把响应体分析做成复杂评分算法 | 不够可解释，也不符合简单优先。 |

## Recommended Handoff

建议下一步进入 `ce:brainstorm`，优先围绕 Idea 1 + 2 + 3 + 4 + 7 收敛：

- 先决定入口：左侧独立模块还是模型设置下 tab。
- 先决定渠道来源：复用未来 API 模型配置，还是测试台内置最小临时配置；已明确测试时用户需要能手动输入模型、Base URL、Key。
- 首期验收只看：能选择 OpenAI-compatible 或 Anthropic-compatible，输入模型/Base URL/Key，选择小请求/中等请求/大请求/连续追问型题目，在表格中看到时间、模型、用时/首字、输入、输出，展开后可看响应体检查和错误排障信息。
- 测试记录持久化可作为二期，除非用户明确需要对比历史。

## Session Log

- 2026-05-02: Initial ideation — 24 candidates generated, 7 survived. Grounded in Sidebar module structure, Settings model workbench, local Agent test output flow, and existing model usage dashboard decisions.
- 2026-05-02: Refined scope — added Anthropic-compatible protocol support and explicit per-test channel inputs: model, Base URL, API Key, and channel type.
- 2026-05-02: Refined test bank taxonomy — replaced generic capability buckets with four user-specified types: small request, medium request, large request, and continuous follow-up.
- 2026-05-02: Refined result presentation — analysis results should use a table with time, model, duration/first-token, input, and output columns, with expandable row details.
