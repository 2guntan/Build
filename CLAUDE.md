# Feasibility Studio — instructions for Claude

## Context
Web feasibility tool: site → rules → massing → sun → yield → IFC export.
Full spec: docs/SPEC.md. Read the relevant section before starting a task.
Decisions and deviations from the spec: docs/DECISIONS.md.

## Architecture rules (do not break)
- Frontend in apps/web, backend in apps/api, IFC work in services/ifc.
- Logic that must match on client and server lives in packages/* as pure TS
  (no DOM, no Node APIs): geometry, recipe, builder, rules, solver, yield, sun, api-contract.
- The recipe is the single source of truth. Never edit geometry directly.
- The builder is deterministic: no Math.random, no Date.now (enforced by ESLint).
- Builder input = recipe + plot + edge classes + buildable area; hashes cover all of them.
- The server re-runs builder + rules + yield before saving; never trust client results.
- The Claude API key is server-only. Never import the Anthropic SDK in apps/web (ESLint + CI check).
- Every DB query on project data is scoped by organization.

## Conventions
- TypeScript strict, ESM, zod for every external input.
- Shared packages are consumed as TypeScript source (`exports` → `src/index.ts`); no build step.
- Units: metres, m², degrees, local site frame. Name variables with units when ambiguous (heightM, areaM2).
- UI strings in apps/web/src/locales/fr.json and en.json only. French is the default.
- Small files (< 300 lines), named exports, no default exports except React pages.
- Commits: conventional commits (feat:, fix:, test:, chore:).

## Workflow
- Work milestone by milestone (docs/SPEC.md section 14).
- Write or update tests with every change; run `pnpm test` and `pnpm typecheck` before finishing.
- When the spec is ambiguous, choose the simplest option, note it in docs/DECISIONS.md, and continue.
- Never invent planning rule values. Rule numbers come only from data/jurisdictions with citations.
  `data/jurisdictions/sn-dakar/test-fixture.json` is TEST data, never real rules.
- Never invent market prices. Yield assumptions are user inputs.

## Commands
- `docker compose -f infra/docker-compose.yml up -d` — Postgres+PostGIS, MinIO, IFC service
- pnpm dev — web + api with hot reload
- pnpm test / pnpm typecheck / pnpm lint
- pnpm db:migrate / pnpm db:seed / pnpm db:generate
- pnpm bench:agent — agent benchmark (needs ANTHROPIC_API_KEY, uses API tokens)
- services/ifc: `pip install -r requirements.txt && pytest`
