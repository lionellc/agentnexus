---
date: 2026-04-11
topic: prompts-category-favorites-browsing
---

# Prompts Category/Favorites Browsing Requirements

## Problem Frame
Prompts 模块当前已支持 `category` 与 `favorite` 的编辑与批量操作，但用户仍只能通过全文搜索浏览列表，缺少“按分类浏览”和“按收藏夹浏览”的一等入口，导致高频 Prompt 回访与结构化查找成本高。

## Terminology
- `Favorites` 指单一布尔收藏集合（`favorite=true`），非多收藏夹容器。
- `All` 指 Prompts 全量浏览域；`全部分类` 指 `Categories` 视角下的分类根节点，两者不等价。
- “域内搜索”指关键词搜索只作用于当前浏览域，不跨域扩展结果。

## Requirements

**浏览入口与信息架构**
- R1. Prompts 顶部提供浏览视角切换：`All`、`Categories`、`Favorites`。
- R2. 首次进入 Prompts 默认落在 `All` 视角，保持现有使用习惯与兼容性。
- R2.1 若存在同一 workspace 的有效持久化上下文，则优先恢复；仅无有效持久化时默认 `All`。
- R3. `Categories` 视角采用“两栏结构”：左栏分类导航，右栏 Prompt 列表。
- R4. 分类导航至少包含：`全部分类`、`未分类`、动态分类项（来自现有 Prompt 的 category 值）。
- R4.1 分类值按归一化规则聚合：`trim + lowercase`，`空字符串/NULL/default` 统一归入 `未分类`。
- R5. `Favorites` 视角为一等入口，不作为“仅看收藏”临时开关存在。

**筛选与列表行为**
- R6. `All` 视角保持当前列表语义，并允许 `category` 结构化筛选；`favorite` 筛选仅在 `Favorites` 视角生效。
- R7. `Categories` 视角下，列表必须按选中分类过滤，并与关键词搜索联动（域内搜索）。
- R8. `Favorites` 视角下，列表必须固定 `favorite=true`，并与关键词搜索联动（域内搜索）。
- R9. 列表结果区需展示当前浏览上下文（如：`Categories > writing`、`Favorites`），并支持一键回到 `All`。
- R10. 切换 `All/Categories/Favorites` 时，列表视图类型（list/gallery/table）保持用户当前选择。

**操作闭环与反馈**
- R11. 批量收藏成功后，系统提供“前往 Favorites 查看”快捷动作（非强制跳转）。
- R12. 批量移动分类成功后，系统提供“前往目标分类查看”快捷动作（非强制跳转）。
- R13. 分类为空、收藏夹为空时，空态必须给出可执行下一步（创建 Prompt / 回到 All / 清除搜索条件）。

**状态持久化与一致性**
- R14. 浏览上下文（当前视角、当前分类）在同一 workspace 下本地持久化，重开应用后恢复。
- R14.1 当恢复的分类不存在时，自动回退到 `Categories > 全部分类`，并保留当前搜索词。
- R15. 查询链路需接通结构化筛选字段，确保前端筛选语义与查询契约一致（`category`、`favorite`）。

**质量保障**
- R16. 新增测试覆盖：视角入口可达、分类浏览、收藏夹浏览、域内搜索、空态、视角切换状态保持。
- R17. 现有能力不得回归：单条收藏切换、批量收藏/取消收藏、批量移动、批量删除、详情编辑保存。

## Success Criteria
- 点击次数从 Prompts 页面加载完成后的初始可交互状态开始计数。
- 用户可在 2 次点击内进入任一分类并看到该分类 Prompt 列表。
- 用户可在 1 次点击内进入 Favorites 并完成域内搜索。
- 在 `Categories/Favorites` 视角下，搜索结果不混入域外 Prompt。
- 视角切换不破坏现有 list/gallery/table 使用习惯。
- 相关回归测试覆盖新增浏览能力，且不破坏现有批量操作链路。

## Scope Boundaries
- V1 不引入多收藏夹（仅保留单一 `favorite` 语义）。
- V1 不引入分类树的手工层级管理（仅基于现有 category 值聚合展示）。
- V1 不做跨模块统一导航（仅落在 Prompts 模块内）。
- V1 不做全量路由重构。
- V1 不提供可分享 URL 深链接（view/category/search 仅做本地状态恢复）。

## Key Decisions
- 采用“视角入口”而非“额外筛选按钮堆叠”。
- 收藏必须是可浏览入口，不只是操作状态。
- 分类浏览与收藏浏览都采用“先定域，再搜索”的交互语义。
- 批量操作后的浏览跳转为可选动作，避免强制打断。
- 分类导航排序采用“按分类名字母序（升序）”，同名归并后按单项展示。
- `未分类` 统一包含空字符串、`NULL`、`default` 三种历史值。

## Dependencies / Assumptions
- Prompt 数据继续使用现有字段：`category: string`、`favorite: boolean`。
- Prompts 模块继续在单页工作台内承载，不拆独立子应用。

## Outstanding Questions

### Resolve Before Planning
- 无。

### Deferred to Planning
- [Affects R14][Technical] 视角状态持久化 key 命名与 workspace 级隔离策略。
- [Affects R15][Technical] 前端本地过滤与查询接口调用的优先级与一致性方案。
- [Affects R16][Technical] 测试夹具构造与跨视角断言复用方式。

## Next Steps
-> /ce:plan for structured implementation planning
