# AGENTS.md

## Package Manager

- Use `pnpm` for all dependency and script commands in this repo.
- Do not use `npm` for install, run, exec, add, remove, or update workflows.
- Prefer:
  - `pnpm install`
  - `pnpm add <pkg>`
  - `pnpm remove <pkg>`
  - `pnpm lint`
  - `pnpm exec <command>`
- Treat `pnpm-lock.yaml` as the source of truth for dependency resolution.
- Do not create or modify `package-lock.json`.
- If dependency changes are required, update `pnpm-lock.yaml` with `pnpm`, not `npm`.

## Notes

- This repository already uses `pnpm-workspace.yaml`; follow that setup instead of introducing another package manager workflow.
