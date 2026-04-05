# AgentNexus

AgentNexus 是一个基于 `Tauri + React + TypeScript` 的本地优先资产管理台，聚焦 Prompt、Skills 与 Settings 的统一管理体验。

## 本地开发

```bash
pnpm install
pnpm tauri dev
```

前端检查命令：

```bash
pnpm typecheck
pnpm test:run
```

后端检查命令：

```bash
cd src-tauri
cargo check
```

## UI 说明

- 当前仅保留新工作台 UI（Workbench）。
