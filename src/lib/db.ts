import { PrismaClient } from '@prisma/client';
import { databaseAdapter, initializeDatabase } from './database-config';
import type { Run, IdeaInput } from './schema';

const cache = globalThis as unknown as { ideaDb?: PrismaClient; ideaDbReady?: Promise<void> };
const { adapter, remote } = databaseAdapter();
export const db = cache.ideaDb ??= new PrismaClient({ adapter });

export async function ready() {
  await (cache.ideaDbReady ??= initializeDatabase(db, remote).catch(error => {
    cache.ideaDbReady = undefined;
    throw error;
  }));
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
