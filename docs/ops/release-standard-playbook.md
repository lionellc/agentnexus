# AgentNexus 常态化发布 SOP（macOS）

## 1. 目标与适用范围

本 SOP 用于 AgentNexus 日常版本发布，目标是：

- 降低人为操作差异，统一发布动作
- 将“打包/提交公证”和“公证收尾发布”解耦后的流程稳定执行
- 在异常时快速恢复，不重复提交造成队列堆积

适用范围：

- 仓库：`agentnexus`
- 平台：GitHub Releases（macOS）
- 工作流：`.github/workflows/release.yml`（submit）与 `.github/workflows/release-finalize.yml`（finalize）

## 2. 角色职责

- 发布执行人：发起 tag、观察发布状态、处理异常
- 值班同学：发布窗口内兜底，按 runbook 介入排障
- 代码 Owner：处理 `Invalid/Rejected` 的签名或产物问题

## 3. 发布前检查（每次必做）

1. 确认目标版本号已更新：`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`
2. 确认主分支状态正确，相关改动已合入
3. 确认关键 Secrets 可用（至少）：
   - `TAURI_SIGNING_PRIVATE_KEY_B64`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
   - `APPLE_API_KEY_ID`
   - `APPLE_API_ISSUER_ID`
   - `APPLE_API_PRIVATE_KEY_B64`
4. 确认没有同版本 tag 冲突

## 4. 标准发布流程（常态）

### Step 1: 打版本 tag

```bash
git checkout main
git pull --ff-only
git tag vX.Y.Z
git push origin vX.Y.Z
```

### Step 2: submit 阶段自动执行

- `release.yml` 自动触发
- 产出行为：
  - 构建与签名
  - 提交 app 与 dmg 到 Apple notarization
  - 创建/更新带 `[NOTARIZING]` 的 `prerelease`
  - 上传 `notarization-state.json`

### Step 3: finalize 阶段自动推进

- `release-finalize.yml` 每 30 分钟自动执行
- 当 app+dmg 都 `Accepted` 时自动收尾：
  - staple + validate
  - release 从 `[NOTARIZING] prerelease` 切换为正式 release

### Step 4: 人工仅在需要时触发 finalize

```bash
gh workflow run release-finalize.yml -f release_tag=vX.Y.Z
```

## 5. 发布完成判定标准

同时满足以下条件即视为发布完成：

1. Release 标题不再包含 `[NOTARIZING]`
2. Release 不再是 `prerelease`
3. `notarization-state.json` 中 `phase` 为 `finalized`
4. finalize 最近一次 run 成功

## 6. 常态观测命令

```bash
# 查看 submit 最近执行
gh run list --workflow release.yml --limit 5

# 查看 finalize 最近执行
gh run list --workflow release-finalize.yml --limit 10

# 查看 release 基本信息
gh release view vX.Y.Z

# 拉取状态资产
gh release download vX.Y.Z -p notarization-state.json -D /tmp/notary-state
cat /tmp/notary-state/notarization-state.json
```

## 7. 异常处理矩阵

### A. 卡在 `In Progress`（常见）

- 处理：等待下一次 schedule 或手动触发 finalize
- 禁止：默认不要 rerun submit

### B. `Invalid` / `Rejected`

- 处理：
  1. 查 finalize run 日志
  2. 查 notary log（日志中包含 submission id）
  3. 修复签名/产物问题后，重新走新版本 tag 发布

### C. finalize 失败（网络/瞬时错误）

- 处理：重跑 finalize（或等待 schedule 自动续跑）

### D. 状态资产缺失/损坏

- 处理：根据最近一次 submit 成功日志重建状态后再跑 finalize
- 详细步骤见：`docs/ops/release-notarization-runbook.md`

## 8. 操作禁忌（强约束）

- 不把 rerun submit 当作默认恢复动作
- 不在同一版本上反复提交新的 notarization 任务
- 不在 `[NOTARIZING]` 阶段将版本视为可生产使用

## 9. 发布记录模板（建议每次填写）

```md
## Release vX.Y.Z

- Operator:
- Date (UTC+8):
- Submit Run URL:
- Finalize Run URL:
- Final State:
  - release title:
  - prerelease: true/false
  - phase:
  - app status:
  - dmg status:
- Incident (if any):
- Follow-up:
```

## 10. 关联文档

- 异常排障细则：`docs/ops/release-notarization-runbook.md`
- 问题背景与策略：`docs/solutions/workflow-issues/agentnexus-notarization-in-progress-github-6h-timeout-2026-04-13.md`

  