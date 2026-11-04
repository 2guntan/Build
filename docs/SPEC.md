# Site Feasibility Tool — Build Spec v1

Nov 4, 2026 · @Bou

## 1. Product overview and scope

A web app that lets a developer or architect test what can be built on a plot in minutes: draw or import the site, generate compliant massing with an AI agent, adjust it with sliders, see sun and shadow, read the yield, and export IFC to Archicad or Revit.

**Working name:** Feasibility Studio (placeholder, rename freely).

**Primary users**

- Property developers deciding whether to buy or build on a plot
- Architects doing early feasibility and capacity studies
- Planners and consultants checking compliance against local urban codes

**Pilot market:** Dakar, Senegal. French is the primary UI language, English second.

**Core loop:** site → rules → intent → solver → recipe → geometry → analysis + yield → compare options → export.

**In scope for v1**

- Projects with one plot each, several design options per project
- Site setup: draw the plot boundary, or import a GeoJSON/KML; context buildings and terrain imported automatically
- Rules engine with one jurisdiction loaded (Dakar), rules stored as data
- Massing: blocks with footprint, floors, floor heights, uses per floor, setbacks
- AI agent (Claude) that turns natural-language intent into massing through a solver and validator
- Parameter sliders that edit the recipe without calling the AI
- Live compliance panel (coverage, floor-area ratio, height, setbacks, parking)
- Sun hours and shadow study in the browser
- Yield model: GFA, sellable area, revenue, cost, margin
- Side-by-side option comparison
- IFC4 export of the massing with spaces and storeys; PDF one-page summary
- Versioned recipes with undo and history

**Out of scope for v1** (planned for v2)

- Detailed BIM authoring (walls, openings, structure)
- Manual geometry overrides that survive regeneration
- Real-time multi-user editing
- Wind, noise and daylight simulation
- Multiple jurisdictions beyond Dakar
- Native mobile apps (the web app must still work on tablets)

## 2. Tech stack and repository structure

One TypeScript monorepo with a separate frontend app, a separate backend API, one Python service for IFC work, and shared packages that hold the logic both sides must agree on.

| Layer | Choice | Why |
| --- | --- | --- |
| Monorepo | pnpm workspaces + Turborepo | Shared packages, one install, cached builds |
| Frontend | React 19, TypeScript, Vite | Fast dev loop, same stack as CADAM and That Open examples |
| 3D engine | That Open Engine (@thatopen/components, @thatopen/fragments), Three.js | MIT-licensed web BIM engine with IFC and fragments support |
| Frontend state | Zustand (design state), TanStack Query (server state) | Small, predictable, easy for an agent to reason about |
| UI | Tailwind CSS + shadcn/ui, react-i18next (fr, en) | Fast to build, French-first |
| Maps | MapLibre GL JS | Open-source basemap and plot drawing |
| Backend API | Node 22, Fastify 5, TypeScript | Fast, schema-first routes with zod |
| ORM | Drizzle ORM + drizzle-kit migrations | Typed SQL, supports PostGIS types via custom columns |
| Database | PostgreSQL 16 + PostGIS 3.4 | Spatial queries on plots and context; JSONB for recipes and rules |
| Jobs | pg-boss (queue inside Postgres) | No Redis needed for v1 |
| Object storage | S3-compatible (MinIO locally, any S3 in prod) | IFC files, terrain tiles, PDFs |
| Auth | Better Auth (email + Google), sessions in Postgres | Self-hosted, no vendor lock-in |
| AI | Anthropic Claude API with tool use, server-side only | Keys never reach the browser |
| IFC service | Python 3.12, FastAPI, IfcOpenShell | Reliable IFC4 writing and IDS validation |
| Dev infra | Docker Compose (postgres+postgis, minio, api, ifc-service) | One command to run everything |

**Database decision:** PostgreSQL with PostGIS. Plots, setbacks and context buildings are geometry, and PostGIS answers "which buildings are within 200 m" or "is this footprint inside the buildable area" natively. Recipes and rule sets are versioned JSON documents, which JSONB stores well with indexing. One database covers both, and pg-boss removes the need for a separate queue. A managed Postgres with PostGIS (Supabase, Neon, AWS RDS, Scaleway) works in production without code changes.

**Repository layout**

```
feasibility-studio/
├── apps/
│   ├── web/                 # Frontend (React + Vite)
│   └── api/                 # Backend (Fastify + Drizzle)
├── services/
│   └── ifc/                 # Python FastAPI + IfcOpenShell
├── packages/
│   ├── recipe/              # Recipe zod schema, types, migrations between versions
│   ├── builder/             # Recipe → geometry (pure TS, runs in browser and Node)
│   ├── rules/               # Rule set schema + evaluator (pure TS)
│   ├── solver/              # Intent → recipe placement + validator (pure TS)
│   ├── yield/               # Areas → revenue, cost, margin (pure TS)
│   ├── api-contract/        # Shared zod request/response schemas
│   └── config/              # tsconfig, eslint, prettier presets
├── data/
│   └── jurisdictions/sn-dakar/   # Rule set JSON + source references
├── infra/
│   └── docker-compose.yml
├── docs/                    # This spec, ADRs
└── CLAUDE.md
```

