import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

type Environment = Record<string, string | undefined>;
export function databaseConfig(env: Environment = process.env) {
  const url = env.TURSO_DATABASE_URL?.trim();
  const authToken = env.TURSO_AUTH_TOKEN?.trim();
  if (url && authToken) {
    try {
      const parsed = new URL(url);
      if (!['libsql:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
    } catch { throw new Error('Turso configuration requires a valid secure database URL.'); }
    return { mode: 'turso' as const, url, authToken };
  }
  const directory = env.IDEA_LAB_DATA_DIR || path.join(process.cwd(), 'data');
  return { mode: 'local' as const, directory, url: `file:${path.join(directory, 'idea-lab.db')}` };
}
export function databaseAdapter(env: Environment = process.env) {
  const config = databaseConfig(env);
  if (config.mode === 'turso') return { remote: true, adapter: new PrismaLibSql({ url: config.url, authToken: config.authToken }) };
  mkdirSync(config.directory, { recursive: true });
  return { remote: false, adapter: new PrismaBetterSqlite3({ url: config.url }) };
}

type Initializer = {
  $executeRawUnsafe(query: string): Promise<unknown>;
  $queryRawUnsafe(query: string): Promise<unknown>;
};
export async function initializeDatabase(client: Initializer, remote: boolean) {
  await client.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ResearchRun (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL,
    stage TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0,
    input TEXT NOT NULL, sources TEXT NOT NULL DEFAULT '[]', report TEXT,
    warnings TEXT NOT NULL DEFAULT '[]', error TEXT,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  )`);
  if (!remote) {
    await client.$queryRawUnsafe('PRAGMA journal_mode = WAL');
    await client.$queryRawUnsafe('PRAGMA busy_timeout = 5000');
  }
}
