---
title: AgentNexus macOS 公证长时间 In Progress 与 GitHub 6h 超时发布策略
date: 2026-04-13
category: workflow-issues
module: release-pipeline
problem_type: workflow_issue
component: tooling
severity: high
applies_when:
  - 使用 GitHub-hosted runner 发布 macOS 应用并依赖 Apple notarization
  - notarization 长时间保持 In Progress
  - 单次 workflow 需要等待 notary 结果并执行 staple
tags: [apple-notary, github-actions, macos-release, tauri, notarization, self-hosted-runner]
---

# AgentNexus macOS 公证长时间 In Progress 与 GitHub 6h 超时发布策略

## Context
AgentNexus 在 macOS 发布流水线中出现 Apple notarization 长时间 `In Progress`，导致 `.github/workflows/release.yml` 在 notary wait 阶段长时间停留，最终触发 GitHub-hosted job 的 6 小时硬上限并失败。

该仓近期持续维护 release/notarization 流程，问题属于同一发布链路演化上下文 (auto memory [claude])。

会话历史中反复出现以下现象（session history）：
- 多个 submission（含 `3466922c-9bcc-4353-8110-875a925765b2`、`de04059a-791c-4af7-becc-4ced5809ce2e`）持续数小时到接近一天仍为 `In Progress`。
- 反复 rerun 会不断新增 submission，队列堆积，无法提升单次成功率。
- 某些时段 `notarytool log` 对 `In Progress` submission 返回 `Submission log is not yet available`。

## Guidance
采用“提交与等待解耦”的发布策略：

1. 提交流水线（submit）
- 只负责 build/sign/submit。
- 记录 `submission_id`（artifact、release draft body 或外部状态存储）。
- 提交后立即结束，不在同一 job 无限轮询。

2. 收尾流水线（wait/finalize）
- 定时或手动触发，仅轮询 `xcrun notarytool info`。
- 状态为 `Accepted` 后执行 `staple`、上传 release artifacts、更新发布状态。
- 状态为 `Invalid` 时立即抓取 `notarytool log` 并 fail，输出诊断信息。

3. 运行资源策略
- 必须单 job 等待很久时，改为 self-hosted macOS runner（规避 GitHub-hosted 6h 限制）。
- GitHub-hosted 场景下避免“提交+长等待+发布”绑定在同一个 job。

4. 运行纪律
- 任意时刻只保留一条活跃 notarization 提交流程，避免重复 rerun 叠加队列。
- 针对已提交的 `submission_id` 持续轮询，不重复提交相同构建产物。

示例命令：

```bash
xcrun notarytool info <submission-id> \
  --key ".key/AuthKey_FTMYX92DQM.p8" \
  --key-id "FTMYX92DQM" \
  --issuer "<issuer-id>" \
  --output-format json
```

```bash
xcrun notarytool wait <submission-id> \
  --key ".key/AuthKey_FTMYX92DQM.p8" \
  --key-id "FTMYX92DQM" \
  --issuer "<issuer-id>" \
  --timeout 24h \
  --output-format json
```

## Why This Matters
- notarization 排队时间不可控，单次 job 长等待会直接撞上平台硬限制。
- “无限轮询 + rerun”会放大失败概率并造成发布窗口不可预测。
- 解耦后可以把“提交成功”与“最终可分发”分成可恢复步骤，降低一次性失败成本。

## When to Apply
- 发布流程包含 Apple notarization 且历史上出现过长时间 `In Progress`。
- 当前流水线在 notary wait 阶段超过 1-2 小时并影响 release SLA。
- 团队希望在不牺牲签名/公证合规的前提下稳定发布节奏。

## Examples
Before（单 job 强耦合）：
- `build -> submit -> while true wait -> staple -> release`
- notarization 慢时直接超 6h，job 失败。

After（双阶段解耦）：
- Workflow A: `build -> submit -> persist submission_id -> exit`
- Workflow B: `poll submission_id -> accepted? -> staple -> release`
- 若需长时间等待，迁移 Workflow B 到 self-hosted macOS runner。

## Related
- `.github/workflows/release.yml`（AgentNexus 当前发布流程）
- GitHub Actions limits（6h GitHub-hosted / 5d self-hosted）
- Apple Notarization workflow 文档
