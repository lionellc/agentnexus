---
date: 2026-05-04
topic: channel-api-testbench
---

# 渠道 API 测试台需求

## Problem Frame

AgentNexus 当前已有模型使用与成本看板，但它分析的是历史调用事实；用户还缺少一个主动测试渠道质量的入口。新能力需要让用户手动选择协议和渠道参数，运行内置题库，并用表格对比首字、总耗时、输入、输出和响应体检查结果，从而快速判断某个 OpenAI-compatible、Anthropic-compatible 或 AWS Bedrock Converse Stream 渠道是否可用、是否慢、是否输出异常。

Bedrock 不能被简单当成 Anthropic-compatible 的一个 Base URL。它有独立的 region/model endpoint、Bearer Token 鉴权和 AWS event-stream 响应帧；如果把它混进兼容协议，会掩盖首事件、首字、Bedrock latency、usage 和 stream exception 等排障信息。本次扩展目标是把 Bedrock 作为第三协议纳入同一个渠道 API 测试台，而不是新增独立页面或完整 AWS 凭证管理系统。

## Requirements

**入口与范围**

- R1. 系统必须新增一个左侧独立模块作为“渠道 API 测试台”入口，不放在 Settings 或 Usage 的子 Tab 中。
- R2. 测试台必须定位为手动测试工具，当前范围不做定时巡检、告警、自动重试策略或完整渠道管理平台。
- R3. 测试台必须引入 Semi UI 组件库作为该模块的主要 UI 组件来源，表格、分页、表单、标签和展开行优先使用 Semi UI 能力。

**测试配置**

- R4. 用户必须能在每次测试前选择协议类型：OpenAI-compatible、Anthropic-compatible 或 AWS Bedrock Converse Stream。
- R5. 用户必须能为本次测试输入协议所需参数；OpenAI-compatible 和 Anthropic-compatible 使用模型、Base URL、API Key、流式开关，Bedrock Converse Stream 使用 region、model id、Bearer Token、max tokens 和 timeout。
- R6. 用户必须能选择是否使用 OpenAI-compatible 或 Anthropic-compatible 的流式请求；Bedrock Converse Stream 固定按流式测试处理，结果表格需要标识为流式。
- R7. 系统必须对 API Key、Authorization、Bearer Token 等敏感信息做默认脱敏展示，不能在结果表格、展开详情或历史记录中明文展示。

**内置题库**

- R8. 内置题库必须按四类题型组织：小请求、中等请求、大请求、连续追问型。
- R9. 小请求用于测试基础可用性和首字速度；中等请求用于测试常规生成质量与耗时；大请求用于测试长上下文、超时、截断和稳定性；连续追问型用于测试多轮上下文承接、累计耗时和每轮首字表现。
- R10. 当前范围内题库必须内置，不提供题库编辑、题库市场或自定义题库管理。
- R11. 用户必须能手动选择本次要运行的题型，不默认强制一次跑完全部题型。

**结果表格与分析**

- R12. 测试结果必须用表格展示，核心列为：时间、模型、用时/首字、输入、输出。
- R13. 表格行必须支持展开详情，展示请求摘要、响应体、检查项、错误信息和脱敏后的排障上下文。
- R14. 表格必须支持分页；当用户选择全量保留测试结果时，分页是主要浏览方式。
- R15. 每条测试结果必须至少记录成功状态、总耗时、首字时间、输入规模、输出规模、题型、协议类型、是否流式、错误原因。
- R16. 对非流式响应，首字时间必须明确退化为首响应时间，不伪装成真实流式首 token。
- R17. 如果渠道未返回 token usage，系统不得估算 token 或成本；输入/输出规模可用可解释的字符数或返回字段展示，并在文案中区分来源。

**响应体检查**

- R18. 响应体分析必须优先做确定性检查：空响应、错误 JSON、错误状态、截断、finish_reason、模型字段、usage 字段、题型期望格式是否满足。
- R19. 当前范围不得引入“再调用一个模型做质量评分”的 AI 自动打分能力。
- R20. 错误结果必须可排障：用户能从展开行看到协议类型、Base URL 摘要、模型、HTTP/协议错误、响应错误摘要和脱敏后的原始片段。

