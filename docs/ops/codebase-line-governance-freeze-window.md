# Codebase Line Governance Freeze Window

## Goal

在一次性治理阶段，通过冻结窗口降低并行改动干扰，确保“行数达标 + 结构治理 + 契约收敛”可原子交付。

## Window Policy

- 冻结窗口期间，`main` 只接收本治理计划相关改动。
- 非治理需求（新功能、体验改版、无关修复）统一延期。
- 若出现线上紧急修复，必须走例外流程并记录到治理日报。

## Entry Criteria

- 行数治理计划已评审通过（requirements + plan）。
- 门禁脚本、allowlist、CI workflow 已在分支可执行。
- 已输出当前超长文件清单和目标清单。

## Exit Criteria

- 业务源码不存在 `>1000` 文件。
- 非 allowlist 业务源码不存在 `>500` 文件。
- allowlist 条目均有 `owner/reason/reviewBy`，且通过评审。
- 核心回归测试通过，切换检查清单完成。

## Allowed Changes During Freeze

- 仅允许以下类型：
  - 文件拆分、模块抽取、边界重排
  - 与治理强相关的小幅行为修正
  - 测试补齐与门禁脚本修正
- 禁止以下类型：
  - 新业务能力引入
  - 大范围 UI redesign
  - 与治理无关的架构改造

## Daily Execution Checklist

1. 更新超长文件基线和剩余清单。
2. 确认当天合入项均符合社区实践检查清单。
3. 跑一轮关键回归测试。
4. 记录风险、阻塞项和次日拆分计划。

## Exception Process

- 触发条件：线上 P0/P1 事故或阻塞级别安全修复。
- 处理步骤：
  1. 负责人确认“必须中断冻结”。
  2. 独立分支处理紧急修复并最小范围合入。
  3. 修复后恢复冻结，并更新治理计划依赖关系。

## Commands

```bash
# 全量检查（用于切换验收）
npm run check:line-governance
```

```bash
# 变更检查（用于日常开发）
npm run check:line-governance:changed
```

```bash
# 门禁脚本契约测试
npm run test:line-governance
```
