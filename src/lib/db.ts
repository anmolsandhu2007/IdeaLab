import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Run, IdeaInput } from './schema';

const cache = globalThis as unknown as { ideaDb?: PrismaClient; ideaDbReady?: Promise<void> };
const dataDirectory = process.env.IDEA_LAB_DATA_DIR || path.join(process.cwd(), 'data');
mkdirSync(dataDirectory, { recursive: true });
const adapter = new PrismaBetterSqlite3({ url: `file:${path.join(dataDirectory, 'idea-lab.db')}` });
export const db = cache.ideaDb ??= new PrismaClient({ adapter });

export async function ready() {
  await (cache.ideaDbReady ??= (async () => {
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ResearchRun (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL,
      stage TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0,
      input TEXT NOT NULL, sources TEXT NOT NULL DEFAULT '[]', report TEXT,
      warnings TEXT NOT NULL DEFAULT '[]', error TEXT,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    )`);
    await db.$queryRawUnsafe('PRAGMA journal_mode = WAL');
    await db.$queryRawUnsafe('PRAGMA busy_timeout = 5000');
  })());
}

type Row = Awaited<ReturnType<typeof db.researchRun.findFirst>>;
function decode(row: NonNullable<Row>): Run {
  return { ...row, status: row.status as Run['status'], input: JSON.parse(row.input),
    sources: JSON.parse(row.sources), report: row.report ? JSON.parse(row.report) : null,
    warnings: JSON.parse(row.warnings) };
}
export async function listRuns() {
  await ready();
  return (await db.researchRun.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })).map(decode);
}
export async function getRun(id: string) {
  await ready();
  const row = await db.researchRun.findUnique({ where: { id } });
  return row ? decode(row) : null;
}
export async function createRun(input: IdeaInput) {
  await ready();
  const now = new Date().toISOString();
  return decode(await db.researchRun.create({ data: {
    id: crypto.randomUUID(), title: input.idea.slice(0, 85), input: JSON.stringify(input),
    status: 'queued', stage: 'Waiting for research worker', createdAt: now, updatedAt: now,
  } }));
}
export async function updateRun(id: string, data: Partial<Omit<Run, 'id' | 'input' | 'createdAt'>>) {
  const { sources, report, warnings, ...rest } = data;
  await db.researchRun.update({ where: { id }, data: {
    ...rest, updatedAt: new Date().toISOString(),
    ...(sources !== undefined ? { sources: JSON.stringify(sources) } : {}),
    ...(report !== undefined ? { report: report ? JSON.stringify(report) : null } : {}),
    ...(warnings !== undefined ? { warnings: JSON.stringify(warnings) } : {}),
  } });
}
