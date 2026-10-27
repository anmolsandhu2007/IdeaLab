import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export function guardLocal(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get('host')?.split(':')[0];
  if (!host || !['127.0.0.1', 'localhost'].includes(host)) throw new Error('LOCAL_ONLY');
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) throw new Error('LOCAL_ONLY');
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new Error('LOCAL_ONLY');
}
export async function readJson(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new Error('Expected application/json.');
  if (Number(request.headers.get('content-length') || 0) > 20_000) throw new Error('Request is too large.');
  const text = await request.text();
  if (text.length > 20_000) throw new Error('Request is too large.');
  return JSON.parse(text);
}
export function apiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message || 'Invalid input.' }, { status: 400 });
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  if (message === 'LOCAL_ONLY') return NextResponse.json({ error: 'This app only accepts local, same-origin requests.' }, { status: 403 });
  return NextResponse.json({ error: message.slice(0, 500) }, { status: 400 });
}