**历史记录**

- R21. 测试记录必须全量保留，关闭应用后仍可查看历史结果。
- R22. 历史记录必须支持分页浏览，并能按时间倒序查看。
- R23. 当前范围不要求趋势图、告警、批量导出或审计日志；这些只作为后续扩展。

**Bedrock Converse Stream**

- R24. Bedrock Converse Stream 的主表“首字”必须使用首个非空文本 delta；展开详情必须额外展示首个 Bedrock event、首个文本 delta、总耗时和 Bedrock 返回的 latency metadata（如果存在）。
- R25. Bedrock Converse Stream 的展开详情必须展示 event timeline 或等价事件摘要，至少能区分 message start、content delta、metadata、message stop 和 stream exception。
- R26. Bedrock Converse Stream 每次运行只发起一次实际调用；展开详情必须展示该次调用的实际请求体、响应过程/SSE 事件列表和实际响应体。
- R27. Bedrock 响应体检查必须覆盖空输出、usage 缺失、stop reason、metadata latency、event-stream 帧解析失败、Bedrock stream exception、region/model 相关错误和超时。

## Protocol Shape

| 协议 | 用户输入 | 请求形态 | 首字口径 | 详情补充 |
|---|---|---|---|---|
| OpenAI-compatible | 模型、Base URL、API Key、流式开关 | Chat Completions | 流式首个文本 delta；非流式为首响应 | SSE 事件、usage、finish reason |
| Anthropic-compatible | 模型、Base URL、API Key、流式开关 | Messages | 流式首个文本 delta；非流式为首响应 | SSE 事件、usage、stop reason |
| Bedrock Converse Stream | region、model id、Bearer Token、max tokens、timeout | Bedrock Converse Stream | 首个非空文本 delta | 首 event、Bedrock latency、usage、stop reason、event timeline |

## Result Table Shape

| 列 | 内容 | 说明 |
|---|---|---|
| 时间 | 测试发起时间 | 默认倒序 |
| 模型 | 用户输入的模型名 | 可显示协议/渠道标签 |
| 用时/首字 | 总耗时 + 首字/首响应时间 | 流式请求显示流式标签 |
| 输入 | 输入规模 | 不估算 token；优先展示真实 usage 或字符数口径 |
| 输出 | 输出规模 | 不估算 token；优先展示真实 usage 或字符数口径 |
| 展开行 | 响应体、检查项、错误详情 | 默认收起，避免首屏变成日志清单 |

## Success Criteria

- 用户能在左侧打开独立测试台，选择 OpenAI-compatible、Anthropic-compatible 或 AWS Bedrock Converse Stream。
- 用户能按协议输入必要参数：兼容协议使用模型/Base URL/API Key，Bedrock 使用 region/model id/Bearer Token/max tokens/timeout。
- 用户能运行小请求、中等请求、大请求、连续追问型中的任一题型。
- 测试完成后，表格中能看到时间、模型、用时/首字、输入、输出，并能分页查看历史记录。
- 展开结果行后，用户能看到响应体检查、错误摘要和脱敏排障信息。
- Bedrock 流式测试完成后，展开详情能看到首 event、首文本 delta、总耗时、Bedrock latency、usage/stop reason 和 event timeline 摘要。
- Bedrock 失败时，错误摘要能帮助用户区分鉴权、region/model、HTTP、超时、event-stream 解析和 stream exception 等失败类型。
- 缺失 token usage 时，页面不做 token 或成本估算。

## Scope Boundaries

