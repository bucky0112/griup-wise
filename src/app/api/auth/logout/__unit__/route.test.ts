import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserSession } from '@/lib/auth';

const session = vi.hoisted(() => ({
  current: null as UserSession | null,
  clearSession: vi.fn(async () => {}),
}));
vi.mock('@/lib/session', () => ({
  getSession: async () => session.current,
  clearSession: session.clearSession,
}));

import { POST } from '../route';

const admin: UserSession = { type: 'admin', id: 'a1', name: 'Admin', email: 'admin@example.com' };
const student: UserSession = { type: 'student', participantId: 'p1', quizId: 'q1', displayName: 'S', studentNo: 'S1' };

describe('POST /api/auth/logout', () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    session.clearSession.mockClear();
  });

  afterEach(() => {
    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  });

  for (const appUrl of [undefined, 'https://another-host.example.com']) {
    describe(`with NEXT_PUBLIC_APP_URL ${appUrl ?? 'unset'}`, () => {
      beforeEach(() => {
        if (appUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
        else process.env.NEXT_PUBLIC_APP_URL = appUrl;
      });

      it.each([
        ['admin', admin, '/login'],
        ['student', student, '/quiz/complete'],
        ['no session', null, '/'],
      ] as const)('redirects %s with 303 to a relative location', async (_label, current, location) => {
        session.current = current;

        const response = await POST();

        expect(response.status).toBe(303);
        expect(response.headers.get('location')).toBe(location);
        expect(session.clearSession).toHaveBeenCalledTimes(1);
      });
    });
  }
});
