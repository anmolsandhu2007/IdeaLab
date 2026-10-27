import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { accessConfig, requireSession, AccessError, type Environment } from './auth';

export function guardOrigin(request: Request, env: Environment = process.env) {
  const config = accessConfig(env);
  const url = new URL(request.url);
  const host = request.headers.get('host');
  const expectedOrigin = config.origin || url.origin;
  const expectedHost = new URL(expectedOrigin).host;
  if (!host || host.toLowerCase() !== expectedHost.toLowerCase() ||
      (!config.origin && !['127.0.0.1', 'localhost'].includes(url.hostname))) {
    throw new AccessError(403, 'This request is not from the configured application origin.');
  }
  const origin = request.headers.get('origin');
  if ((origin && origin !== expectedOrigin) || request.headers.get('sec-fetch-site') === 'cross-site' ||
      (config.production && !['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !origin)) {
    throw new AccessError(403, 'Cross-origin requests are not allowed.');
  }
}
// Kept as the common guard for every existing API route: origin AND authentication.
export function guardLocal(request: Request, env: Environment = process.env) {
  guardOrigin(request, env);
  requireSession(request, env);
}
export async function readJson(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new AccessError(400, 'Expected application/json.');
  if (Number(request.headers.get('content-length') || 0) > 20_000) throw new AccessError(413, 'Request is too large.');
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = []; let bytes = 0;
  if (reader) {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.length;
      if (bytes > 20_000) { await reader.cancel(); throw new AccessError(413, 'Request is too large.'); }
      chunks.push(result.value);
    }
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AccessError(400, 'Invalid JSON request.'); }
}
export function apiError(error: unknown) {
  if (error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message || 'Invalid input.' }, { status: 400 });
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  if (message === 'LOCAL_ONLY') return NextResponse.json({ error: 'This app only accepts local, same-origin requests.' }, { status: 403 });
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'The request could not be completed. Please try again.' }, { status: 500 });
  return NextResponse.json({ error: message.slice(0, 500) }, { status: 400 });
}
