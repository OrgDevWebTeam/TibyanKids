# Tibyan Kids

MERN monorepo for the Tibyan Kids prototype: MongoDB, Express, React, Node.js (TypeScript).

## Layout

| Path                 | Purpose                                                  |
| -------------------- | -------------------------------------------------------- |
| `apps/web`           | React (Vite) PWA, bilingual, RTL/LTR                     |
| `apps/api`           | Express API (JavaScript, mongoose)                       |
| `apps/worker`        | Background jobs (placeholder, nothing runs yet)          |
| `services/ai`        | Python AI service that checks Quran recitation           |
| `packages/contracts` | Shared types and schemas (locales, AI result, telemetry) |
| `packages/ui`        | Bilingual/RTL UI primitives and design tokens            |
| `packages/config`    | Shared TypeScript presets                                |
| `infra`              | Infrastructure as code                                   |
| `docs`               | ADRs, environments, AI and data specs                    |

## Prerequisites

- Node 22 (`nvm use` reads `.nvmrc`)
- pnpm 9.15+ (`npm install -g pnpm@9.15.0`)
- A MongoDB Atlas database for the API (connection string goes in `apps/api/.env`)

## First-time setup

```bash
pnpm install
cp .env.example .env                       # Windows PowerShell: Copy-Item .env.example .env
cp apps/api/.env.example apps/api/.env     # then fill in DATABASE, DATABASE_PASSWORD, JWT_SECRET
pnpm check                                 # format, lint, typecheck, test, build
```

## Run locally

```bash
pnpm --filter @tibyan/api dev    # API on http://localhost:5000 (routes under /api/v1)
pnpm --filter @tibyan/web dev    # web on http://localhost:3000
```

## Commands

| Command          | What it does                           |
| ---------------- | -------------------------------------- |
| `pnpm build`     | Build all packages (Turborepo, cached) |
| `pnpm typecheck` | Type-check all packages                |
| `pnpm test`      | Run unit tests (Vitest)                |
| `pnpm lint`      | ESLint across the repo                 |
| `pnpm format`    | Prettier write                         |
| `pnpm check`     | Everything CI will run                 |

## Conventions

- **Trunk-based:** `main` is always deployable; short-lived branches merged by PR (squash).
- **Conventional Commits** are enforced by commitlint, and the PR title is checked in CI.
- **Secrets** never enter the repo. Only `VITE_*` variables reach the browser.
- **The repo is public.** Never commit audio, datasets, real child data or `.env` files.
- See `docs/ENVIRONMENTS.md` for environment rules.