**The split rule:** anything that must give the same answer in the browser and on the server (recipe schema, builder, rules, solver, yield) lives in `packages/` as pure TypeScript with no DOM or Node APIs. The frontend runs it for instant feedback; the API runs it again before saving, so the server never trusts a client result.

## 3. Architecture and core data flow

The frontend and backend are separate apps that import the same shared packages, so a design evaluated in the browser gives exactly the same numbers when the server re-checks it before saving.

&#91;embedded content: system architecture · frontend, shared packages, backend, data and external services\]

**Core flow for one design change**

1. The user moves a slider, or types a request in the chat
2. Slider path: the build worker resolves params, builds geometry, checks rules and computes yield in the browser; the viewport and panels update at once; a debounced save sends the recipe to the API
3. Chat path: the API's agent service sends the prompt to Claude with tools; Claude calls the solver, which returns compliant candidate recipes; the validator checks each one; the user accepts one
4. On every save, the API re-runs builder, rules and yield, stores an immutable recipe version and its evaluation in Postgres
5. On export, a job sends the build result to the IFC service, stores the file in object storage and returns a signed link

## 4. Design recipe schema

The recipe is the single source of truth for one design option: a small, versioned JSON document that the builder turns into geometry deterministically. Neither the AI nor the user edits geometry directly; both edit the recipe.

**Rules for the recipe**

- Defined once as a zod schema in `packages/recipe`, exported as TypeScript types and as JSON Schema (for the Claude tool definitions)
- Every recipe carries `schemaVersion`; `packages/recipe/migrations` upgrades old versions
- All lengths in metres, areas in m², angles in degrees, coordinates in the project's local frame (metres east/north of the site origin)
- Same recipe in → same geometry out. No randomness, no clock
- Every element has a stable `id` (nanoid) so edits, comments and IFC GlobalIds survive regeneration
- Values a user may tweak are listed in `params`, each with min, max and step, so the UI builds sliders from the schema alone

**Example (v1)**

```json
{
  "schemaVersion": 1,
  "optionId": "opt_8f2k",
  "site": {
    "origin": { "lon": -17.4677, "lat": 14.7167, "crs": "EPSG:32628" },
    "plotRef": "plot_31a",
    "northAngle": 0
  },
  "programme": {
    "targetUse": "mixed",
    "targetGfa": 6500
  },
  "params": {
    "floorsA": { "value": 6, "min": 1, "max": 12, "step": 1, "label": "Block A floors" },
    "setbackFront": { "value": 5, "min": 0, "max": 15, "step": 0.5, "unit": "m" },
    "groundFloorHeight": { "value": 4.5, "min": 3, "max": 6, "step": 0.1, "unit": "m" },
    "typicalFloorHeight": { "value": 3.1, "min": 2.8, "max": 4, "step": 0.1, "unit": "m" }
  },
  "blocks": [
    {
      "id": "blk_A",
      "name": "Block A",
      "footprint": {
        "kind": "rect",
        "anchor": "buildable.front-left",
        "width": 24,
        "depth": 16,
        "rotation": 0
      },
      "floors": "$params.floorsA",
      "floorHeights": { "ground": "$params.groundFloorHeight", "typical": "$params.typicalFloorHeight" },
      "uses": [
        { "floors": [0], "use": "retail", "efficiency": 0.85 },
        { "floors": [1, "last"], "use": "residential", "efficiency": 0.8, "unitMix": { "T2": 0.4, "T3": 0.45, "T4": 0.15 } }
      ],
      "roof": { "kind": "flat", "accessible": true }
    }
  ],
  "parking": { "kind": "surface", "spaces": 40, "area": "auto" },
  "meta": { "createdBy": "agent", "intent": "R+5 mixed use, retail ground floor" }
}
```

**Footprint kinds in v1:** `rect` (width, depth, rotation), `polygon` (explicit vertices in local metres), `offset` (the buildable area shrunk by a distance). Footprints may reference named anchors computed from the site (`buildable.front-left`, `buildable.centroid`) so a recipe still makes sense if the plot is redrawn.

**Parameter references:** any numeric field can be a literal or a `$params.<key>` reference. The builder resolves references before building; sliders only ever change `params`.

**Builder output (`packages/builder`):** a `BuildResult` with, per block, a footprint polygon, per-storey slabs (elevation, height, area, use) and a solid mesh as typed arrays; plus site-level totals. The frontend converts it into That Open fragments for display; the IFC service converts the same result into IFC4 entities.

## 5. Rules engine

Planning rules are data, not code: each jurisdiction is a versioned JSON rule set that a pure TypeScript evaluator in `packages/rules` checks against a `BuildResult`. Adding a city means adding a file, not changing the engine.

**Rule set structure**

- `jurisdiction`: id, name, country, version, effective date, source documents (title, URL, article)
- `zones`: each zone has an id, a name and the rules that apply in it; a plot is assigned a zone manually in v1 (zone maps are v2)
- `rules`: each rule has an id, a type, parameters, a severity (`blocking` or `warning`) and a citation to its article

**Rule types in v1**

