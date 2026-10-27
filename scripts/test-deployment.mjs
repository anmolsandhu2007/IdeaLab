import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const { accessConfig, issueSession, SESSION_SECONDS } = require('../.local/runtime/src/lib/auth.js');
const origin = 'https://deployment-test.example';
const password = randomBytes(24).toString('hex');
const signingSecret = randomBytes(32).toString('hex');
let checks = 0;
function passed(message) { checks++; console.log(`PASS ${message}`); }
async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve)); return port;
}
async function boot(overrides = {}) {
  const port = await freePort();
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port),
    APP_ORIGIN: origin, RENDER_EXTERNAL_URL: '', APP_ACCESS_PASSWORD: password, APP_SESSION_SECRET: signingSecret,
    TURSO_DATABASE_URL: '', TURSO_AUTH_TOKEN: '', NVIDIA_API_KEY: '', TAVILY_API_KEY: '',
    IDEA_LAB_DATA_DIR: mkdtempSync(path.join(process.cwd(), '.local', 'http-test-')), ...overrides };
  // No --port argument: verifies Next.js honors Render's PORT environment variable.
  const startCommand = JSON.parse(readFileSync('package.json', 'utf8')).scripts.start;
  assert.equal(startCommand, 'next start --hostname 0.0.0.0');
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), ...startCommand.split(' ').slice(1)], {
    env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Drain startup logs without printing environment data or request payloads.
  child.stdout.resume(); child.stderr.resume();
  let exited = false; child.on('exit', () => { exited = true; });
  const base = `http://127.0.0.1:${port}`;
  // Native HTTP preserves the public Host exactly, emulating Render's TLS proxy.
  // Node fetch may rewrite Host to the loopback URL and would test the wrong origin.
  const call = (pathname, { method = 'GET', cookie, body, headers = {}, sendOrigin = true } = {}) => new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = httpRequest(base + pathname, { method,
      headers: { Host: new URL(origin).host, ...(sendOrigin ? { Origin: origin } : {}),
        ...(cookie ? { Cookie: cookie } : {}), ...(payload !== undefined ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}), ...headers },
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const resultHeaders = new Headers();
        for (const [key, value] of Object.entries(response.headers)) {
          for (const entry of Array.isArray(value) ? value : value === undefined ? [] : [value]) resultHeaders.append(key, entry);
        }
        resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: resultHeaders }));
      });
      response.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Local HTTP test timed out.')));
    req.end(payload);
  });
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (exited) throw new Error('Production test server exited before readiness.');
    try { await call('/login'); ready = true; break; } catch { await delay(200); }
  }
  if (!ready) { child.kill(); throw new Error('Production test server did not become ready.'); }
  return { call, env, stop: async () => {
    if (exited) return;
    const done = new Promise(resolve => child.once('exit', resolve));
    child.kill(); await done;
  } };
}

