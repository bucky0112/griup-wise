import { describe, it, expect } from 'vitest';
import type { AdminSession, StudentSession } from '@/lib/auth';
import { SESSION_MAX_AGE_SECONDS, signSessionToken, verifySessionToken } from '../session-token';

const SECRET = 'a'.repeat(64);
const OTHER_SECRET = 'b'.repeat(64);
const ISSUED_AT = new Date('2026-10-16T00:00:00Z');
const ONE_HOUR_LATER = new Date(ISSUED_AT.getTime() + 60 * 60 * 1000);

const admin: AdminSession = { type: 'admin', id: 'admin-1', name: 'Admin', email: 'admin@example.com' };
const student: StudentSession = {
  type: 'student',
  participantId: 'participant-1',
  quizId: 'quiz-1',
  displayName: '學生',
  studentNo: 'S001',
};

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('session token', () => {
  it('returns the admin session from a token signed with the server secret, 1 hour old', () => {
    const token = signSessionToken(admin, SECRET, ISSUED_AT);
    expect(verifySessionToken(token, SECRET, ONE_HOUR_LATER)).toEqual(admin);
  });

  it('round-trips a student session', () => {
    const token = signSessionToken(student, SECRET, ISSUED_AT);
    expect(verifySessionToken(token, SECRET, ONE_HOUR_LATER)).toEqual(student);
  });

  it('rejects the token when one payload character is changed', () => {
    const [payload, signature] = signSessionToken(admin, SECRET, ISSUED_AT).split('.');
    const flipped = payload.slice(0, 5) + (payload[5] === 'A' ? 'B' : 'A') + payload.slice(6);
    expect(verifySessionToken(`${flipped}.${signature}`, SECRET, ONE_HOUR_LATER)).toBeNull();
  });

  it('rejects a payload granting another identity under the original signature', () => {
    const [, signature] = signSessionToken(admin, SECRET, ISSUED_AT).split('.');
    const forged = encode({ session: { ...admin, id: 'admin-2' }, exp: 9999999999 });
    expect(verifySessionToken(`${forged}.${signature}`, SECRET, ONE_HOUR_LATER)).toBeNull();
  });

  it('rejects the token when the signature is replaced', () => {
    const [payload] = signSessionToken(admin, SECRET, ISSUED_AT).split('.');
    const otherSignature = signSessionToken(student, SECRET, ISSUED_AT).split('.')[1];
    expect(verifySessionToken(`${payload}.${otherSignature}`, SECRET, ONE_HOUR_LATER)).toBeNull();
  });

  it('rejects unsigned JSON in the pre-change format', () => {
    expect(verifySessionToken(JSON.stringify(admin), SECRET, ONE_HOUR_LATER)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = signSessionToken(admin, OTHER_SECRET, ISSUED_AT);
    expect(verifySessionToken(token, SECRET, ONE_HOUR_LATER)).toBeNull();
  });

  it('rejects a token issued 6 hours and 1 second ago', () => {
    const token = signSessionToken(admin, SECRET, ISSUED_AT);
    const expired = new Date(ISSUED_AT.getTime() + (SESSION_MAX_AGE_SECONDS + 1) * 1000);
    expect(verifySessionToken(token, SECRET, expired)).toBeNull();
  });

  it('rejects a validly signed session with an unknown type', () => {
    const token = signSessionToken({ ...admin, type: 'owner' } as unknown as AdminSession, SECRET, ISSUED_AT);
    expect(verifySessionToken(token, SECRET, ONE_HOUR_LATER)).toBeNull();
  });

  it.each(['', 'abc', 'a.b.c', '.'])('rejects malformed value %j', (value) => {
    expect(verifySessionToken(value, SECRET, ONE_HOUR_LATER)).toBeNull();
  });
});