| Type | Checks | Parameters |
| --- | --- | --- |
| `max_coverage` | Footprint area ÷ plot area | `max` (ratio) |
| `max_far` | GFA ÷ plot area | `max` (ratio) |
| `max_height` | Height to top of roof, and/or storey count | `maxMetres`, `maxStoreys` |
| `setback` | Distance from each footprint edge to a plot edge class | `edge` (front, side, rear), `min` (m) or a formula of building height |
| `min_separation` | Distance between blocks on the same plot | `min` (m) or formula |
| `parking_ratio` | Required spaces from use and area | per use: spaces per unit or per 100 m² |
| `min_open_space` | Unbuilt plot share | `min` (ratio) |

**Formulas:** where a code says "setback ≥ H/2", the parameter is a tiny expression evaluated by a safe parser (no `eval`): variables `H` (block height), `n` (storeys), `A` (plot area). Use a library such as `expr-eval` or a 50-line hand-written parser.

**Example (structure only)**

```json
{
  "jurisdiction": { "id": "sn-dakar", "version": "0.1.0", "effective": "YYYY-MM-DD" },
  "sources": [{ "id": "src1", "title": "<official planning document>", "url": "<link>" }],
  "zones": [
    {
      "id": "zone-r1",
      "name": "<zone name from the plan>",
      "rules": [
        { "id": "r1-cov", "type": "max_coverage", "max": 0.6, "severity": "blocking", "cite": { "source": "src1", "article": "<art.>" } },
        { "id": "r1-front", "type": "setback", "edge": "front", "min": "max(5, H/2)", "severity": "blocking", "cite": { "source": "src1", "article": "<art.>" } }
      ]
    }
  ]
}
```

The numbers above are placeholders to show the format. The real Dakar values must be transcribed from the official planning documents, with an article citation on every rule, and reviewed by a local architect or urban planner before launch. Treat this as its own work item (milestone M2).

**Evaluator output:** for each rule, `{ ruleId, status: pass | warn | fail, actual, limit, margin, elementIds, message_fr, message_en }`. The compliance panel renders this list; the solver reads the same rules as constraints; the validator rejects any recipe with a `blocking` failure unless the user explicitly marks the option as "non-compliant study".

**Buildable area:** the engine also exposes `buildableArea(plot, zone)`: the plot polygon shrunk by the setback rules (using the maximum height allowed when a setback depends on H). The solver places blocks inside it, and recipe anchors such as `buildable.front-left` resolve against it.

## 6. Database schema (PostgreSQL 16 + PostGIS)

Relational tables for ownership and history, PostGIS geometry for anything spatial, and JSONB for recipes, rule sets and analysis results. Geometry is stored in WGS84 (SRID 4326) and projected to the local UTM zone (EPSG:32628 for Dakar) for measurement.

**Tables**

| Table | Purpose | Key columns |
| --- | --- | --- |
| `user`, `session`, `account` | Managed by Better Auth | standard |
| `organization` | A firm or developer account | id, name, plan, created\_at |
| `membership` | User ↔ organization | org\_id, user\_id, role (owner, editor, viewer) |
| `project` | One site study | id, org\_id, name, jurisdiction\_id, currency, locale, created\_by |
| `plot` | The site boundary | id, project\_id, geom `geometry(Polygon,4326)`, zone\_id, edge\_classes JSONB, area\_m2 (generated), source (drawn, imported) |
| `context_building` | Neighbouring buildings | id, project\_id, geom `geometry(Polygon,4326)`, height\_m, height\_source (measured, estimated, default), data\_source |
| `terrain_tile` | Elevation for the site | id, project\_id, bbox `geometry(Polygon,4326)`, storage\_key, resolution\_m |
| `jurisdiction` | A city or planning authority | id (`sn-dakar`), name, country, default\_crs |
| `rule_set` | Versioned rules for a jurisdiction | id, jurisdiction\_id, version (semver), content JSONB, status (draft, published), published\_at |
| `design_option` | One alternative inside a project | id, project\_id, name, rule\_set\_id, head\_version\_id, is\_archived |
| `recipe_version` | Immutable recipe snapshot | id, option\_id, parent\_id, schema\_version, recipe JSONB, author\_kind (user, agent, slider), author\_id, summary, created\_at |
| `evaluation` | Cached results for a version | id, recipe\_version\_id, compliance JSONB, metrics JSONB, yield JSONB, builder\_version |
| `yield_assumption` | Prices and costs per project | id, project\_id, sale\_price\_per\_m2 by use JSONB, build\_cost\_per\_m2 by use JSONB, land\_cost, soft\_cost\_ratio, currency |
| `agent_run` | One agent conversation turn | id, option\_id, user\_id, prompt, status, model, tokens\_in, tokens\_out, cost\_usd, result\_version\_id |
| `agent_step` | Each tool call in a run | id, run\_id, seq, tool, input JSONB, output JSONB, duration\_ms, error |
| `export` | IFC and PDF files | id, recipe\_version\_id, kind (ifc, pdf), storage\_key, status, error |
| `pgboss.*` | Job queue (created by pg-boss) | managed |

**Indexes and constraints**

- GiST index on `plot.geom`, `context_building.geom`, `terrain_tile.bbox`
- GIN index on `recipe_version.recipe` and `rule_set.content` (jsonb\_path\_ops)
- `recipe_version` rows are never updated or deleted; undo moves `design_option.head_version_id` back to a parent
- `plot.area_m2` = generated column: `ST_Area(ST_Transform(geom, <project UTM SRID>))`
- Row-level authorization is enforced in the API layer by `org_id`; every query on project data joins through `project.org_id`

