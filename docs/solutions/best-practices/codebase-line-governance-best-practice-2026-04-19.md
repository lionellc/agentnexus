# Codebase Line Governance Best Practice (2026-04-19)

## 背景

本仓库在治理前存在多处业务超长文件，且集中在壳层编排与 Tauri control-plane。单纯“切文件”不能解决复杂度问题，必须把职责边界、依赖方向和测试证据一起收敛。

## 核心原则

1. 规则先行，重构后置
- 先落地门禁脚本、allowlist、workflow，再进行结构拆分。
- 没有门禁的“治理”会被后续提交快速回退。

2. 按职责拆分，不按行数拆分
- 前端：壳层编排 / controller hook / 展示组件分层。
- Rust：command API / domain logic / persistence helper 分层。
- 避免“中间壳文件”只做转发、无明确语义。

3. 兼容面稳定优先
- Tauri `#[tauri::command]` 名称和参数契约保持不变。
- 前端 invoke 和 store selector 契约先保持，内部模块化重排。

4. 测试与结构同步演进
- 每次拆分至少补一类对口验证：
  - 命令导出/注册一致性
  - 模块切换/关键动作回归
  - 失败路径可恢复性

## 推荐拆分策略

## 前端（Workbench）

- 第一步：抽模块 controller（prompts/skills/agents/settings）。
- 第二步：把 module-specific state/effect/handler 下沉到 controller。
- 第三步：壳层仅保留：
  - 全局布局与路由切换
  - 跨模块共享的少量状态注入
  - 顶层基础能力（如全局 toast、主题/语言）

## Rust（control_plane）

- 第一步：按命令域拆 `commands.rs`。
- 第二步：对重逻辑文件拆目录模块：
  - `skills_manager`: api, diff_worker, batch_ops, rules, fs_ops
  - `skills_usage`: api, parser/extractor, persistence, jobs
  - `local_agent_translation`: profile, config, executor, validation
  - `agent_rules_v2`: api, publish, apply, normalize
- 第三步：`db` 与 `domain/models` 目录化并 re-export 保持对外路径稳定。

## 评审清单（防伪拆分）

- 职责是否更清晰：每个新文件是否有单一职责描述。
- 依赖是否更干净：是否减少跨域引用和循环依赖风险。
- 行为是否稳定：是否保留关键接口签名与返回字段。
- 测试是否对应：是否有覆盖 happy/edge/error/integration 的最小证据。
- 门禁是否可执行：`npm run check:line-governance` 是否在本分支持续通过。

## 反模式

- 为了过阈值把一个函数拆成多个文件，但状态与副作用仍由同一入口耦合管理。
- 在拆分中顺便引入新业务能力，导致回归定位困难。
- 只跑单元测试，不验证前端到命令层的关键集成链路。

## 交付证据模板

- 改动范围：
  - 拆分前文件与行数
  - 拆分后模块结构
- 契约稳定性：
  - 保持不变的 command 名称/输入输出字段
- 验证命令：
  - `npm run check:line-governance`
  - `npm run typecheck`
  - 关键回归测试命令
  - `cargo check` / 相关 Rust 测试

## 维护建议

- 每周检查 allowlist `reviewBy` 到期项，逐步收回临时豁免。
- 把 line-governance job 设为 required check，不接受例外“口头批准”。
- 大文件再次接近阈值时，优先增量抽取 controller/service，不等待再次超限后重构。
