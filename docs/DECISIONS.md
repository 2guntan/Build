# Decisions

Choices made where the spec was ambiguous or contradictory, and deviations from it.
Newest last. Each entry: decision — reason.

## Agreed during alignment (before M0)

1. **Slider save squashing.** Squashing happens on the client: 800 ms debounce, and one save per
   continuous edit session. The server always inserts a new `recipe_version`; rows are never updated.
   The history view groups consecutive `slider` versions. — The spec's "squash" and "immutable" conflict.
2. **`plot.area_m2`** is a generated column with a fixed projection, EPSG:32628 (Dakar). When a second
   jurisdiction arrives, switch to an API-computed column. — Generated columns cannot read other tables.
3. **IFC GlobalIds** are derived from element ids: UUID v5 (fixed namespace) → IFC base64 (22 chars),
   so they survive regeneration.
4. **Polygon offsets** use per-edge capsule subtraction with `polygon-clipping` (pure JS), snapped to a
   micrometre grid, applied one cutter at a time. — `clipper2-js` pulls Angular as a peer dependency;
   `polygon-clipping` is pure and identical in browser and Node.
5. **Sun analysis** lives in `packages/sun` (pure TS), used by the browser worker and by the server's
   `run_sun_study` tool. Instead of `three-mesh-bvh`, rays are tested analytically against extruded
   prisms with box culling: every obstacle is a vertical prism, so this is exact and fast
   (2,000 points in well under 3 s).
6. **Floor selector**: `[i]` = one floor, `[a, b]` = inclusive range; `"last"` = top floor.
   Later `uses` entries override earlier ones for the same floor.
7. **Builder input** is recipe + plot + edge classes + buildable area. `inputHash` covers all of them;
   `hash` covers the rounded output (millimetre / centimetre²) so it is stable across JS engines.
8. **Solver budget** is an iteration count (default 2,500 evaluations), not wall-clock time, so the
   output is deterministic. Tests assert < 2 s on the reference plots.
9. **Setback slider vs rule.** Rules define the minimum. The solver never emits a setback param; any
   user-added setback param only shifts footprints further in (via `offsetV` / `offset` footprints).
10. **Buildable area** for display and anchors uses the maximum allowed height (conservative). The
    evaluator checks each block's real setback at its own height; the solver recomputes the buildable
    area per candidate height.
11. **Undo**: the local undo stack (50) is a convenience; the server head is the truth. Undo/redo calls
    `POST /options/:id/head` and the store resyncs from the server response.

## M0–M1

12. **Monorepo at the repo root** (`2guntan/Build`), not in a `feasibility-studio/` sub-folder.
13. **Shared packages ship TS source** (no build): Vite, Vitest and `tsx` consume `src/index.ts`.
14. **Extra packages**: `packages/geometry` (polygon maths, projection, hashing) and `packages/sun`.
15. **WGS84 ↔ UTM** uses a built-in Krüger-series transverse Mercator (checked against pyproj to the
    millimetre) instead of `proj4`, to keep the shared packages dependency-light.
16. **Rect anchors** use a frame aligned with the plot's front edge (longest edge tagged `front`; longest
    edge if none): `u` runs along the front edge, `v` points into the plot. "Left" is the low-`u` end.
    `offsetU` / `offsetV` shift a rect inside that frame; rotation pivots on the anchor corner.
17. **GFA excludes `parking`-use storeys** (they still appear in `gfaByUse` and in hard costs).
18. **Surface parking** takes 25 m² per space when `area` is `"auto"`; it counts as built area for
    `min_open_space`, not for coverage.
19. **Unit sizes** (T1–T5 average m²) are a yield assumption entered by the user, like prices. Unit counts
    and `perUnit` parking rules stay "incomplete" (warning) until they are entered.
20. **shadcn/ui** is replaced by a handful of hand-written Tailwind components with the same API style —
    avoids the CLI/registry step in CI; can be swapped later.

## M2

21. **Dakar rules**: only `test-fixture.json` exists, flagged `"test": true`, with invented values for
    engine testing. Every evaluation made with a test rule set is flagged and the UI shows a red
    "TEST — non officiel" banner. The official `ruleset.json` is a human task (see the folder README).
22. **Draft rule sets** are usable when `ALLOW_DRAFT_RULESETS=true` (default in development, must be
    false in production); otherwise saving or solving returns `RULESET_NOT_PUBLISHED`.
23. **Default floor heights** used by the solver and to turn storey limits into metres: ground 4.5 m
    when the ground floor is non-residential (3.1 m otherwise), typical 3.1 m.
24. **Courtyard template** = two interlocking L-shapes separated at two corners by the separation
    distance, because footprints have no holes in v1 and a closed ring would break `min_separation`.
25. **`max_sun` priority** uses a proxy score (GFA × open share ÷ height factor) inside the solver; the
    real sun study runs afterwards via `run_sun_study`. **`max_margin`** falls back to GFA when yield
    assumptions are incomplete, and says so (`scoreBasis: gfa_fallback`).

## M3–M9

26. **Starter option**: a new option gets one rect block sized to 60 % of the buildable area's extent
    (4 floors, retail ground floor, residential above), so it starts compliant on setbacks.
27. **Concurrent edits**: `POST /options/:id/versions` takes the `parentId` the client edited from and
    returns 409 if the head moved; the web client then re-saves on top of the latest head.
28. **Agent tools work on a run-local draft.** `propose_massing`, `edit_recipe` and `set_params` create
    candidates in the run; nothing is stored until the user accepts one (`POST /agent-runs/:id/accept`).
    The proposed candidate is the last one produced. Claude is asked to name its recommendation.