**Example spatial queries the API needs**

```sql
-- Context buildings within 250 m of the plot
SELECT cb.*
FROM context_building cb
JOIN plot p ON p.project_id = cb.project_id
WHERE p.id = $1
  AND ST_DWithin(ST_Transform(cb.geom, 32628), ST_Transform(p.geom, 32628), 250);

-- Plot area in m²
SELECT ST_Area(ST_Transform(geom, 32628)) FROM plot WHERE id = $1;
```

**Migrations:** Drizzle schema in `apps/api/src/db/schema.ts`, migrations generated with drizzle-kit and committed. A first migration runs `CREATE EXTENSION IF NOT EXISTS postgis;`. A seed script loads the `sn-dakar` jurisdiction and its draft rule set from `data/jurisdictions/`.

## 7. Backend API (apps/api)

A REST API under `/api/v1`, JSON in and out, every request and response validated by zod schemas from `packages/api-contract`. The frontend imports the same schemas, so types never drift. Agent runs stream over Server-Sent Events.

**Endpoints**

| Method | Path | Does |
| --- | --- | --- |
| POST | `/auth/*` | Sign-up, sign-in, sign-out (Better Auth handler) |
| GET | `/me` | Current user and organizations |
| GET, POST | `/projects` | List, create |
| GET, PATCH, DELETE | `/projects/:id` | Read, rename, archive |
| PUT | `/projects/:id/plot` | Set plot from GeoJSON; returns area, edges, buildable area |
| PATCH | `/projects/:id/plot/edges` | Classify plot edges (front, side, rear) |
| POST | `/projects/:id/site-data` | Queue context import (buildings + terrain); returns job id |
| GET | `/projects/:id/context` | Context buildings and terrain tile URLs |
| GET | `/jurisdictions` | Available jurisdictions and published rule set versions |
| GET | `/rule-sets/:id` | Full rule set JSON |
| GET, POST | `/projects/:id/options` | List, create (empty or duplicated from another) |
| GET | `/options/:id` | Option with head recipe and latest evaluation |
| POST | `/options/:id/versions` | Save a new recipe version (from sliders or manual edit); server re-runs builder, rules and yield, stores the evaluation |
| GET | `/options/:id/versions` | History list |
| POST | `/options/:id/head` | Move head to a version (undo/redo) |
| POST | `/options/:id/agent-runs` | Start an agent run with a prompt (+ optional image); returns run id |
| GET | `/agent-runs/:id/stream` | SSE: step events, proposed recipe, final result |
| POST | `/agent-runs/:id/accept` | Accept the proposed recipe as a new version |
| GET, PUT | `/projects/:id/yield-assumptions` | Read, update prices and costs |
| GET | `/projects/:id/compare?options=a,b,c` | Metrics, compliance and yield side by side |
| POST | `/versions/:id/exports` | Queue IFC or PDF export; returns export id |
| GET | `/exports/:id` | Status and signed download URL |

**Internal services (apps/api/src/services)**

- `ProjectService`, `OptionService`: CRUD, authorization by organization
- `EvaluationService`: runs `packages/builder` + `packages/rules` + `packages/yield` on the server; the stored result is authoritative
- `SiteDataService`: queues and runs imports (section 11)
- `AgentService`: runs the Claude tool loop (section 8)
- `ExportService`: sends the `BuildResult` to the IFC service, stores the file, renders the PDF summary
- `StorageService`: S3 wrapper with signed URLs (15-minute expiry)

**IFC service (services/ifc)**

- `POST /ifc/build`: input `BuildResult` + site origin + project metadata → IFC4 file (IfcProject, IfcSite with IfcMapConversion georeferencing, IfcBuilding per block, IfcBuildingStorey per floor, IfcSpace per use zone with area quantities, IfcBuildingElementProxy massing solids)
- `POST /ifc/validate`: runs IDS checks on a generated file
- Internal only: reachable from the API on the private network, never from the browser

**Errors:** RFC 9457 problem+json with a stable `code` (`PLOT_INVALID`, `RULESET_NOT_PUBLISHED`, `RECIPE_SCHEMA_INVALID`, `AGENT_BUDGET_EXCEEDED`, and so on) and French and English messages.

**Rate and cost limits:** per organization, a daily agent token budget and a maximum of 3 concurrent agent runs; exceeding returns 429 with `AGENT_BUDGET_EXCEEDED`.

## 8. AI agent, solver and validator

Claude expresses design intent through tools; a deterministic solver turns intent into placed geometry within the rules; a validator checks every result before the user sees it. Claude never writes coordinates directly unless the user dictates them.

**Agent loop (AgentService)**

1. Load context: plot summary (area, edges, buildable area), zone rules in plain text, current recipe, current evaluation, yield assumptions
2. Call the Claude API with the system prompt, the user prompt (and image, if any) and the tool definitions
3. Execute each tool call server-side, append the result, repeat until Claude returns a final answer or 12 tool calls are reached
4. Stream each step to the client over SSE
5. Return a proposed recipe plus a short explanation in the user's language; the user accepts, edits or rejects it

**Tools exposed to Claude**

