import { DISPLAY_NAME_KEY, readOwnDisplayName } from '@lib/account/display-name';

// BK-1949 — the one write of the person's own display name (Tech Lead ruling
// D1). It goes to `app_metadata`, through the admin auth API, because:
//   - the browser cannot write `app_metadata` (Supabase Auth refuses it for a
//     user request), so the validation in `parseDisplayName` cannot be skipped
//     by calling `supabase.auth.updateUser` from a page;
//   - a Google or GitHub sign-in merges its identity data into
//     `user_metadata` only, and touches `app_metadata` only for its
//     `provider` / `providers` keys, so a provider refresh never replaces it.
// The admin update MERGES top-level keys (and deletes a key sent as null), so
// writing `display_name` leaves `provider` / `providers` untouched.
//
// The target is always the caller's own id, passed by the route from the
// authenticated principal: there is no user id in the request (ruling D4).

// The slice of the admin auth client this write needs, so a test can pass a
// fake and assert exactly what was sent.
export interface DisplayNameAdmin {
  auth: {
    admin: {
      updateUserById: (
        uid: string,
        attributes: { app_metadata: Record<string, unknown> },
      ) => Promise<{
        data: { user: { app_metadata?: Record<string, unknown> } | null }
        error: { message: string } | null
      }>
    }
  }
}

// Saves (string) or removes (null) the own name and returns what is stored
// afterwards, read back from the updated user rather than echoed.
export async function writeOwnDisplayName(
  admin: DisplayNameAdmin,
  userId: string,
  value: string | null,
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { [DISPLAY_NAME_KEY]: value },
  });
  if (error) {
    throw new Error(error.message);
  }
  return readOwnDisplayName(data.user?.app_metadata);
}
