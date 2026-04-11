---
date: 2026-04-11
topic: local-agent-translation-workbench
---

# Local Agent Translation Workbench Requirements

## Problem Frame
AgentNexus 已完成本地 Agent 接入与 Prompt 翻译闭环，但当前交互仍存在割裂：设置页测试流与 Prompt 详情翻译流语义不一致、结果与技术日志混在同一层、运行阶段缺少清晰状态反馈。目标是在不引入额外云 API Key 的前提下，重构 Prompt 翻译交互为“单主路径、结果优先、状态可见”，同时保持已有译文资产语义与执行安全边界。

## Requirements

**工作台与模型来源**
- R1. 在设置中新增 AI 模型工作台，支持将“本地 Agent”作为模型来源选项。
- R2. 本地 Agent 需内置 `codex`、`claude` 两种预设，并允许用户新增自定义本地 Agent。
- R3. 自定义本地 Agent 的配置格式为“可执行程序 + 参数模板”，禁用整行 shell。
- R4. 翻译调用 Prompt 模板采用全局单模板配置（V1 不做按场景或按 Prompt 覆写）。

**Prompt 翻译体验**
- R5. V1 翻译入口位于 `Prompts` 编辑区，由用户手动点击触发（不自动翻译）。
- R6. V1 翻译场景先支持“翻译”，暂不纳入“总结”等其他场景。
- R7. 目标语言在翻译入口使用预置语言下拉；当已有历史译文语言不在预置列表时需可回显并可选。
- R8. 翻译结果支持两种应用方式：覆盖原文、沉浸式翻译；沉浸式翻译形态为行内双语。
- R9. Prompt 编辑区采用单主路径翻译交互（场景动作条 + 文本工作区），不再依赖独立右侧翻译侧栏。

**交互体验重构（本轮新增）**
- R19. Prompt 详情翻译主操作区采用固定动作顺序：`目标语言 -> 翻译 -> 查看运行输出 -> 应用译文`，避免并行分叉操作路径。
- R20. 翻译反馈采用“结果优先、日志次级”：先展示业务结果卡（成功/失败/下一步），`stdout/stderr` 放在侧边抽屉用于技术排障。
- R21. 翻译流程必须展示显式阶段状态（`Idle -> Running -> Reviewing -> Applied` 或等价状态机），并持续显示运行耗时。
- R22. Running 状态下不阻塞页面基础浏览；运行输出抽屉支持垂直滚动、流式追加和自动滚动到最新内容。
- R23. Prompt 主编辑区默认只承载“当前译文 + 当前操作”；历史译文列表与版本管理放入二级层级，降低编辑区噪音。
- R24. Settings 的“翻译场景测试”和 Prompts 详情页的翻译交互需复用一致的视觉语义（动作区、状态提示、结果卡层级）。

**译文资产与版本语义**
- R10. 译文必须按 `Prompt版本 + 目标语言` 持久化，原文更新后旧版本译文保留。
- R11. 当同一 `Prompt版本 + 目标语言` 已存在译文，再次翻译需弹窗让用户选择“覆盖”或“另存新译文”。
- R12. 用户可直接查看既有译文，或对既有译文重新翻译。

**执行安全、失败语义与验证**
- R13. 本地 Agent 翻译执行采用严格安全模式：仅允许文本处理，不允许文件读写或工具命令执行。
- R14. 本地 Agent 输出按严格 JSON 解析；不符合协议即视为失败。
- R15. 当本地 Agent 不可用（未安装/未登录/命令失败）时，直接失败并给出可操作修复提示，不自动回退云模型。
- R16. AI 模型工作台需提供“测试本地 Agent 翻译”能力（测试输入 + 执行结果）。
- R17. V1 仅支持 Tauri 桌面端。

**审计**
- R18. 提供最小调用审计：至少记录触发时间、Prompt 版本、目标语言、所用本地 Agent、结果状态（成功/失败）。

## Success Criteria
- 用户可在 AI 模型工作台选择本地 Agent（内置或自定义）并成功完成一次翻译测试。
- 用户可在 Prompt 编辑区通过单主路径完成一次翻译，并在同一主区域查看译文与下一步动作。
- 同一 Prompt 在不同版本下的同一语言译文可独立查看，互不覆盖。
- 对已有 `Prompt版本 + 目标语言` 再次翻译时，系统会要求用户选择“覆盖”或“另存新译文”。
- 本地 Agent 异常时，用户可看到明确失败原因与下一步修复指引。
- 用户在翻译进行中可看到明确阶段状态与耗时，且运行输出可实时刷新与查看。

## Scope Boundaries
- V1 不做“本地 Model”能力，仅做“本地 Agent”接入。
- V1 不做自动翻译触发（如保存后自动翻译）。
- V1 不做云模型自动兜底。
- V1 不做 Web 端可用性，限定桌面端。
- V1 不把“总结”等新场景纳入首批交付。

## Key Decisions
- 本地 Agent 是模型来源选项，不与本地 Model 混淆。
- 翻译入口优先放在 Prompt 编辑区，先做最短业务闭环。
- 输出解析采用严格 JSON，优先确保可控与可审计。
- 安全策略采用严格模式，优先降低本地执行风险。
- 翻译结果作为一等资产与 Prompt 版本绑定。
- 交互重构采用 `Scenario Action Bar`（单主路径）+ `Result First, Logs Second`（双层反馈）+ 显式状态机（阶段可见）。

## Dependencies / Assumptions
- 用户本机已安装并可调用目标 Agent（如 codex/claude）且具备可用会话。
- 桌面端运行环境可稳定执行本地命令并回收标准输出。

## Outstanding Questions

### Resolve Before Planning
- 无。

### Deferred to Planning
- [Affects R2,R3][Technical] 内置 `codex` / `claude` 预设命令模板的占位符协议与参数映射细则。
- [Affects R14][Technical] 严格 JSON 协议的字段定义、错误码分层与 UI 错误文案规范。
- [Affects R18][Technical] 审计记录在现有数据结构中的落库位置、查询入口与保留策略。
- [Affects R11][Needs research] “另存新译文”的命名与列表排序策略，避免用户在同语言多译文下混淆。
- [Affects R21,R22][Technical] 前端状态机阶段与后端流式事件（lifecycle/stdout/stderr）映射口径、超时与中断语义。

## Next Steps
-> /ce:plan for structured implementation planning
