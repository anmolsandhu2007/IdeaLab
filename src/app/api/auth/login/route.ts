import { NextResponse } from 'next/server';
import { z } from 'zod';
import { accessConfig, issueSession, passwordMatches, sessionCookie } from '@/lib/auth';
import { guardOrigin, apiError, readJson } from '@/lib/http';
export const runtime = 'nodejs';
const attempts = globalThis as unknown as { loginWindow?: { start: number; count: number } };
export async function POST(request: Request) {
  try {
    guardOrigin(request);
    const config = accessConfig();
    const now = Date.now();
    if (!attempts.loginWindow || now - attempts.loginWindow.start >= 60_000) attempts.loginWindow = { start: now, count: 0 };
    if (++attempts.loginWindow.count > 20) return NextResponse.json({ error: 'Too many sign-in attempts. Wait one minute and try again.' }, { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } });
    const value = z.object({ password: z.string().max(1024) }).parse(await readJson(request));
    if (!config.enabled) return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    if (!passwordMatches(value.password, config)) return NextResponse.json({ error: 'Incorrect workspace password.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(config.cookieName, issueSession(config), sessionCookie(config));
    return response;
  } catch (error) { return apiError(error); }
}
