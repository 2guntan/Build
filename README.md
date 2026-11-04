# Feasibility Studio

Web feasibility tool for developers and architects: draw a plot, check it against planning rules,
generate compliant massing with Claude, tune it with sliders, study sun and shadow, read the yield,
compare options and export IFC4 to Archicad or Revit. Pilot market: Dakar. French first, English second.

Spec: [docs/SPEC.md](docs/SPEC.md) · Decisions and deviations: [docs/DECISIONS.md](docs/DECISIONS.md) · Agent instructions: [CLAUDE.md](CLAUDE.md)

> **Rules are TEST data.** `data/jurisdictions/sn-dakar/test-fixture.json` holds invented values so the
> engine can be tested. The official Dakar rule set must be transcribed from the planning documents and
> reviewed by a local planner (milestone M2). The UI shows a red banner while a test rule set is in use.

## Quick start

Requirements: Node 22, pnpm 10, Docker, Python 3.12+.

```bash
pnpm install
cp .env.example .env            # set BETTER_AUTH_SECRET; ANTHROPIC_API_KEY optional
docker compose -f infra/docker-compose.yml up -d postgres minio ifc-service
pnpm dev                        # API on :3001 (migrates + seeds on start), web on :5173
```

Open http://localhost:5173, create an account, then **Nouveau projet**.

Without `ANTHROPIC_API_KEY` the assistant answers `AGENT_UNAVAILABLE`. Set `AGENT_OFFLINE=true` to use a
deterministic scripted assistant (demo and tests) that follows the same tool sequence.

## Layout

| Path | What |
| --- | --- |
| `apps/web` | React 19 + Vite, That Open viewport, MapLibre wizard, Zustand + TanStack Query, FR/EN |
| `apps/api` | Fastify 5, Drizzle + PostGIS, Better Auth, pg-boss jobs, Claude agent (server-only) |
| `services/ifc` | FastAPI + IfcOpenShell: `/ifc/build`, `/ifc/validate` (IDS) |
| `packages/recipe` | Recipe schema (zod), JSON Schema export, migrations, `BuildResult` types |
| `packages/geometry` | Polygon maths, offsets, UTM projection, deterministic hashing |
| `packages/builder` | Recipe → geometry (deterministic), 10 golden recipes |
| `packages/rules` | 7 rule types, safe formula parser, buildable area, TEST fixture |
| `packages/solver` | Layout templates, grid search + refinement, validator |
| `packages/yield` | Areas → revenue, cost, margin |
| `packages/sun` | Sun position and sun-hours ray casting |
| `packages/api-contract` | Shared request/response schemas and error codes |
| `benchmarks/agent` | 30-case agent benchmark |
| `scripts/load-region.ts` | Regional building extract loader (OSM / Open Buildings / Overture) |

## Commands

```bash
pnpm test                       # all tests (API tests start a PostGIS container via Testcontainers)
pnpm typecheck
pnpm lint
pnpm db:migrate                 # also run automatically by the API on start
pnpm db:seed
pnpm db:generate                # new Drizzle migration after editing apps/api/src/db/schema.ts
pnpm bench:agent                # agent benchmark against Claude (needs ANTHROPIC_API_KEY, costs tokens)
pnpm bench:agent -- --offline   # same harness with the scripted model
pnpm load:region -- --osm       # load OSM buildings for the Dakar region into ref_building
cd services/ifc && .venv/bin/pytest
cd apps/web && NODE_PATH=$(npm root -g) node e2e/full-flow.mjs   # end-to-end flow (stack running)
```

### Loading building footprints for Dakar

Project imports copy from the `ref_building` table; they never call a remote API per request.

```bash
pnpm load:region -- --osm
# Google Open Buildings / Overture: download the Dakar extract, convert to GeoJSON (e.g. ogr2ogr or DuckDB), then
pnpm load:region -- --geojson open-buildings-dakar.geojson --source google-open-buildings --priority 1
pnpm load:region -- --geojson overture-dakar.geojson --source overture --priority 2
```

Lower priority wins when footprints overlap (IoU > 0.5). Check each dataset's licence when loading.
Attribution is shown in the viewport and in exports.
