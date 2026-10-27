import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { databaseConfig, databaseAdapter, initializeDatabase } from '../src/lib/database-config';
import { accessConfig, issueSession, verifySession, requireSession, passwordMatches, sessionCookie, SESSION_SECONDS } from '../src/lib/auth';
import { guardLocal, guardOrigin, readJson, apiError } from '../src/lib/http';

const environment = { NODE_ENV: 'production', APP_ACCESS_PASSWORD: randomBytes(24).toString('hex'),
  APP_SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'https://idealab.example' };
const config = accessConfig(environment);
function request(method = 'GET', extras: Record<string, string> = {}) {
  return new Request('http://127.0.0.1/api/settings', { method,
    headers: { host: 'idealab.example', origin: 'https://idealab.example', ...extras } });
}

test('Turso requires both variables; partial or absent credentials preserve local SQLite', () => {
  const local = mkdtempSync(path.join(process.cwd(), '.local', 'db-selection-'));
  assert.equal(databaseConfig({ IDEA_LAB_DATA_DIR: local }).mode, 'local');
  assert.equal(databaseConfig({ TURSO_DATABASE_URL: 'libsql://fixture.turso.io', IDEA_LAB_DATA_DIR: local }).mode, 'local');
  assert.equal(databaseConfig({ TURSO_AUTH_TOKEN: 'fixture', IDEA_LAB_DATA_DIR: local }).mode, 'local');
  assert.ok(databaseAdapter({ IDEA_LAB_DATA_DIR: local }).adapter instanceof PrismaBetterSqlite3);
  const remote = databaseAdapter({ TURSO_DATABASE_URL: 'libsql://fixture.turso.io', TURSO_AUTH_TOKEN: 'fixture-not-real' });
  assert.equal(remote.remote, true); assert.ok(remote.adapter instanceof PrismaLibSql);
  assert.throws(() => databaseConfig({ TURSO_DATABASE_URL: 'http://unsafe.example', TURSO_AUTH_TOKEN: 'fixture' }), /secure database URL/);
});
test('remote initialization creates the unchanged table without local SQLite PRAGMAs', async () => {
  const calls: string[] = [];
  const client = { $executeRawUnsafe: async (sql: string) => { calls.push(sql); },
    $queryRawUnsafe: async (sql: string) => { calls.push(sql); } };
  await initializeDatabase(client, true);
  assert.equal(calls.length, 1); assert.match(calls[0], /CREATE TABLE IF NOT EXISTS ResearchRun/);
  calls.length = 0; await initializeDatabase(client, false);
  assert.equal(calls.length, 3); assert.match(calls[1], /PRAGMA journal_mode/); assert.match(calls[2], /busy_timeout/);
});
test('libSQL adapter initializes and preserves ResearchRun records across connections', async () => {
  // The real libSQL adapter is exercised using a file transport; no remote credentials are used.
  const directory = mkdtempSync(path.join(process.cwd(), '.local', 'libsql-test-'));
  const url = `file:${path.join(directory, 'test.db')}`;
  const first = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  try {
    await initializeDatabase(first, true); await initializeDatabase(first, true);
    await first.researchRun.create({ data: { id: 'fixture-run', title: 'Fixture research', status: 'queued', stage: 'Queued',
      input: '{}', createdAt: '2026-10-27T00:00:00Z', updatedAt: '2026-10-27T00:00:00Z' } });
  } finally { await first.$disconnect(); }
  const second = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  try { assert.equal((await second.researchRun.findUnique({ where: { id: 'fixture-run' } }))?.title, 'Fixture research'); }
  finally { await second.$disconnect(); }
});
test('production fails closed without password, signing secret, or trusted HTTPS origin', () => {
  for (const env of [{ NODE_ENV: 'production' }, { ...environment, APP_ACCESS_PASSWORD: '' },
    { ...environment, APP_ACCESS_PASSWORD: 'short' }, { ...environment, APP_SESSION_SECRET: '' },
    { ...environment, APP_ORIGIN: '' }, { ...environment, APP_ORIGIN: 'http://idealab.example' },
    { ...environment, APP_ORIGIN: 'https://idealab.example/redirect' }]) assert.throws(() => accessConfig(env));
  assert.equal(accessConfig({ ...environment, APP_ORIGIN: undefined, RENDER_EXTERNAL_URL: environment.APP_ORIGIN }).origin, environment.APP_ORIGIN);
});
test('development remains usable without login while local origin restrictions remain', () => {
  assert.equal(accessConfig({ NODE_ENV: 'development' }).enabled, false);
  assert.doesNotThrow(() => guardLocal(new Request('http://localhost:3000/api/runs', { headers: { host: 'localhost:3000' } }), { NODE_ENV: 'development' }));
  assert.throws(() => guardLocal(new Request('https://evil.example/api/runs', { headers: { host: 'evil.example' } }), { NODE_ENV: 'development' }));
});
test('signed sessions reject tampering, expiry, future issuance, malformed input, and rotation', () => {
  const now = Date.now(), token = issueSession(config, now);
  assert.equal(verifySession(token, config, now), true);
  assert.equal(verifySession(`${token}x`, config, now), false);
  assert.equal(verifySession(token.replace(/^./, token[0] === 'e' ? 'a' : 'e'), config, now), false);
  assert.equal(verifySession(token, config, now + SESSION_SECONDS * 1000), false);
  assert.equal(verifySession(issueSession(config, now + 120_000), config, now), false);
  assert.equal(verifySession('not-a-session', config), false);
  assert.equal(verifySession('x'.repeat(3000), config), false);
  assert.equal(verifySession(token, accessConfig({ ...environment, APP_ACCESS_PASSWORD: randomBytes(24).toString('hex') })), false);
  assert.equal(verifySession(token, accessConfig({ ...environment, APP_SESSION_SECRET: randomBytes(32).toString('hex') })), false);
});
test('password comparisons and production cookie attributes protect the shared session', () => {
  assert.equal(passwordMatches(environment.APP_ACCESS_PASSWORD, config), true);
  assert.equal(passwordMatches('wrong', config), false);
  assert.equal(passwordMatches('wrong'.repeat(100), config), false);
  assert.deepEqual(sessionCookie(config), { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: SESSION_SECONDS });
  assert.equal(config.cookieName, '__Host-idealab-session');
});
test('API access requires a valid session independently of proxy and origin checks', () => {
  const cookie = `${config.cookieName}=${issueSession(config)}`;
  assert.throws(() => requireSession(request(), environment), /sign in/);
  assert.doesNotThrow(() => guardLocal(request('POST', { cookie }), environment));
  assert.throws(() => guardLocal(request('POST', { cookie, origin: 'https://evil.example' }), environment));
  assert.throws(() => guardLocal(request('POST', { cookie, 'sec-fetch-site': 'cross-site' }), environment));
  assert.throws(() => guardLocal(request('POST', { cookie, host: 'evil.example' }), environment));
  assert.throws(() => requireSession(request('GET', { cookie: `${cookie}; ${cookie}` }), environment));
  const missingOrigin = request('POST', { cookie }); missingOrigin.headers.delete('origin');
  assert.throws(() => guardOrigin(missingOrigin, environment));
  assert.throws(() => guardLocal(request('GET', { 'x-middleware-subrequest': 'proxy:proxy:proxy:proxy:proxy' }), environment));
});
test('JSON parsing rejects oversized and malformed login payloads without echoing passwords', async () => {
  const candidate = randomBytes(20).toString('hex');
  const bad = new Request('http://localhost/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: `{"password":"${candidate}` });
  await assert.rejects(readJson(bad), (error: Error) => error.message === 'Invalid JSON request.' && !error.message.includes(candidate));
  const large = new Request('http://localhost/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'x'.repeat(21000) }) });
  await assert.rejects(readJson(large), /too large/);
  const response = apiError(new (await import('../src/lib/auth')).AccessError(401, 'Please sign in.'));
  assert.equal(response.status, 401); assert.equal(response.headers.get('cache-control'), 'no-store');
  const oldEnvironment = process.env.NODE_ENV;
  try {
    Object.assign(process.env, { NODE_ENV: 'production' });
    const internal = apiError(new Error(`Database failure: ${candidate}`));
    assert.equal(internal.status, 500); assert.equal((await internal.text()).includes(candidate), false);
  } finally {
    if (oldEnvironment === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Object.assign(process.env, { NODE_ENV: oldEnvironment });
  }
});
