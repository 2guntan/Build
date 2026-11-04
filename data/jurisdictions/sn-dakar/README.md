# sn-dakar — rule sets

| File | Status | Use |
| --- | --- | --- |
| `test-fixture.json` | **TEST — non officiel** | Engine tests, solver tests, agent benchmark, local development |
| `ruleset.json` | *to be written* (milestone M2) | Production. Values transcribed by a person from the official documents, one article citation per rule, reviewed by a local architect or urban planner |

The test fixture's numbers are invented on purpose so that the engine can be
tested. They must never be shown to a user as real Dakar rules. The API marks
every evaluation made with it as `test`, and the UI shows a red banner.

## How to add the official rule set

1. Copy `test-fixture.json` to `ruleset.json`, remove `"test": true` and the disclaimer.
2. List each official document in `sources` (title, URL, date).
3. For each zone, transcribe each rule with `cite.source` and `cite.article`.
4. Run `pnpm --filter @fs/rules test` — the schema test validates every file in this folder.
5. Have the transcription reviewed, then load it with `pnpm db:seed` and publish it.

Candidate sources to confirm with the reviewer (open question in SPEC §14):
Code de l'urbanisme du Sénégal and its implementing decree, the Plan directeur
d'urbanisme (PDU) de Dakar et ses environs horizon 2035, and the relevant zone
regulations (plans d'urbanisme de détail).