| Tool | Input | Output |
| --- | --- | --- |
| `get_site_summary` | none | Plot area, edge lengths and classes, buildable area, orientation, neighbouring heights |
| `get_rules` | none | Applicable rules with limits, in plain language and as data |
| `get_current_option` | none | Current recipe, metrics, compliance, yield |
| `propose_massing` | Intent object: target use, target GFA or floors, number of blocks, layout preference (bar, L, courtyard, towers), ground-floor use, priorities (max GFA, max sun, max margin) | Solver result: up to 3 candidate recipes, each with metrics, compliance and yield |
| `edit_recipe` | JSON Patch (RFC 6902) against the current recipe | New recipe after validation, or the validation errors |
| `set_params` | Map of param keys to values | Updated metrics |
| `run_sun_study` | Date, time range | Summary: average direct-sun hours on façades, share of plot shaded at noon (computed server-side with a simplified ray caster) |
| `compare_candidates` | Candidate ids | Table of metrics |

**Solver (`packages/solver`)**

- Input: intent, buildable area polygon, rules, programme targets
- Generates candidates from layout templates (single bar, double bar, L-shape, U-shape, courtyard, point towers), each parameterised by width, depth, orientation and floors
- For each template, searches the parameter space (grid search, then local refinement) to maximise the stated priority while meeting every `blocking` rule
- Returns the top 3 distinct candidates, scored, each as a complete recipe
- Deterministic: same input gives the same output; time budget 2 s on the server

**Validator (`packages/solver/validate.ts`)**

- Schema check against the zod recipe schema
- Geometry checks: footprints inside the plot, no overlapping blocks, no self-intersecting polygons, floors ≥ 1, heights within slider bounds
- Rule check: runs the rules engine; any `blocking` failure → rejected with reasons Claude can act on
- Sanity checks: GFA within ±50% of the stated target, efficiency ratios between 0.5 and 0.95

**System prompt essentials**

- Role: feasibility assistant for developers and architects; answer in the user's language (French by default)
- Always call `get_site_summary` and `get_rules` before proposing
- Prefer `propose_massing` for new layouts and `edit_recipe` for targeted changes
- Never claim compliance without a validator result; quote the rule citation when explaining a limit
- Keep explanations to 3–5 sentences with the key numbers (GFA, floors, coverage, margin)

**Model and cost:** model configurable via environment variable; use the most capable Claude model for runs and a smaller one for short explanations. Log tokens and cost per run in `agent_run`. Use prompt caching for the system prompt and rules block.

**Images:** a sketch or reference photo can be attached; it is passed to Claude as an image input to inform intent only, never to extract exact dimensions.

## 9. Frontend (apps/web)

A single-page React app with one main workspace screen: map and 3D viewport in the centre, chat and sliders on the left, compliance and yield on the right. Every slider move rebuilds geometry in the browser in under 100 ms; saving to the server is debounced.

**Screens and routes**

| Route | Screen | Contents |
| --- | --- | --- |
| `/login`, `/signup` | Auth | Email + Google |
| `/` | Projects | Project cards with thumbnail, plot area, best option margin; New project |
| `/projects/new` | Site setup wizard | 1) search address or pan the map 2) draw plot or import GeoJSON/KML 3) tag edges front/side/rear 4) pick zone 5) confirm → context import starts |
| `/projects/:id` | Workspace | Main screen (below) |
| `/projects/:id/compare` | Compare | 2–4 options side by side: 3D thumbnails, metrics, compliance, yield |
| `/projects/:id/settings` | Settings | Yield assumptions, currency, rule set version, members |

**Workspace layout (desktop ≥ 1280 px)**

- Top bar: project name, option tabs (+ new option, duplicate), undo/redo, export menu (IFC, PDF)
- Left panel (360 px), two tabs: **Assistant** (chat with Claude, image attach, step stream, candidate cards with Accept) and **Parameters** (sliders generated from `recipe.params`, block list, uses per floor)
- Centre: 3D viewport (That Open Engine) with toggle to 2D plan; map basemap under the site; context buildings in grey; setback lines and buildable area as an overlay; shadows on demand
- Right panel (320 px), two tabs: **Compliance** (rule list with pass/warn/fail, actual vs limit, citation; click highlights the element) and **Yield** (areas by use, sellable area, revenue, cost, margin, margin %)
- Bottom strip: sun study controls (date, time slider, play) when the sun layer is on

Tablet (768–1279 px): panels become drawers. Phone: read-only viewer plus chat.

**State management**

- `useDesignStore` (Zustand): current recipe, pending params, selection, BuildResult, evaluation, undo stack (local, last 50)
- TanStack Query: projects, options, versions, rule sets, context, exports
- Flow on slider change: update params → `packages/builder` in a Web Worker → `packages/rules` + `packages/yield` in the same worker → update viewport and panels → debounce 800 ms → `POST /options/:id/versions` (author\_kind `slider`, consecutive slider saves squashed into one version)
- Flow on agent accept: server already stored the version → refetch option → replace local recipe

**Viewport (src/viewport)**

- `ViewportManager` wraps That Open `Components`, `Worlds`, `SimpleScene`, `OrthoPerspectiveCamera`
- `MassingLayer` converts `BuildResult` meshes into Three.js meshes coloured by use (retail, residential, office, parking), with storey lines
- `ContextLayer` draws neighbouring buildings as extruded grey blocks; `TerrainLayer` draws the DEM tile as a mesh
- `OverlayLayer` draws plot boundary, setback lines, buildable area, dimension labels
- `SunLayer` (section 10)
- Object picking: click a block → select in the store → highlight + show its params
- IFC preview: load the exported IFC through That Open's IFC loader to let users check the handoff before downloading

