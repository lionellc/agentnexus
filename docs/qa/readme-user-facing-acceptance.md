# README User-Facing Acceptance Checklist

Last Updated: 2026-04-18
Owner: docs
Scope: `README.md` (English) and `docs/README.zh.md` (Chinese)

## 1. Product Positioning

- [x] First-screen text clearly explains what AgentNexus is.
- [x] First-screen text explains the core pain points it solves.
- [x] The README prioritizes user understanding before engineering internals.

## 2. User Journey Structure

- [x] Main structure follows: value -> scenarios/users -> capabilities -> quick start -> docs map.
- [x] No long operational SOP body is embedded in README.
- [x] Release/notarization details are routed to `docs/ops/*`.

## 3. Bilingual Parity

- [x] `README.md` and `docs/README.zh.md` share aligned section order.
- [x] Capability statements are semantically equivalent across both files.
- [x] Key terms are consistent (`control plane`, `distribution`, `audit`).

## 4. Quick Start Correctness

- [x] Installation command is accurate: `pnpm install`.
- [x] Web startup command is accurate: `pnpm dev`.
- [x] Desktop startup command is accurate: `pnpm tauri dev`.
- [x] Common commands are accurate: `pnpm test:run`, `pnpm typecheck`, `pnpm build`.

## 5. Link and Path Validity

- [x] Language switch links are correct.
- [x] Screenshot paths render correctly in both README files.
- [x] Docs map links point to existing files:
  - `docs/ops/release-standard-playbook.md`
  - `docs/ops/release-notarization-runbook.md`
  - `.github/release-notes/`

## 6. Scope Boundaries Guard

- [x] README does not redefine product behavior not present in the codebase.
- [x] README does not include release workflow step-by-step operations.
- [x] README remains a product entry document, not a runbook replacement.

## 7. Final Sign-off

- [x] Chinese README accepted (`docs/README.zh.md`).
- [x] English README accepted (`README.md`).
- [x] This checklist is fully checked before merge.
