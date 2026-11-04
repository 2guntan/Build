import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import * as schema from './db/schema.js';

export function createAuth(db: Db, cfg: Config) {
  const google =
    cfg.GOOGLE_CLIENT_ID && cfg.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: cfg.GOOGLE_CLIENT_ID, clientSecret: cfg.GOOGLE_CLIENT_SECRET } }
      : {};
  return betterAuth({
    baseURL: cfg.API_PUBLIC_URL,
    basePath: '/api/v1/auth',
    secret: cfg.BETTER_AUTH_SECRET,
    trustedOrigins: [cfg.WEB_ORIGIN],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    socialProviders: google,
    databaseHooks: {
      user: {
        create: {
          // Every new user gets a personal organization they own.
          after: async (u) => {
            const [org] = await db
              .insert(schema.organization)
              .values({ name: u.name ? `${u.name}` : u.email })
              .returning();
            await db.insert(schema.membership).values({ orgId: org!.id, userId: u.id, role: 'owner' });
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
