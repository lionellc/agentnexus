---
date: 2026-04-11
topic: prompts-category-favorites-browsing
focus: "Prompts 模块重构分类、收藏功能，让用户可从分类视角与收藏夹视角浏览 Prompt 列表"
---

# Ideation: Prompts 分类与收藏可浏览化重构

## Codebase Context
- 项目形态为 `React + Vite + TypeScript + Tailwind` 前端与 `Tauri + Rust` 本地能力组合，Prompts 主交互集中在 `src/app/WorkbenchApp.tsx`。
- Prompt 数据模型已具备 `category` 与 `favorite` 字段，且 `PromptSearchInput` 已定义 `category?`、`favorite?`，具备筛选契约基础。
- 当前列表过滤逻辑仅按 `name/content/tags + keyword`，没有把 `category/favorite` 接入浏览过滤链路。
- 顶部交互仅有搜索、新建、刷新、视图切换；缺失“分类入口/收藏夹入口”导航位。
- 现有分类与收藏主要表现为“编辑属性与批量操作”，不是“可浏览入口”。
- 测试覆盖批量收藏/批量移动/行内收藏翻转，但未覆盖“按分类浏览”与“按收藏夹浏览”路径。
- `docs/solutions/` 目前没有可直接复用的历史方案；现有可借鉴文档主要是交互层级思路，不含收藏夹正向方案。
- Slack tools detected. Ask me to search Slack for organizational context at any point, or include it in your next prompt.

## Ranked Ideas

### 1. 双视角导航壳（分类视角 / 收藏夹视角）
**Description:** 在 Prompts 顶部新增浏览视角切换，把当前“统一列表”拆成 `All / Categories / Favorites` 三个一等入口；列表组件复用，数据过滤策略按视角切换。  
**Rationale:** 直接补齐“有分类和收藏能力但无浏览入口”的核心断层，同时保持现有页面结构与成本可控。  
**Downsides:** 需要重新定义列表状态机（视角、分页、查询、选中）的优先级，短期状态管理复杂度上升。  
**Confidence:** 94%  
**Complexity:** Medium  
**Status:** Explored

### 2. 左侧分类导航（树/分组）联动右侧列表
**Description:** 在分类视角启用左侧分类导航区（可先做平铺分组，后续升级树），点击分类后右侧 Prompt 列表进入域内浏览。  
**Rationale:** 让分类从“字段值”变成“信息架构”，显著降低大规模 Prompt 库的定位成本。  
**Downsides:** 需要处理未分类、空分类、分类重命名与数据同步细节。  
**Confidence:** 90%  
**Complexity:** Medium  
**Status:** Unexplored

### 3. 收藏夹一等入口（Favorites Lens）
**Description:** 新增收藏夹入口页签，默认 `favorite=true`，并支持在收藏域内继续关键词/tag 搜索。  
**Rationale:** 把收藏从“动作结果”升级为“高频工作入口”，提升回访效率。  
**Downsides:** 需要明确收藏域与全局域之间的行为一致性（排序、空态、批量操作）。  
**Confidence:** 92%  
**Complexity:** Low  
**Status:** Unexplored

### 4. 接通结构化筛选链路（PromptSearchInput 直连）
**Description:** 将 `category/favorite` 正式接入查询与前端筛选状态，形成 `view-context + keyword + tags` 的组合过滤。  
**Rationale:** 复用已存在的数据类型与接口契约，属于低风险高收益补齐。  
**Downsides:** 需要统一前端本地过滤与后端搜索调用策略，避免双通道结果不一致。  
**Confidence:** 95%  
**Complexity:** Low  
**Status:** Unexplored

### 5. 操作到浏览的闭环跳转
**Description:** 批量收藏后提供“前往收藏夹查看”，批量移动分类后提供“前往目标分类查看”，并高亮变更对象。  
**Rationale:** 把“执行操作”与“验证结果”打通，减少重复检索与认知中断。  
**Downsides:** 需要处理跨页数据刷新与高亮失效的边界。  
**Confidence:** 86%  
**Complexity:** Medium  
**Status:** Unexplored

### 6. 路由即视角 + 浏览状态持久化
**Description:** 以路由或本地状态表达浏览上下文（如 `favorites`、`category/:id`），重开应用后恢复用户上次视角与分类。  
**Rationale:** 提升跨会话连续性，并为未来 Prompt/Skill/Spec 一体化导航提供统一模式。  
**Downsides:** 需要校验当前单页结构下的路由接入成本与兼容性。  
**Confidence:** 81%  
**Complexity:** Medium  
**Status:** Unexplored

### 7. 浏览能力测试基线补齐
**Description:** 新增测试覆盖分类浏览入口、收藏夹入口、视角切换、组合过滤与空态行为。  
**Rationale:** 当前回归网聚焦编辑/批量操作，无法保护本次“浏览入口重构”的核心价值。  
**Downsides:** 测试文件会明显增长，需要维护稳定的测试夹具与数据。  
**Confidence:** 93%  
**Complexity:** Low  
**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | 分类看板（按分类多列拖拽） | 实现与交互成本偏高，当前阶段超出“先补浏览入口”目标。 |
| 2 | 收藏夹升级为可命名多集合 | 方向成立但会扩张数据模型范围，先完成单收藏夹入口更务实。 |
| 3 | Lens 通用透镜系统（抽象层） | 概念完整但过早抽象，当前问题可用更直接的视角切换解决。 |
| 4 | 分类聚合卡片首页 | 与“分类导航联动列表”目标重叠，信息密度不足。 |
| 5 | 仅新增“仅看收藏”开关 | 价值有限，弱于“收藏夹一等入口”且可被后者覆盖。 |
| 6 | 仅新增分类 Chip 过滤条 | 能补洞但不形成稳定浏览心智，弱于“分类视角入口”。 |
| 7 | 双入口主页（先选分类域/收藏域） | 与双视角导航壳高度重复，保留更轻量版本。 |
| 8 | 分类/收藏面包屑（独立提案） | 属于细化增强，依赖主视角方案落地后再评估。 |
| 9 | 收藏夹内自动智能分组 | 价值存在但缺乏当前仓库可验证信号，优先级后置。 |
| 10 | 空结果页引导跳转分类/收藏 | 可作为交互细节并入主方案，不单列为核心方向。 |
| 11 | 顶部栏仅做最小按钮补丁 | 过于战术，容易演化为入口碎片化。 |
| 12 | docs/solutions 先行文档化 | 这是交付动作不是产品改进本体，放到实施阶段执行。 |
| 13 | 批量操作后自动强制跳转 | 强制行为可能打断流程，保留“可选跳转”更稳健。 |
| 14 | 全量改造成新路由体系先行 | 风险偏高，适合在视角方案验证后第二阶段推进。 |

## Session Log
- 2026-04-11: Initial ideation — 40 candidates generated, 24 after dedupe, 7 survivors kept
- 2026-04-11: Fresh ideation file created for prompts category/favorites browsing focus
- 2026-04-11: Selected idea for brainstorming — #1 双视角导航壳（分类视角 / 收藏夹视角）
- 2026-04-11: Brainstorm requirements drafted at `docs/brainstorms/2026-04-11-prompts-category-favorites-browsing-requirements.md`
