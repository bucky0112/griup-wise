import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminSession } from '@/lib/auth';

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  }),
}));

import { createSession, getSession } from '../session';

const admin: AdminSession = { type: 'admin', id: 'admin-1', name: 'Admin', email: 'admin@example.com' };

describe('session', () => {
  beforeEach(() => {
    jar.clear();
    vi.stubEnv('SESSION_SECRET', 'x'.repeat(32));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the session it created', async () => {
    await createSession(admin);
    expect(await getSession()).toEqual(admin);
  });

  it('returns null without a cookie', async () => {
    expect(await getSession()).toBeNull();
  });

  it.each([
    ['unset', undefined],
    ['31 characters', 'x'.repeat(31)],
  ])('throws an error naming SESSION_SECRET when it is %s', async (_label, value) => {
    await createSession(admin);
    vi.stubEnv('SESSION_SECRET', value);

    await expect(createSession(admin)).rejects.toThrow(/SESSION_SECRET/);
    await expect(getSession()).rejects.toThrow(/SESSION_SECRET/);
  });
});
