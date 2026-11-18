import type { DisplayNameAdmin } from './store';
import { describe, expect, it } from 'bun:test';
import { writeOwnDisplayName } from './store';

// BK-1949 ruling D1 — the own name is written to `app_metadata` only, never to
// the browser-writable `user_metadata`, for exactly the caller's id, and the
// stored value is read back from the updated user rather than echoed.

interface Call { uid: string, attributes: Record<string, unknown> }

function fakeAdmin(after: Record<string, unknown> | null, error: { message: string } | null = null) {
  const calls: Call[] = [];
  const admin: DisplayNameAdmin = {
    auth: {
      admin: {
        updateUserById: async (uid, attributes) => {
          calls.push({ uid, attributes });
          return { data: { user: after === null ? null : { app_metadata: after } }, error };
        },
      },
    },
  };
  return { admin, calls };
}

describe('writeOwnDisplayName', () => {
  it('writes the name to app_metadata.display_name for the given user only', async () => {
    const { admin, calls } = fakeAdmin({ provider: 'email', providers: ['email'], display_name: 'Elena Vargas' });

    const stored = await writeOwnDisplayName(admin, 'user-a', 'Elena Vargas');

    expect(stored).toBe('Elena Vargas');
    expect(calls).toEqual([{ uid: 'user-a', attributes: { app_metadata: { display_name: 'Elena Vargas' } } }]);
    // Never the browser-writable bag, and never any other identity field.
    expect(Object.keys(calls[0].attributes)).toEqual(['app_metadata']);
  });

  it('removes the name by sending null for the key (the auth API deletes a null key)', async () => {
    const { admin, calls } = fakeAdmin({ provider: 'google', providers: ['google'] });

    const stored = await writeOwnDisplayName(admin, 'user-a', null);

    expect(stored).toBeNull();
    expect(calls[0].attributes).toEqual({ app_metadata: { display_name: null } });
  });

  it('returns what the auth user holds afterwards, not what was sent', async () => {
    const { admin } = fakeAdmin({ display_name: 'Server value' });
    expect(await writeOwnDisplayName(admin, 'user-a', 'Sent value')).toBe('Server value');
  });

  it('throws when the auth API reports an error, so the route answers 500', async () => {
    const { admin } = fakeAdmin(null, { message: 'User not found' });
    const failure = await writeOwnDisplayName(admin, 'user-a', 'Elena').then(() => null, (error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe('User not found');
  });
});
