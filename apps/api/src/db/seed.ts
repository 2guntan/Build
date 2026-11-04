import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { RuleSet } from '@fs/rules';
import type { Db } from './client.js';
import { jurisdiction, ruleSet } from './schema.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data/jurisdictions', import.meta.url));

const JURISDICTIONS: Record<string, { name: string; country: string; defaultCrs: string }> = {
  'sn-dakar': { name: 'Dakar', country: 'SN', defaultCrs: 'EPSG:32628' },
};

/** Loads every jurisdiction folder and its rule set files. Idempotent. */
export async function seed(db: Db): Promise<void> {
  for (const dir of readdirSync(DATA_DIR)) {
    const meta = JURISDICTIONS[dir];
    if (!meta) continue;
    await db
      .insert(jurisdiction)
      .values({ id: dir, ...meta })
      .onConflictDoUpdate({ target: jurisdiction.id, set: meta });
    for (const f of readdirSync(join(DATA_DIR, dir)).filter((x) => x.endsWith('.json'))) {
      const content = RuleSet.parse(JSON.parse(readFileSync(join(DATA_DIR, dir, f), 'utf8')));
      await db
        .insert(ruleSet)
        .values({
          jurisdictionId: dir,
          version: content.jurisdiction.version,
          content,
          isTest: content.test === true,
          // Test fixtures stay drafts forever; official sets are published by a reviewer.
          status: 'draft',
        })
        .onConflictDoUpdate({
          target: [ruleSet.jurisdictionId, ruleSet.version],
          set: { content, isTest: content.test === true },
          where: sql`${ruleSet.status} = 'draft'`,
        });
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { loadConfig } = await import('../config.js');
  const { createDb } = await import('./client.js');
  const { db, pool } = createDb(loadConfig().DATABASE_URL);
  await seed(db);
  await pool.end();
  console.log('Seed done');
}
