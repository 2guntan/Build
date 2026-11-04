import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createDb, runMigrations } from '../src/db/client.js';
import { seed } from '../src/db/seed.js';

let container: StartedPostgreSqlContainer | undefined;

/** Real Postgres 16 + PostGIS 3.4 for API tests. Set TEST_DATABASE_URL to reuse a running one. */
export async function setup({ provide }: { provide: (k: string, v: string) => void }) {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').withDatabase('fs').withUsername('fs').withPassword('fs').start();
    url = container.getConnectionUri();
  }
  const { db, pool } = createDb(url);
  await runMigrations(db);
  await seed(db);
  await pool.end();
  provide('databaseUrl', url);
}

export async function teardown() {
  await container?.stop();
}
