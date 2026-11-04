import { PgBoss } from 'pg-boss';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { runExport } from './services/export.js';
import { runSiteImport } from './services/site-data.js';
import type { Storage } from './services/storage.js';

export interface Jobs {
  enqueue(name: 'site.import' | 'export.build', data: { id: string }): Promise<void>;
  stop(): Promise<void>;
}

/** pg-boss queue in Postgres. With JOBS_ENABLED=false, jobs run inline (tests). */
export async function createJobs(cfg: Config, db: Db, storage: Storage): Promise<Jobs> {
  const handlers = {
    'site.import': (id: string) => runSiteImport(db, cfg, storage, id),
    'export.build': (id: string) => runExport(db, cfg, storage, id),
  } as const;
  if (!cfg.JOBS_ENABLED) {
    return {
      enqueue: async (name, data) => handlers[name](data.id),
      stop: async () => undefined,
    };
  }
  const boss = new PgBoss(cfg.DATABASE_URL);
  boss.on('error', (e) => console.error('pg-boss', e));
  await boss.start();
  for (const name of Object.keys(handlers) as (keyof typeof handlers)[]) {
    await boss.createQueue(name);
    await boss.work<{ id: string }>(name, async (jobs) => {
      for (const j of jobs) await handlers[name](j.data.id);
    });
  }
  return {
    enqueue: async (name, data) => {
      await boss.send(name, data);
    },
    stop: () => boss.stop({ graceful: true }),
  };
}