**Builder in a worker:** `src/workers/build.worker.ts` imports `packages/builder`, `packages/rules`, `packages/yield`; communicates via Comlink. The main thread never blocks.

**Internationalisation:** all strings in `src/locales/fr.json` and `en.json`; numbers and currency formatted with `Intl` (default `fr-SN`, XOF); units metric only.

**Design:** clean, data-dense, professional; neutral palette with one accent colour, use colours consistent across 3D, charts and legends. Accessibility: keyboard reachable panels, WCAG AA contrast, `aria-live` region for agent responses.

## 10. Analysis: sun, shadow and yield

Sun and shadow run in the browser on the GPU; the yield model is a pure TypeScript function shared by browser and server. Both update live with the sliders.

**Sun position:** use the `suncalc` library (or an NOAA solar position implementation) from site latitude, longitude, date and time. Times are local to the site's time zone (Africa/Dakar, UTC+0, no daylight saving).

**Shadow view (live)**

- Three.js directional light at the computed sun vector, shadow maps on, context + massing cast and receive shadows
- Time slider (06:00–19:00) and date picker with presets: 21 March, 21 June, 21 September, 21 December
- Play button animates the day at 15-minute steps

**Sun-hours map (on demand, < 3 s)**

- Sample points: a grid on the ground (2 m spacing) and on façades (1 m × floor height)
- For each sun position across the chosen day (15-minute steps, sun above 5°), cast a ray from each point to the sun and test against massing + context meshes using `three-mesh-bvh` for speed
- Result: direct-sun hours per point, shown as a colour ramp with legend; summary metrics: average façade sun hours by orientation, share of ground with < 2 h of sun, share of façade area with > 6 h of direct sun (overheating risk in a hot climate)
- Run in a Web Worker; cache by recipe hash + date

**Yield model (`packages/yield`)**

Inputs: `BuildResult` areas by use, yield assumptions (sale price per m² by use, build cost per m² by use, land cost, soft-cost ratio, parking cost per space), efficiency ratios from the recipe.

```latex
\text{Sellable area}_u = \text{GFA}_u \times \text{efficiency}_u
```

```latex
\text{Margin} = \sum_u \text{Sellable}_u \times \text{Price}_u - \Big(\sum_u \text{GFA}_u \times \text{Cost}_u\Big)(1 + \text{soft}) - \text{Land} - \text{Parking}
```

Outputs: GFA by use, sellable area, unit count estimate from the unit mix and average unit sizes, revenue, hard cost, soft cost, total cost, margin, margin on cost (%), cost per sellable m². All amounts in the project currency (default XOF), rounded only for display.

**Defaults:** the yield assumptions start empty and must be entered by the user; the UI shows "enter your prices" instead of inventing market figures. A later version can offer reference price ranges per neighbourhood once a reliable source is integrated.

## 11. Site data pipeline

Context comes from open datasets imported once per project into PostGIS, with every building tagged by source and height confidence so users know what is measured and what is guessed.

**Sources, in priority order**

| Data | Source | Notes |
| --- | --- | --- |
| Building footprints | Google Open Buildings | Strong coverage in Africa; footprint polygons with confidence score |
| Building footprints (fallback, merge) | Overture Maps buildings, OpenStreetMap | Fill gaps; OSM sometimes carries `building:levels` or `height` |
| Building heights | OSM tags where present, else the Open Buildings height estimates where available, else a default by footprint size | Stored with `height_source` = measured, estimated or default |
| Terrain | Copernicus DEM GLO-30 | 30 m grid; enough for sloped-plot awareness, not for earthworks |
| Basemap | OpenStreetMap tiles via a provider that allows it (MapTiler, Stadia, or self-hosted) | Do not hit tile.openstreetmap.org directly in production |
| Plot boundary | User drawing, or GeoJSON/KML/DXF upload | Cadastral data is not openly available; the user supplies it |

**Import job (pg-boss `site.import`)**

1. Take the plot bbox buffered by 300 m
2. Query footprints from a pre-loaded regional extract (see below), never from a live remote API per user request
3. De-duplicate overlapping footprints across sources (IoU > 0.5 → keep the higher-priority source)
4. Assign heights per the priority above; default = 2 storeys × 3 m when nothing is known
5. Clip the DEM to the bbox, store as a small GeoTIFF/heightmap in object storage, record in `terrain_tile`
6. Mark the job done; the frontend polls `/projects/:id/context` or receives a server event

**Regional extracts:** for the pilot, a one-off script (`scripts/load-region.ts`) downloads the Dakar region extracts of Open Buildings, Overture and OSM and loads them into a `ref_building` table (same structure as `context_building`, no project\_id). Project imports copy from `ref_building` with a spatial query. This keeps imports fast and avoids rate limits and runtime network dependencies.

**User corrections:** users can edit a context building's height or delete it; the change is stored on `context_building` with `height_source = user`.

**Licences:** show source attribution in the viewport footer and in exports (Open Buildings: CC BY 4.0 or ODbL depending on the release; OSM: ODbL; Copernicus: Copernicus licence). Check each dataset's current licence terms when writing the loader.

