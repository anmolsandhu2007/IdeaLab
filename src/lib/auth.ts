import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type Environment = Record<string, string | undefined>;
export const SESSION_SECONDS = 8 * 60 * 60;
export class AccessError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function accessConfig(env: Environment = process.env) {
  const production = env.NODE_ENV === 'production';
  const password = env.APP_ACCESS_PASSWORD || '';
  const secret = env.APP_SESSION_SECRET || '';
  const configuredOrigin = env.APP_ORIGIN || env.RENDER_EXTERNAL_URL;
  let origin: string | undefined;
  if (configuredOrigin) {
    try {
      const parsed = new URL(configuredOrigin);
      if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/' ||
          (production ? parsed.protocol !== 'https:' : !['http:', 'https:'].includes(parsed.protocol))) throw new Error();
      origin = parsed.origin;
    } catch { throw new AccessError(503, 'Application access is not configured correctly.'); }
  }
  if ((production && (!password || password.length < 16 || !origin)) ||
      (password && secret.length < 32)) {
    throw new AccessError(503, 'Application access is not configured correctly.');
  }
  return { enabled: !!password, production, password, secret, origin,
    cookieName: production ? '__Host-idealab-session' : 'idealab-session' };
}
type AccessConfig = ReturnType<typeof accessConfig>;
function signingKey(config: AccessConfig) {
  // Password rotation also invalidates all previously signed sessions.
  return createHmac('sha256', config.secret).update('idealab-session-v1\0')
    .update(createHash('sha256').update(config.password).digest()).digest();
}
export function passwordMatches(candidate: string, config: AccessConfig) {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(candidate), digest(config.password));
}
export function issueSession(config: AccessConfig, now = Date.now()) {
  if (!config.enabled) throw new AccessError(503, 'Password access is not enabled.');
  const iat = Math.floor(now / 1000);
  const payload = Buffer.from(JSON.stringify({ v: 1, iat, exp: iat + SESSION_SECONDS,
    nonce: randomBytes(16).toString('hex') })).toString('base64url');
  const signature = createHmac('sha256', signingKey(config)).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
export function verifySession(token: string | undefined, config: AccessConfig, now = Date.now()) {
  if (!config.enabled) return true;
  if (!token || token.length > 2048) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return false;
    const expected = createHmac('sha256', signingKey(config)).update(parts[0]).digest();
    const actual = Buffer.from(parts[1], 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
    const value = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const seconds = Math.floor(now / 1000);
    return value.v === 1 && Number.isInteger(value.exp) && Number.isInteger(value.iat) &&
      value.exp > seconds && value.iat <= seconds + 30 && value.exp - value.iat === SESSION_SECONDS &&
      typeof value.nonce === 'string' && /^[a-f0-9]{32}$/.test(value.nonce);
  } catch { return false; }
}
export function sessionCookie(config: AccessConfig) {
  return { httpOnly: true, secure: config.production, sameSite: 'strict' as const,
    path: '/', maxAge: SESSION_SECONDS };
}
export function requestSession(request: Request, config: AccessConfig) {
  const values = (request.headers.get('cookie') || '').split(';')
    .map(value => value.trim()).filter(value => value.startsWith(`${config.cookieName}=`));
  if (values.length !== 1) return !config.enabled;
  return verifySession(values[0].slice(config.cookieName.length + 1), config);
}
export function requireSession(request: Request, env: Environment = process.env) {
  const config = accessConfig(env);
  if (!requestSession(request, config)) throw new AccessError(401, 'Please sign in to access this workspace.');
  return config;
}
