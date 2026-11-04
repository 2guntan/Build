import { loadConfig } from '../config.js';
import { createDb, runMigrations } from './client.js';

const cfg = loadConfig();
const { db, pool } = createDb(cfg.DATABASE_URL);
await runMigrations(db);
await pool.end();
console.log('Migrations applied');