29. **Agent model client is injectable.** `AnthropicModelClient` (Claude API: prompt caching on tools and
    system prompt, explicit `effort: high`, server-side refusal fallback `"default"`) or
    `ScriptedModelClient` (deterministic, used by tests and `AGENT_OFFLINE=true`). Without a key and
    without offline mode, agent routes return 503 `AGENT_UNAVAILABLE`.
30. **Token budget** counts input (including cache reads/writes) + output tokens over the last 24 h per
    organization; concurrency = runs in `queued`/`running`. Cost is logged with configurable per-MTok prices.
31. **Cross-organization access returns 404**, not 403, so ids from other organizations are not disclosed.
    Viewers get 403 on writes inside their own organization.
32. **Storage**: S3 (MinIO locally) when `S3_ENDPOINT` is set, otherwise local files with HMAC-signed
    download URLs served by the API (15-minute expiry, same as S3 presigned URLs).
33. **Jobs**: pg-boss queues `site.import` and `export.build`. With `JOBS_ENABLED=false` (tests) jobs run inline.
34. **Site import** excludes reference buildings whose centroid lies inside the plot (existing structures
    on site are assumed to be demolished); de-duplication keeps the lower `priority` value at IoU > 0.5;
    footprints are simplified (~0.3 m) to keep the context payload small.
35. **Terrain** is read from the public Copernicus GLO-30 Cloud-Optimized GeoTIFF for the bbox window and
    stored as a JSON heightmap (simpler than re-encoding a GeoTIFF). If the DEM host is unreachable the
    import still succeeds and records `terrain: unavailable`. Massing is placed at z = 0 in v1 (no slope
    adaptation; the sloped reference plot is flat in the benchmark).
36. **PDF summary** uses `pdf-lib` with standard fonts (WinAnsi), so no headless browser is needed.
37. **IFC exports are validated** with the IDS checks of the IFC service; a failed check fails the export.
    Storey names follow local usage (`RDC`, `R+1`…). The IFC header timestamp is fixed for byte-stable files.
38. **Basemap**: `VITE_BASEMAP_STYLE` must point to a provider style in production; the fallback uses OSM
    raster tiles for development only. Address search uses Nominatim on explicit user action.
39. **Low-end devices**: if the viewport runs below 30 fps, shadows are turned off and the pixel ratio drops
    to 1 (WebGL antialiasing cannot be toggled after context creation).
40. **Phone layout**: panels become drawers below 1280 px; the full editing UI stays reachable but is not
    optimised for phones in v1.
41. **Agent benchmark** runs the agent loop directly on the reference plots (no database), so it measures
    Claude + tools + solver. The scripted model gives a harness baseline (100 % compliance, 70 % full).

## Professional UX pass (3D scene, direct editing, polish, visual results)

42. **Renderer**: That Open `SimpleRenderer` subclass (`StudioRenderer`) with a post-processing chain
    (GTAO ambient occlusion, SMAA, ACES tone mapping) and a CSS2D overlay for dimension labels. Quality is
    `auto` (drops AO/shadows below 30 fps for two windows), `high` or `low` — user setting in the Layers panel.
43. **Basemap in 3D**: XYZ tiles at zoom 18 placed in the local frame around the site (satellite, streets or
    none). Templates via `VITE_SATELLITE_TILES` / `VITE_STREET_TILES`; defaults (Esri imagery, OSM) are for
    development only. When tiles cannot load, a neutral ground with a grid keeps the scene readable and the
    footer says the basemap is unavailable.
44. **Façades** use a procedural window texture (one bay per 3 m, one window per storey); "By use" mode
    shows flat use colours. Neighbours are clay-white volumes with soft edges.
45. **Direct editing**: select → orange side handles stretch the footprint along its main axes (0.5 m snap),
    the blue arrow changes the floor count; Move (G) and Rotate (R) use a gizmo (0.5 m / 5° snap). Every
    gesture ends as a pure recipe edit (`packages/builder/src/edit.ts`, tested). Moving a rect keeps it a
    rect (offsets); rotating or stretching converts it to an explicit polygon and drops its width/depth params.
46. **Step-backs** (`blocks[].stepBacks`, optional, schema v1 compatible): upper floors from `fromFloor`
    are inset by `inset` m. The setback rule is evaluated per tier at the tier's own top height. New solver
    template `podium_tower` uses one step-back at R+2. The IFC service accepts per-storey footprints.
47. **Demo project** (`POST /projects/demo`): a plot on the Plateau with a synthetic neighbourhood clearly
    labelled `demo-synthetic` (viewport footer says so) and three options (starter + two solver layouts).
    No prices are entered: yield stays "to be entered".
48. **Thumbnails**: the workspace renders an offscreen 3D snapshot after saves and stores it
    (`PUT /options/:id/thumbnail`, PNG ≤ 400 KB). Used on project cards, in compare (live fallback) and in the PDF.
49. **Share links** (`share_link` table): random 24-char tokens, 7/30/90-day expiry, revocable; the public
    `/s/:token` page is read-only and exposes no user data.
50. **Members**: owners add existing accounts by email (no e-mail invitations in v1), change roles, remove.
51. **Assistant** streams text deltas (Claude streaming API) to the chat; candidates show a 3D thumbnail and
    a translucent preview in the scene before acceptance.
52. **Initial JS** grew to ~320 KB gzipped (budget 600 KB): rolldown hoists its CommonJS interop helpers into
    the Three.js chunk, so the entry imports it. Not worth a custom bundler setup for now.
