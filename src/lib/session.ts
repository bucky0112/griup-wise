import { cookies } from 'next/headers';
import { UserSession } from './auth';
import { SESSION_MAX_AGE_SECONDS, signSessionToken, verifySessionToken } from './session-token';

const SESSION_COOKIE_NAME = 'group-wise-session';
const MIN_SECRET_LENGTH = 32;

// Read per call rather than at import so `pnpm build` does not need the secret
function readSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`SESSION_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters`);
  }
  return secret;
}

export async function createSession(session: UserSession): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, signSessionToken(session, readSessionSecret(), new Date()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  });
}

export async function getSession(): Promise<UserSession | null> {
  // cookies() first: during prerendering it marks the page dynamic before the secret is needed
  const cookieStore = await cookies();
  const secret = readSessionSecret();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!sessionCookie?.value) {
    return null;
  }

  return verifySessionToken(sessionCookie.value, secret, new Date());
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
