# Skills Usage Agent Presets Rollout Checklist

## Execution Record

- Executed at: `2026-04-20 19:48 CST`
- Owner: `@liuc`
- Plan: `docs/plans/2026-04-20-001-feat-skills-usage-agent-presets-and-call-detection-plan.md`

## 1. Feature Gate

- [x] 内置 14 个 Agent 预设可见（默认仅 `codex` / `claude` / `gemini` 启用）。
- [x] 设置页主流程去除“手工命名 Agent”，改为预设卡片启停与编辑。
- [x] Agent 配置支持 `rootDir + ruleFile + skillSearchDirs[]`。
- [x] 支持 `redetect` 与 `restore_defaults`，并展示检测状态与路径来源。

## 2. Skills Usage Contract Gate

- [x] 映射逻辑按“Agent 启用目录集合”约束生效。
- [x] 冲突选择采用稳定排序（alias 质量 -> priority -> source -> skill_id）。
- [x] 调用事实写入包含 `evidenceSource/evidenceKind/confidence`。
- [x] 失败原因 taxonomy 已落地（`token-invalid`、`search-dirs-*`、`alias-*` 等）。
- [x] 查询接口支持 `evidenceSource` 过滤并回传证据字段。

## 3. Frontend Regression

执行命令：

```bash
npm run typecheck
npm run test:run -- \
  src/features/skills/components/__tests__/SkillsOperationsPanel.test.tsx \
  src/features/skills/components/__tests__/SkillUsageTimelineDialog.test.tsx \
  src/shared/stores/__tests__/skillsStore.usage.test.ts \
  src/app/WorkbenchApp.skills-operations.test.tsx \
  src/app/WorkbenchApp.settings.test.tsx
```

- [x] TypeScript typecheck 通过。
- [x] Skills 中控、调用时间轴、settings 相关测试通过。

## 4. Rust / Tauri Regression

执行命令：

```bash
cargo test -p agentnexus --no-run
cargo test skills_usage::tests -- --nocapture
cargo test agent_rules_v2 -- --nocapture
```

- [x] Rust 编译通过。
- [x] `skills_usage` 单元测试通过。
- [x] `agent_rules_v2` 单元测试通过。

## 5. Scope Boundary Reminder

- [x] 本轮仍以本地会话解析为边界，不引入云端遥测。
- [x] 非 `codex/claude` 的未知日志格式继续以 `agent-format-unsupported` 明确提示。

