import { NextResponse, type NextRequest } from 'next/server';
import { accessConfig, requestSession } from './lib/auth';

export function proxy(request: NextRequest) {
  let config;
  try { config = accessConfig(); }
  catch {
    return new NextResponse('Application access is not configured correctly.', {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  }
  const pathname = request.nextUrl.pathname;
  if (pathname === '/login' || pathname === '/api/auth/login') return NextResponse.next();
  if (!requestSession(request, config)) {
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Please sign in to access this workspace.' }, {
        status: 401, headers: { 'Cache-Control': 'no-store' },
      });
    }
    return NextResponse.redirect(new URL('/login', config.origin || request.url));
  }
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
