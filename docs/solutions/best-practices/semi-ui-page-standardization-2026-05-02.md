---
title: Semi UI 页面标准化实践
date: 2026-05-02
category: best-practices
module: agentnexus-workbench
problem_type: best_practice
component: frontend-ui
severity: medium
applies_when:
  - 新增或迁移 Workbench 页面交互组件
  - 页面同时涉及主题、语言、表格、弹层或 Toast
tags: [semi-ui, workbench, frontend, theme, i18n, regression-safety]
root_cause: inconsistent_ui_foundation
resolution_type: workflow_improvement
related_components:
  - shared-ui
  - workbench-shell
  - testing_framework
---

# Semi UI 页面标准化实践

## Context
AgentNexus 已接入 `@douyinfe/semi-ui-19`，应用根部通过 `SemiAppProvider` 统一 Semi locale 与主题入口。旧页面仍可保留 Tailwind 做布局，但交互控件应优先使用 Semi 或 `src/shared/ui` 中的 Semi 适配层，避免按钮、选择器、弹层、表格和空状态在不同页面继续分叉。

## Component Choice
- 新页面优先从 `src/shared/ui` 导入 `Button`、`Input`、`Select`、`Dialog`、`Sheet`、`Toast`、`Card`、`Tag` 等基础组件。
- 当页面需要 Semi 原生能力，例如 `Table`、`Modal`、`Switch`、`Checkbox`、`Empty`，可以直接使用 `@douyinfe/semi-ui-19`，但不要再包局部 `LocaleProvider`。
- `ECharts`、Markdown 编辑器、diff viewer、富文本编辑器等专用渲染器不强行替换，只统一外层按钮、弹层、表格和状态提示。
- 不为一次性页面新增通用封装；只有跨模块重复出现的能力才进入 `shared/ui`。

## Theme And Locale
- 语言继续使用现有 `l(zh, en)`，新增用户可见文案必须同时给中文和英文。
- 主题由 Workbench 状态同步到 `document.documentElement` 的 `.dark` / `data-theme`，并同步到 `body[theme-mode]` 给 Semi 组件使用。
- 页面组件不要自己维护第二套语言或主题状态；设置页切换后，Shell、Usage、Channel Testbench 等模块应立即跟随。

## Tables And Empty States
- 数据表格优先使用 Semi `Table`；需要列设置、行选择或行操作时，使用 `DataTable` 保持导入路径和行为兼容。
- 游标分页或业务分页可以保留现有按钮逻辑，表格承载层仍使用 Semi `Table`。
- 空数据优先使用 Semi `Empty` 或 `EmptyState`，并保留原有下一步引导文案。
- 展开详情、长 JSON、归因报告等宽内容必须限制在主容器内滚动，不能撑破页面。

## Dialogs, Drawers, Toast
- 弹窗、抽屉和 Toast 优先走 `shared/ui` 适配层，保持原受控接口和回调语义。
- 错误 Toast 仍使用 destructive/danger 语义；不要只靠颜色表达错误状态，正文必须说明失败原因。
- 迁移弹层时先锁住打开、关闭、取消、确认和 loading 行为，再替换底层组件。

## Verification
最小回归组合按改动面选择：

```bash
npm run typecheck
```

```bash
npm run test:run -- src/app/WorkbenchApp.settings.test.tsx src/app/WorkbenchApp.prompts.test.tsx src/app/WorkbenchApp.agents.test.tsx
```

数据页或测试台改动时补充：

```bash
npm run test:run -- src/features/usage/components/__tests__/RequestDetailTable.test.tsx src/features/usage/components/__tests__/UsageDashboard.test.tsx src/features/usage/module/UsageModule.test.tsx src/features/channel-test/module/ChannelApiTestModule.test.tsx src/features/channel-test/components/ChannelTestForm.test.tsx src/features/channel-test/components/ChannelTestResultsTable.test.tsx src/features/channel-test/components/ChannelTestCaseManager.test.tsx src/features/common/components/DataTable.test.tsx
```

完成标准：主题和语言入口不分叉，用户可见文案双语，表格/弹层/Toast 行为测试通过，且没有为了迁移引入未使用抽象。

## Related
- `docs/plans/2026-05-02-003-refactor-semi-page-standardization-plan.md`
- `docs/solutions/best-practices/workbenchapp-modularization-best-practice-2026-04-14.md`
