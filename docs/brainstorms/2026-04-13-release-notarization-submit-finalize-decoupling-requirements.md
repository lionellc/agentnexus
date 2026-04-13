---
date: 2026-04-13
topic: release-notarization-submit-finalize-decoupling
---

# GitHub Release 公证解耦需求（submit/finalize）

## Problem Frame
- 当前 `.github/workflows/release.yml` 在同一 job 内串行 `build/sign/notarize(wait)/staple/release`，notary 长时间 `In Progress` 会触发 GitHub-hosted 单 job 6 小时上限。
- 目标是在保持 `app + dmg` 公证合规的前提下，将“提交公证”和“等待公证完成”解耦，提升发布成功率与可恢复性。

## Requirements

**Workflow 拆分**
- R1. 新增 `submit` 流水线：完成 build、codesign、提交 app 与 dmg 到 Apple notary，拿到两个 submission ID 后结束，不做长轮询。
- R2. 新增 `finalize` 流水线：只处理已有 submission，轮询状态；当 app 与 dmg 都 `Accepted` 后执行 staple、校验并完成 release 产物更新。
- R3. `submit` 与 `finalize` 必须可重复执行且幂等；重复触发不得重复上传同一版本的重复资产或破坏既有状态。

**状态存储与可见性**
- R4. submission 状态写入对应 GitHub Release（release body 或 release asset 的结构化记录），作为 `finalize` 的唯一状态源。
- R5. `submit` 阶段即公开 release，但必须标记为 `prerelease`，并在标题或说明中包含 `[NOTARIZING]` 与“公证中，暂勿生产使用”提示。
- R6. `finalize` 成功后自动移除 `[NOTARIZING]` 标记并切换为正式 release（非 prerelease）。

**触发与运行纪律**
- R7. `finalize` 触发方式为 `schedule`（每 30 分钟）+ `workflow_dispatch`，人工可随时补触发。
- R8. 同一 tag 任意时刻仅允许一个活跃 `finalize` 任务，避免并发轮询与并发收尾。
- R9. 禁止通过 rerun 重复 submit 新 submission 作为默认恢复手段；默认恢复路径是重跑 `finalize` 查询既有 submission。

**失败处理与诊断**
- R10. 任一 submission 为 `Invalid` 或 `Rejected` 时，`finalize` 必须抓取 notary log 并失败退出，保留可读诊断。
- R11. `finalize` 在网络临时错误时可重试，但不能无限阻塞单次执行；失败后依赖下一次 schedule 续跑。
- R12. `submit` 失败与 `finalize` 失败的错误信息需区分，并能直接定位到 app 或 dmg 子任务。

## Success Criteria
- SC1. notary 排队超过 6 小时时，发布流程仍可在多次 `finalize` 周期内完成，不因单 job 超时导致整体失败。
- SC2. 同一 tag 不再出现因重复 rerun 造成的 submission 堆积。
- SC3. 发布页在公证完成前后状态可清晰识别（`[NOTARIZING]` + prerelease -> 正式 release）。
- SC4. 出现 `Invalid/Rejected` 时可直接从流水线日志拿到 notary failure 诊断，不需要二次人工排查。

## Scope Boundaries
- 不变更应用功能与打包产物类型。
- 不引入外部存储（S3/DB）；状态仅落 GitHub Release。
- 本次不要求迁移到 self-hosted runner（作为备选策略保留）。
- 不扩展到非 macOS 发布链路。

## Key Decisions
- D1. 公证对象保留 `app + dmg`：维持分发与安装体验的一致合规。
- D2. 状态存储选 GitHub Release：减少外部依赖，便于人工审计与恢复。
- D3. `submit` 即公开 release：满足尽早可见诉求，但必须强风险提示。
- D4. `finalize` 触发采用 `schedule(30m) + workflow_dispatch`：平衡自动推进与人工介入。

## Dependencies / Assumptions
- 仓库可用 GitHub Actions 定时触发。
- Apple notary 服务可通过 `notarytool` 查询 submission 状态。
- Release 页面可稳定承载结构化状态信息（body 或 asset）。

## Outstanding Questions

### Resolve Before Planning
- 无

### Deferred to Planning
- [Affects R4][Technical] 选择“release body”还是“状态 JSON asset”作为最终状态载体，并定义字段结构。
- [Affects R3,R8][Technical] `finalize` 幂等与并发锁的具体实现方式（workflow-level concurrency vs tag-level key）。
- [Affects R11][Needs research] `finalize` 单次执行的最大轮询时长与退避参数。

## Next Steps
-> /ce:plan for structured implementation planning
