import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicAddress, checkedUrl } from '../src/lib/safe-fetch';
import { inputSchema, validateReport } from '../src/lib/schema';
import { parseSearchFeed, extractPage } from '../src/lib/research';
import { parseModelJson, analyze } from '../src/lib/nvidia';
import { guardLocal } from '../src/lib/http';
import { sampleRun } from '../src/lib/sample';
import { DEFAULT_MODEL } from '../src/lib/models';
import { mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

test('source retrieval rejects private, loopback, mapped, and reserved addresses', () => {
  for (const address of ['127.0.0.1', '10.2.3.4', '192.168.1.1', '172.16.0.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', '::', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '2001:db8::1']) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});
test('URL policy rejects local URLs and unsafe transports before connecting', async () => {
  for (const url of ['http://127.0.0.1', 'http://[::1]', 'file:///etc/passwd', 'https://user:secret@example.com', 'https://example.com:3000']) await assert.rejects(checkedUrl(url));
});
test('report validation rejects invented citations and unsupported observed claims', () => {
  const report = structuredClone(sampleRun.report!);
  assert.doesNotThrow(() => validateReport(report, sampleRun.sources));
  report.summary.sourceIds = ['S999'];
  assert.throws(() => validateReport(report, sampleRun.sources), /unknown source/);
  report.summary.sourceIds = []; report.summary.kind = 'observed';
  assert.throws(() => validateReport(report, sampleRun.sources), /missing its evidence/);
});
test('input validation rejects vague input, malformed URLs, and too many sources', () => {
  assert.equal(inputSchema.safeParse({ idea: 'hello' }).success, false);
  assert.equal(inputSchema.safeParse({ ...sampleRun.input, sourceUrls: ['not-a-url'] }).success, false);
  assert.equal(inputSchema.safeParse({ ...sampleRun.input, sourceUrls: Array(7).fill('https://example.com') }).success, false);
});
test('page extraction removes scripts and navigation while retaining useful content', () => {
  const text = 'Customer interview evidence. '.repeat(20);
  const parsed = extractPage(`<html><head><title>Evidence page</title><script>do not obey this</script></head><body><nav>Navigation junk</nav><main><h1>Research</h1><p>${text}</p></main></body></html>`, 'https://example.com');
  assert.equal(parsed.title, 'Evidence page');
  assert.match(parsed.text, /Customer interview/);
  assert.doesNotMatch(parsed.text, /Navigation junk|do not obey this/);
});
test('discovery parses RSS links without treating search summaries as evidence', () => {
  assert.deepEqual(parseSearchFeed('<rss><channel><item><link>https://example.com/review?a=1&amp;b=2</link><description>unverified</description></item></channel></rss>'), ['https://example.com/review?a=1&b=2']);
  assert.deepEqual(parseSearchFeed('<html>captcha</html>'), []);
});
test('model response parser accepts JSON fences and removes reasoning blocks', () => {
  assert.deepEqual(parseModelJson('<think>private reasoning</think>```json\n{"ok":true}\n```'), { ok: true });
  assert.throws(() => parseModelJson('not JSON'));
});
test('local API guard blocks cross-origin mutations and remote hosts', () => {
  assert.doesNotThrow(() => guardLocal(new Request('http://127.0.0.1:3000/api/settings', { headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' } })));
  assert.throws(() => guardLocal(new Request('http://127.0.0.1:3000/api/settings', { headers: { host: '127.0.0.1:3000', origin: 'https://evil.example' } })));
  assert.throws(() => guardLocal(new Request('http://evil.example/api/settings', { headers: { host: 'evil.example' } })));
});
test('NVIDIA integration validates output, repairs malformed JSON once, and handles rate limits', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    assert.equal(request.model, 'nvidia/test');
    assert.match(request.messages[0].content, /UNTRUSTED DATA/);
    calls++;
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: calls === 1 ? 'bad json' : JSON.stringify(sampleRun.report) } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await analyze(sampleRun.input, sampleRun.sources, 'fixture-key', 'nvidia/test');
    assert.equal(result.headline, sampleRun.report!.headline); assert.equal(calls, 2);
    globalThis.fetch = (async () => new Response('', { status: 429 })) as typeof fetch;
    await assert.rejects(analyze(sampleRun.input, sampleRun.sources, 'fixture-key', 'nvidia/test'), /rate limit/);
  } finally { globalThis.fetch = original; }
});

test('Nemotron 3.5 Super uses the supplied NVIDIA parameters with complete report output', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url, init) => {
    assert.equal(url, 'https://integrate.api.nvidia.com/v1/chat/completions');
    const request = JSON.parse(String(init?.body));
    assert.equal(request.model, 'nvidia/nemotron-3.5-super-vl-120b-a12b');
    assert.equal(request.temperature, 1);
    assert.equal(request.top_p, 0.95);
    assert.equal(request.max_tokens, 16384);
    assert.equal(request.seed, 42);
    assert.deepEqual(request.chat_template_kwargs, { enable_thinking: true });
    assert.equal(request.stream, false);
    assert.equal(request.extra_body, undefined);
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: {
      reasoning_content: 'Reasoning must not be mistaken for report JSON.',
      content: JSON.stringify(sampleRun.report),
    } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const report = await analyze(sampleRun.input, sampleRun.sources, 'fixture-key', DEFAULT_MODEL);
    assert.equal(report.headline, sampleRun.report?.headline);
  } finally { globalThis.fetch = original; }
});