## 12. Non-functional requirements

The app must feel instant on a mid-range laptop over a 4G connection in Dakar, and must never leak one organization's data to another.

| Area | Requirement |
| --- | --- |
| Slider response | Builder + rules + yield + viewport update < 100 ms for up to 6 blocks × 20 floors |
| Workspace first load | < 4 s on a 10 Mbps connection; initial JS < 600 KB gzipped, That Open and Three.js code-split |
| Context payload | Context buildings sent as simplified GeoJSON, < 1 MB for a 300 m buffer |
| Agent run | First streamed step < 3 s; full run < 45 s typical |
| Sun-hours map | < 3 s for 2,000 sample points |
| Low-end devices | Shadow maps and anti-aliasing switch off automatically if frame rate < 30 fps |
| Offline tolerance | Unsaved slider edits kept in IndexedDB and synced when the connection returns |
| Auth and access | Every project query scoped by organization; role checks on write; tests cover cross-organization access |
| Secrets | Claude key, DB and S3 credentials only on the server, via environment variables; never in the frontend bundle |
| Input safety | Uploaded GeoJSON/KML/DXF size-limited (5 MB) and parsed in a sandboxed worker; recipe JSON always validated by zod |
| Prompt injection | Text from uploaded files or site data is passed to Claude as data, never as instructions; tools cannot reach other projects |
| Data protection | Personal data limited to name and email; data hosted in a region chosen at deploy; export and delete per organization (Senegal's data protection law applies, check CDP requirements before launch) |
| Observability | Structured JSON logs (pino), request ids, OpenTelemetry traces API → IFC service, Sentry for frontend and backend errors |
| Languages | French first, English second; no hard-coded strings |
| Browsers | Latest Chrome, Edge, Firefox, Safari; WebGL2 required |

## 13. Testing and benchmarks

The shared packages carry most of the logic, so they carry most of the tests: every rule type, every footprint kind and every yield formula has unit tests with hand-checked numbers.

**Test layers**

| Layer | Tool | What |
| --- | --- | --- |
| Shared packages | Vitest | Builder determinism (same recipe → identical hash), area and height maths, each rule type pass/fail at the boundary, yield formulas, solver respects every blocking rule, validator rejects bad recipes |
| Property tests | fast-check | Random valid recipes never produce overlapping blocks or footprints outside the plot after solving |
| API | Vitest + Testcontainers (real Postgres + PostGIS) | Every endpoint: auth, organization isolation, validation errors, version history, undo |
| IFC service | pytest | Generated IFC opens in IfcOpenShell, has correct storeys, spaces, areas and georeferencing; IDS checks pass |
| Frontend | Vitest + Testing Library | Stores, slider → worker → panel flow, i18n keys present in both languages |
| End-to-end | Playwright | Create project → draw plot → import context → agent proposal → accept → slider tweak → export IFC |
| Visual | Playwright screenshots | Workspace, compliance panel, compare screen |

**Golden files:** `packages/builder/test/golden/` holds 10 reference recipes with expected `BuildResult` totals (GFA, footprint, height). Any change in output fails the test and requires an explicit golden update.

**Agent benchmark (`benchmarks/agent/`)**

- 30 prompts in French and English over 5 reference plots (small corner plot, deep narrow plot, large irregular plot, sloped plot, plot with tall neighbours)
- Each case states expected properties, not exact geometry: compliant (yes/no), GFA within a range, block count, ground-floor use, mentions the limiting rule
- Script runs all cases against the real agent and outputs a scorecard: pass rate, average tool calls, average tokens, average cost, average duration
- Target before launch: ≥ 90% pass on compliance, ≥ 80% on full expectations; run on every change to the system prompt, tools or solver

**CI (GitHub Actions):** lint, typecheck, unit tests on every push; API and IFC tests with service containers; Playwright on pull requests to `main`; agent benchmark on demand (costs tokens).

## 14. Milestones and acceptance criteria

Ten milestones over about 12 weeks, each a branch Claude Code can complete and you can verify by hand before the next one starts. Weeks are estimates for one developer working with Claude Code.

1. **M0 — Foundations (week 1)**
   - Monorepo with apps, packages and services from section 2; Docker Compose with Postgres + PostGIS, MinIO, API, IFC service
   - Drizzle schema and first migration; Better Auth sign-up and sign-in; organization created on sign-up
   - CI running lint, typecheck and tests
   - Accept when: `docker compose up` + `pnpm dev` gives a logged-in empty Projects page; CI is green
2. **M1 — Recipe, builder, viewport, sliders (weeks 1–3)**
   - `packages/recipe` schema v1 with JSON Schema export; `packages/builder` for rect, polygon and offset footprints
   - Workspace with That Open viewport, a hand-drawn plot (no map yet), massing coloured by use, sliders built from `params`, builder in a Web Worker
   - Accept when: moving a slider updates the 3D massing in < 100 ms; 10 golden recipes pass; same recipe always gives the same hash
3. **M2 — Rules engine and Dakar rule set (weeks 3–5)**
   - `packages/rules` with the 7 rule types, safe formula parser, buildable-area computation
   - `data/jurisdictions/sn-dakar` draft rule set with citations (values transcribed by a person from official documents, not by the AI)
   - Compliance panel with pass/warn/fail, click to highlight; setback and buildable-area overlay
   - Accept when: each rule type has boundary tests; a deliberately oversized design shows the right failures with citations
4. **M3 — Persistence and history (weeks 4–5)**
   - Projects, plots, options, recipe versions, evaluations through the API; server re-evaluation on save
   - Undo/redo by moving the head; slider saves squashed; option duplicate
   - Accept when: reloading the page restores the exact state; a user cannot read another organization's project (tested)
5. **M4 — Solver and validator (weeks 5–6)**
   - Layout templates (bar, double bar, L, U, courtyard, towers), grid search + refinement, top-3 candidates
   - Validator with schema, geometry, rule and sanity checks
   - Accept when: property tests pass; for the 5 reference plots, every candidate is compliant and returned in < 2 s
6. **M5 — Claude agent (weeks 6–8)**
   - AgentService with the 8 tools, SSE streaming, candidate cards with Accept, run logging with tokens and cost, budgets
   - Agent benchmark with 30 cases
   - Accept when: benchmark ≥ 90% compliance pass and ≥ 80% full pass; no API key in the frontend bundle (checked in CI)
7. **M6 — Site data and map (weeks 8–9)**
   - MapLibre site wizard (search, draw, import GeoJSON/KML, edge tagging, zone choice)
   - Regional extract loader for Dakar, `site.import` job, context and terrain in the viewport, height editing
   - Accept when: a plot in central Dakar imports its context in < 20 s with source and height labels
8. **M7 — Sun and shadow (week 9)**
   - Live shadows with time and date controls; sun-hours map in a worker with legend and summary metrics
   - Accept when: 2,000-point map in < 3 s; the shadow direction matches a sun-position reference for Dakar on 21 June at 12:00 and 17:00
9. **M8 — Yield and compare (week 10)**
   - Yield assumptions screen, live yield panel, compare screen for 2–4 options
   - Accept when: yield numbers match a hand-built spreadsheet for 3 test cases to the franc
10. **M9 — Export and hardening (weeks 11–12)**
    - IFC4 export with georeferencing, storeys and spaces; IFC preview; PDF one-page summary
    - Performance budget checks, French and English completeness, Sentry, staging deployment
    - Accept when: the exported IFC opens in Archicad and Revit with correct location and storeys; the end-to-end Playwright test passes on staging

**Open questions to settle before or during M2**

- Which official Dakar planning documents and zones apply to the pilot plots, and who reviews the transcribed rules?
- Hosting region and provider for production (latency from Dakar, data protection)
- Pricing model (per seat, per project, per export) — affects the agent budget limits

## 15. Working instructions for Claude Code (CLAUDE.md)

Copy the block below into `CLAUDE.md` at the repository root, and save this spec as `docs/SPEC.md`. Claude Code reads `CLAUDE.md` at the start of every session.

```markdown
# Feasibility Studio — instructions for Claude

## Context
Web feasibility tool: site → rules → massing → sun → yield → IFC export.
Full spec: docs/SPEC.md. Read the relevant section before starting a task.

## Architecture rules (do not break)
- Frontend in apps/web, backend in apps/api, IFC work in services/ifc.
- Logic that must match on client and server lives in packages/* as pure TS
  (no DOM, no Node APIs): recipe, builder, rules, solver, yield, api-contract.
- The recipe is the single source of truth. Never edit geometry directly.
- The builder is deterministic: no Math.random, no Date.now.
- The server re-runs builder + rules + yield before saving; never trust client results.
- The Claude API key is server-only. Never import the Anthropic SDK in apps/web.
- Every DB query on project data is scoped by organization.

## Conventions
- TypeScript strict, ESM, zod for every external input.
- Units: metres, m², degrees, local site frame. Name variables with units when ambiguous (heightM, areaM2).
- UI strings in src/locales/fr.json and en.json only. French is the default.
- Small files (< 300 lines), named exports, no default exports except React pages.
- Commits: conventional commits (feat:, fix:, test:, chore:).

## Workflow
- Work milestone by milestone (docs/SPEC.md section 14). One milestone per branch.
- Write or update tests with every change; run `pnpm test` and `pnpm typecheck` before finishing.
- When the spec is ambiguous, choose the simplest option, note it in docs/DECISIONS.md, and continue.
- Never invent planning rule values. Rule numbers come only from data/jurisdictions with citations.
- Never invent market prices. Yield assumptions are user inputs.

## Commands
- pnpm dev — web + api with hot reload (needs `docker compose up -d` first)
- pnpm test / pnpm typecheck / pnpm lint
- pnpm db:migrate / pnpm db:seed
- pnpm bench:agent — agent benchmark (uses API tokens)
```

**How to drive Claude Code with this spec**

- Start each session with one milestone: "Read docs/SPEC.md sections 2, 4 and 14. Implement milestone M1. Plan first, then build."
- Use Plan mode for M1, M3 and M5; they set structures the rest depends on.
- After each milestone, ask for a short report of decisions made and anything that deviated from the spec, and review `docs/DECISIONS.md`.
- Run cloud sessions on the GitHub repo; set the cloud environment's setup script to install pnpm, Node 22, Python 3.12, and start Postgres + PostGIS, and allow network access to the package registries and the dataset hosts needed in M6.
