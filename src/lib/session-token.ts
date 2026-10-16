import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { UserSession } from './auth';

export const SESSION_MAX_AGE_SECONDS = 6 * 60 * 60; // 6 hours

const sessionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('admin'),
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
  z.object({
    type: z.literal('student'),
    participantId: z.string(),
    quizId: z.string(),
    displayName: z.string(),
    studentNo: z.string(),
  }),
]);

const payloadSchema = z.object({
  session: sessionSchema,
  exp: z.number(),
});

function sign(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

// Token format: base64url(JSON {session, exp}) + '.' + base64url(HMAC-SHA256 of the first part)
export function signSessionToken(session: UserSession, secret: string, now: Date): string {
  const exp = Math.floor(now.getTime() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = Buffer.from(JSON.stringify({ session, exp })).toString('base64url');
  return `${payload}.${sign(payload, secret).toString('base64url')}`;
}

// Returns null for anything the server did not issue unchanged and unexpired
export function verifySessionToken(token: string, secret: string, now: Date): UserSession | null {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [payload, signature] = parts;
  const expected = sign(payload, secret);
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  const parsed = payloadSchema.safeParse(decoded);
  if (!parsed.success || parsed.data.exp <= Math.floor(now.getTime() / 1000)) {
    return null;
  }

  return parsed.data.session;
}
