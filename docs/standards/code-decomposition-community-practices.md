# Code Decomposition Community Practices

## Purpose

本规范用于约束 AgentNexus 的“拆分、抽取”动作，确保行数治理不是简单搬文件，而是与社区最佳实践一致的结构治理。

适用范围：
- 前端业务源码：`src/**`
- Rust/Tauri 业务源码：`src-tauri/src/**`

## Global Rules

- 必须先定义职责边界，再实施拆分；禁止先拆后想。
- 拆分后必须降低耦合（依赖方向更单向、跨模块引用更少）。
- 拆分后必须有验证证据（单元、集成、回归至少覆盖适用类别）。
- 拆分评审必须可追溯：PR 说明中写明“边界、收益、风险、验证”。

## Frontend (React/TypeScript) Rules

### Required

- 组件与 Hook 保持纯度，避免在渲染阶段产生副作用。
- 按功能域组织（feature-first），避免跨域杂糅。
- 共享逻辑优先抽为自定义 Hook，而不是复制粘贴。
- 容器组件负责编排，展示组件负责渲染，边界清晰。
- 状态与副作用就近归属：局部状态不应上浮到全局壳层。

### Anti-patterns

- 仅按“视觉区块”拆文件，状态与副作用仍耦合在同一超大文件。
- 无边界地将 UI helper 放进全局 util，导致反向依赖。
- 为了过行数限制而拆出“无语义中间层”文件。

## Rust/Tauri Rules

### Required

- 命令入口层保持薄层：参数校验与调度，不承载大块业务逻辑。
- 领域逻辑与持久化访问分层，避免命令函数直接堆 SQL/IO 细节。
- 模块按业务能力拆分，保持内聚；跨模块通过明确接口交互。
- 错误语义统一，避免同类错误在不同模块返回不同结构。
- 优先使用 Rust 模块拆分惯例（`mod.rs` + 子模块文件）。

### Anti-patterns

- 单个 `control_plane/*.rs` 同时包含 API、业务规则、IO、任务调度。
- 通过 `pub` 暴露过多内部函数，导致模块边界失效。
- 复制现有命令实现作为“新模块”，逻辑重复但没有抽象收敛。

## PR Checklist (Must Answer)

每次拆分 PR 必须逐项回答：

1. 本次拆分前后的职责边界是什么？
2. 依赖方向是否更简单？新增了哪些跨模块依赖？
3. 拆分后是否移除了重复逻辑或副作用耦合点？
4. 哪些行为可能受影响？如何验证它们不回归？
5. 是否存在“伪拆分”风险（行数下降但复杂度未降）？如何证明不是？

## Evidence Requirements

- 测试证据：列出新增/更新测试文件与覆盖的场景类型（happy/edge/error/integration）。
- 结构证据：列出拆分前后关键文件职责对照。
- 风险证据：列出本次已知风险和回滚点。

## References

- React: Components and Hooks must be pure  
  https://react.dev/reference/rules/components-and-hooks-must-be-pure
- React: Reusing logic with custom Hooks  
  https://react.dev/learn/reusing-logic-with-custom-hooks
- Rust Book: Separating modules into different files  
  https://doc.rust-lang.org/book/ch07-05-separating-modules-into-different-files.html
- Tauri: Calling Rust from the frontend  
  https://v2.tauri.app/develop/calling-rust/
