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