async function main() {
  const server = await boot();
  try {
    const { call } = server;
    const home = await call('/');
    assert.equal(home.status, 307); assert.equal(home.headers.get('location'), `${origin}/login`);
    const loginPage = await call('/login'); assert.equal(loginPage.status, 200);
    assert.ok((await loginPage.text()).includes('Workspace password'));
    passed('anonymous UI redirects to a working login page without a loop');

    for (const [pathname, method] of [['/api/runs', 'GET'], ['/api/runs', 'POST'], ['/api/settings', 'GET'],
      ['/api/settings', 'POST'], ['/api/runs/fixture', 'GET'], ['/api/runs/fixture/retry', 'POST'], ['/api/auth/logout', 'POST']]) {
      const response = await call(pathname, { method }); assert.equal(response.status, 401);
    }
    const bypass = await call('/api/runs', { headers: { 'x-middleware-subrequest': 'proxy:proxy:proxy:proxy:proxy' } });
    assert.equal(bypass.status, 401);
    passed('all existing API routes, mutations, logout, and proxy-bypass headers require authentication');

    assert.equal((await call('/api/auth/login', { method: 'POST', body: { password }, headers: { Origin: 'https://evil.example' } })).status, 403, 'cross-origin login');
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { password }, sendOrigin: false })).status, 403, 'missing-Origin login');
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { password: 'wrong-password' } })).status, 401, 'incorrect-password login');
    passed('login rejects cross-origin requests, missing Origin, and an incorrect password');

    const login = await call('/api/auth/login', { method: 'POST', body: { password } });
    assert.equal(login.status, 200);
    const setCookie = login.headers.get('set-cookie') || '';
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=strict', 'Path=/', 'Max-Age=28800']) assert.ok(setCookie.toLowerCase().includes(flag.toLowerCase()), `cookie flag ${flag}`);
    assert.ok(setCookie.startsWith('__Host-idealab-session='), 'host-prefixed cookie name');
    const cookie = setCookie.split(';')[0];
    assert.equal((await call('/', { cookie })).status, 200);
    const back = await call('/login', { cookie }); assert.equal(back.status, 307); assert.equal(new URL(back.headers.get('location'), origin).href, `${origin}/`);
    passed('valid login issues a signed Secure/HttpOnly/SameSite cookie and opens the workspace');

    const settings = await call('/api/settings', { cookie }); assert.equal(settings.status, 200);
    const settingsBody = await settings.text();
    assert.ok(!settingsBody.includes(password) && !settingsBody.includes(signingSecret));
    assert.equal((await call('/api/runs', { cookie })).status, 200);
    assert.equal((await call('/api/runs', { method: 'POST', cookie, body: {} })).status, 400);
    assert.equal((await call('/api/runs/fixture', { cookie })).status, 404);
    assert.equal((await call('/api/runs/fixture/retry', { method: 'POST', cookie })).status, 404);
    assert.equal((await call('/api/settings', { method: 'POST', cookie, body: { key: 'fixture-not-a-real-provider-key', model: 'nvidia/fixture' } })).status, 200);
    passed('authenticated history, settings, research validation, lookup, and retry handlers execute');

    assert.equal((await call('/api/settings', { method: 'POST', cookie, body: {}, headers: { Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await call('/api/auth/logout', { method: 'POST', cookie, headers: { Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await call('/api/settings', { method: 'POST', cookie, body: {}, sendOrigin: false })).status, 403);
    assert.equal((await call('/api/runs', { cookie, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    passed('same-origin and CSRF checks remain enforced after authentication, including logout');

    assert.equal((await call('/api/runs', { cookie: cookie + 'x' })).status, 401);
    const expired = issueSession(accessConfig(server.env), Date.now() - (SESSION_SECONDS + 1) * 1000);
    assert.equal((await call('/api/runs', { cookie: `__Host-idealab-session=${expired}` })).status, 401);
    passed('tampered and expired cookies are rejected by the deployed HTTP gate');

    const logout = await call('/api/auth/logout', { method: 'POST', cookie }); assert.equal(logout.status, 200);
    assert.ok((logout.headers.get('set-cookie') || '').toLowerCase().includes('max-age=0'));
    assert.equal((await call('/api/runs')).status, 401);
    passed('logout clears the browser session and anonymous history access is blocked');

    let limited = false;
    for (let i = 0; i < 25; i++) {
      const response = await call('/api/auth/login', { method: 'POST', body: { password: 'wrong-password' } });
      if (response.status === 429) { limited = true; break; }
    }
    assert.ok(limited); passed('repeated login attempts trigger the bounded in-memory rate limit');
  } finally { await server.stop(); }

  const closed = await boot({ APP_ACCESS_PASSWORD: '' });
  try {
    for (const route of ['/', '/login', '/api/auth/login', '/api/settings', '/api/runs']) assert.equal((await closed.call(route)).status, 503);
    passed('production with missing security configuration fails closed for UI and APIs');
  } finally { await closed.stop(); }
  console.log(`${checks} production HTTP security checks passed. No external AI/database calls were made.`);
}
main().catch(error => {
  console.error('Production HTTP security checks failed. No secrets or server logs were printed.');
  if (error instanceof assert.AssertionError && typeof error.actual === 'number' && typeof error.expected === 'number') {
    console.error(`HTTP status: expected ${error.expected}, received ${error.actual}. Check: ${error.message.split('\n')[0]}`);
  }
  process.exitCode = 1;
});
