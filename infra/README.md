# infra

Infrastructure as code. Empty for now: the hosting provider is not chosen yet
(`docs/DEPLOYMENT.md`, "Current state").

What is decided:

- The database is MongoDB Atlas, one project per environment (ADR-0003, `docs/DEPLOYMENT.md`).
- The API ships as the container image built from `apps/api/Dockerfile`.
- The web app is static files from `pnpm --filter @noor/web build` (ADR-0005).
- The AI service runs on our own GPU machine (`services/ai/Dockerfile.gpu`).

Infrastructure code added here is reviewed like application code.

Environments: local, development, staging, production. Only production holds real family data
(`docs/ENVIRONMENTS.md`).
