import { NextResponse } from 'next/server';
import { accessConfig, sessionCookie } from '@/lib/auth';
import { apiError, guardLocal } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    guardLocal(request);
    const config = accessConfig();
    const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(config.cookieName, '', { ...sessionCookie(config), maxAge: 0 });
    return response;
  } catch (error) { return apiError(error); }
}