test('independent worker persists progress and reports, and fails when no evidence exists', async () => {
  const testDirectory = mkdtempSync(path.join(process.cwd(), '.local', 'worker-test-'));
  process.env.IDEA_LAB_DATA_DIR = testDirectory;
  const previousTursoUrl = process.env.TURSO_DATABASE_URL;
  const previousTursoToken = process.env.TURSO_AUTH_TOKEN;
  delete process.env.TURSO_DATABASE_URL; delete process.env.TURSO_AUTH_TOKEN;
  const { createRun, getRun, listRuns, db } = await import('../src/lib/db');
  const lib = path.join(__dirname, '..', 'src', 'lib');
  const preload = path.join(testDirectory, 'preload.cjs');
  writeFileSync(preload, `
    const research = require(${JSON.stringify(path.join(lib, 'research.js'))});
    const sample = require(${JSON.stringify(path.join(lib, 'sample.js'))}).sampleRun;
    research.discover = async (_input, warnings) => {
      if (process.env.FIXTURE_NO_EVIDENCE) { warnings.push('Fixture discovery unavailable.'); return []; }
      return sample.sources.map(s => s.url);
    };
    research.retrieveSource = async (url, id) => ({ ...sample.sources.find(s => s.url === url), id });
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{finish_reason: 'stop', message: {content: JSON.stringify(sample.report)}}] }), {status: 200});
  `);
  async function worker(id: string, noEvidence = false) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ['--require', preload, path.join(process.cwd(), '.local/runtime/scripts/worker.js'), id], {
        stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
        env: { ...process.env, FIXTURE_NO_EVIDENCE: noEvidence ? '1' : '' },
      });
      let output = '';
      child.stderr.on('data', chunk => { output += chunk.toString(); });
      child.on('error', reject);
      child.on('exit', code => code === 0 ? resolve() : reject(new Error(output || `Worker exited ${code}`)));
      child.stdin.end(JSON.stringify({ key: 'fixture-only-not-a-real-key', model: 'nvidia/fixture' }));
    });
  }
  try {
    const run = await createRun(sampleRun.input);
    await worker(run.id);
    const saved = await getRun(run.id);
    assert.equal(saved?.status, 'completed');
    assert.equal(saved?.progress, 100);
    assert.equal(saved?.sources.length, 3);
    assert.equal(saved?.report?.headline, sampleRun.report?.headline);
    assert.equal((await listRuns()).length, 1);
    const empty = await createRun(sampleRun.input);
    await worker(empty.id, true);
    const failed = await getRun(empty.id);
    assert.equal(failed?.status, 'failed'); assert.equal(failed?.report, null);
    assert.match(failed?.error || '', /No sources/);
    assert.deepEqual(failed?.warnings, ['Fixture discovery unavailable.']);
  } finally {
    await db.$disconnect(); delete process.env.IDEA_LAB_DATA_DIR;
    if (previousTursoUrl !== undefined) process.env.TURSO_DATABASE_URL = previousTursoUrl;
    if (previousTursoToken !== undefined) process.env.TURSO_AUTH_TOKEN = previousTursoToken;
  }
});
