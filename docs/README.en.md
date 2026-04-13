# AgentNexus

[简体中文](../README.md) · [English](./README.en.md)

AgentNexus is a local-first Agent control plane.
It starts from a practical pain point: there are too many Agent products, each with different configuration models, which makes migration and daily management expensive.

The current version already delivers **global Agent rule management**, and is expanding toward **Prompts, Skills, and Spec** in one unified control plane.

---

## Core Value

- Unified management: bring scattered configs and rules from different Agent tools into one control plane
- Lower migration cost: reduce repetitive manual copy/sync work for rule files
- Lower operations risk: use versions, distribution status, and audit logs for better visibility

---

## Current Capabilities (V1)

### 1. Global Agent Rule Management

- Rule asset lifecycle: create, edit, release, rollback
- Agent connections: configure root directory and rule file path by agent type
- Batch apply and status tracking: inspect job status and retry failures
- Distribution modes: `copy` / `symlink` (with fallback options)
- Auditability: key actions such as release/apply/rollback are traceable

### 2. Single-Project Mode (Workspace is Implicit)

- Ensures a default project exists and is activated on startup
- UI focuses on current project directory instead of exposing workspace concepts
- Reduces cognitive load for single-project usage

### 3. Settings / Storage

- Configure current project directory (absolute path)
- Reset to default path
- Open directory in system file explorer

### 4. Skills

- Configure multi-directory scanning for skills
- Discover skills by `SKILL.md`
- View details and support distribution/uninstall workflows

### 5. Agent Connections

- Manage connections by agent type
- Configure `root_dir` and `rule_file`
- Support enable/disable and related operations

### 6. Prompts (Foundation Connected)

- Prompt asset management and versioning
- Will be further unified with Agent rules and Skills

---

## Roadmap

- Done: core closed loop of global Agent rule management
- In progress: better Prompts/Skills workflows
- Next: Spec management for unified Rule / Prompt / Skill / Spec governance

---

## Product Screenshots

### 1. Global Agent Rules

![Global Agent Rules](./screenshots/01-agent-rules.png)

### 2. Settings - General

![Settings General](./screenshots/02-settings-general.png)

### 3. Settings - Data / Storage / Skills

![Settings Data Storage](./screenshots/03-settings-storage.png)

### 4. Agent Connections

![Agent Connections](./screenshots/04-agent-connections.png)

### 5. Prompts List and Versions

![Prompts List and Versions](./screenshots/05-prompts.png)

### 6. Skill Detail

![Skill Detail](./screenshots/06-skill-detail.png)

---

## Quick Start

### Requirements

- Node.js (LTS recommended)
- pnpm
- Rust toolchain (for Tauri desktop app)

### Install

```bash
cd AgentNexus
pnpm install
```

### Dev (Web)

```bash
cd AgentNexus
pnpm dev
```

### Dev (Tauri Desktop)

```bash
cd AgentNexus
pnpm tauri dev
```

### Build

```bash
cd AgentNexus
pnpm build
```

### Test

```bash
cd AgentNexus
pnpm test:run
```

### Type Check

```bash
cd AgentNexus
pnpm typecheck
```

### GitHub Release (macOS + In-app Updater)

`AgentNexus` is integrated with Tauri Updater:

- `https://github.com/lionellc/agentnexus/releases/latest/download/latest.json`

Required GitHub repository secrets:

- `TAURI_SIGNING_PRIVATE_KEY_B64`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Release flow:

1. Update version in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` (e.g. `0.1.1`)
2. Create a tag like `v0.1.1`
3. Push the tag: `git push origin v0.1.1`
4. GitHub Actions first runs `.github/workflows/release.yml` (submit phase), creates/updates a `[NOTARIZING]` prerelease, and writes a release status asset
5. `release-finalize.yml` advances notarization on a 30-minute schedule; you can also trigger finalize manually
6. After both app and dmg notarization are `Accepted`, finalize completes stapling and promotes the release (removes `[NOTARIZING]` and prerelease)

What `[NOTARIZING]` means:

- Build/sign/submit is done, but notarization is still in progress
- The release remains `prerelease` in this phase and is not for production use

Manual finalize trigger (example):

```bash
gh workflow run release-finalize.yml -f release_tag=v0.1.1
```

Troubleshooting entrypoint:

- Check release asset `notarization-state.json` first (submission ids, current statuses, last checked time)
- Then inspect `release-finalize.yml` run logs for app/dmg branch details and notary responses
- See `docs/ops/release-notarization-runbook.md` for the full runbook

---

## Project Structure

```text
AgentNexus/
├── src/                         # React frontend control plane
│   ├── app/                     # Workbench entry
│   ├── features/                # agents / prompts / skills / settings
│   └── shared/                  # types, API, stores, shared components
├── src-tauri/                   # Tauri + Rust backend
│   ├── src/control_plane/       # commands for rules, prompts, skills, audit
│   ├── src/execution_plane/     # distribution and scanning execution
│   └── src/db.rs                # SQLite schema and migrations
└── .docs/                       # product and engineering docs
```