- 不做全供应商协议适配；当前范围只覆盖 OpenAI-compatible、Anthropic-compatible 与 AWS Bedrock Converse Stream。
- 不做定时巡检、告警、自动重试、趋势图、导出、审计日志。
- 不做可编辑题库、题库市场或复杂评分算法。
- 不把测试记录混入现有模型使用与成本看板的历史调用事实口径。
- 不把 Bedrock 伪装为 Anthropic-compatible；Bedrock 必须作为独立协议展示和解释。
- 不做 AWS profile、Access Key/Secret Key、STS、IAM role assume、模型列表自动发现或 region 可用性自动发现；本轮扩展只支持用户手动输入 region、model id 和短期 Bearer Token。
- 不新增 Bedrock 专属页面；Bedrock 结果必须复用现有表格、展开详情、检查项和历史记录形态。

## Key Decisions

- 左侧独立模块：主动测试和历史用量统计语义不同，独立入口能降低误解。
- OpenAI + Anthropic + Bedrock 三协议：兼容协议覆盖 GPT/Claude 类主流测试场景，Bedrock 原生协议覆盖 AWS event-stream 和云厂商 latency 口径，同时仍避免全协议平台化。
- Bedrock 作为第三协议：Bedrock Converse Stream 的鉴权、endpoint、event-stream 帧和 metadata 与 Anthropic-compatible 不同，独立协议能减少误判。
- Bearer Token 快测：本轮扩展只支持短期 Bearer Token，避免把测试台扩大成 AWS 凭证管理器。
- Bedrock 详情不占首屏：主表继续保持统一列，Bedrock 专属的 first event、latency metadata 和 event timeline 放在展开详情。
- 四类题型：按请求规模和对话形态组织，更贴近首字、耗时、响应体分析目标。
- 表格 + 展开行 + 分页：匹配用户给出的结果形态，既能扫多次测试，也能展开排障。
- 全量保留：用户明确选择全量历史记录，分页成为当前范围的必须能力。
- Semi UI：本次功能引入 Semi UI，测试台优先使用其表格、分页、表单、标签和展开行组件。

## Dependencies / Assumptions

- 当前仓库已有 `usage` 模块和 `model_usage` 历史事实分析，但本功能应作为独立主动测试能力。
- 渠道 API 测试台已存在 OpenAI-compatible 与 Anthropic-compatible 基础能力，Bedrock 是对同一测试台的协议扩展，不是新模块。
- 当前协议类型仍只覆盖 OpenAI-compatible 与 Anthropic-compatible；Bedrock 需要被显式加入协议选择和结果口径。
- 用户具备可用于 Bedrock runtime 的短期 Bearer Token；如果只具备 AWS profile 或 IAM role，本轮扩展不覆盖。
- Bedrock 只按 Converse Stream 讨论；非流式 Converse、InvokeModel 或其他 Bedrock API 不在本轮需求范围内。

## Alternatives Considered

- **把 Bedrock 当 Anthropic-compatible 使用。** 拒绝，因为它会隐藏 Bedrock 的 region endpoint、Bearer Token、AWS event-stream 和 latency metadata 差异。
- **只导入外部脚本 JSON。** 作为过渡可行，但不能满足“在测试台中直接测试 Bedrock”的目标。
- **新增 Bedrock 专属页面。** 拒绝，因为现有测试台已经有统一表格、展开详情、检查项和历史记录；单独页面会增加认知和维护成本。
- **引入完整 AWS 凭证体系。** 拒绝，因为这会把主动测试工具扩成凭证管理工具，超出当前目标。

## Outstanding Questions

### Resolve Before Planning

- None.

### Deferred to Planning

- [Affects R5-R7][Technical] API Key/Bearer Token 在本地仅内存使用、运行期间状态保存和页面刷新后的清空策略。
- [Affects R14-R22][Technical] 全量保留测试记录的存储结构、分页查询和清理策略。
- [Affects R16-R18][Technical] OpenAI-compatible 与 Anthropic-compatible 的流式事件解析细节。
- [Affects R24-R27][Technical] Bedrock AWS event-stream 帧解析、错误事件归类和 timeline 存储结构。

## Next Steps

-> `/ce:plan docs/brainstorms/2026-05-02-channel-api-testbench-requirements.md` for structured implementation planning.
