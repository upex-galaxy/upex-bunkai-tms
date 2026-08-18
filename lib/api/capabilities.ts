// The single capability vocabulary for the whole application.
//
// This module is deliberately dependency-free and client-safe. It is the ONE
// place the four scope strings are written down; every other site derives from
// it:
//   - `ALL_CAPABILITIES` re-exported by `lib/api/principal.ts` (the set a cookie
//     session implicitly holds)
//   - `ALLOWED_PAT_SCOPES` in `lib/api/pat.ts` (the set a PAT may be minted with)
//   - the `requires` tuple of the `auth: 'required'` posture in `lib/api/handler.ts`
//   - the request-body schema of `POST /api/v1/tokens`
//
// It lives here rather than in `principal.ts` because of a VALUE chain that
// reaches a client component:
//
//   components/settings/IssueTokenModal.tsx  ('use client')
//     -> imports the value ALLOWED_PAT_SCOPES from lib/api/pat.ts
//        -> which imports the value ALL_CAPABILITIES from this module
//
// Type-only imports are erased and would be harmless, but `ALLOWED_PAT_SCOPES`
// is a real runtime value the modal iterates to render the scope picker. Had
// the vocabulary stayed in `principal.ts`, that chain would pull
// `principal.ts`'s `server-only` import into the client bundle and fail the
// build. `principal.ts` re-exports `ALL_CAPABILITIES`, so every existing
// server-side import site is unchanged.
//
// Keep in sync with the `scopes` CHECK in migration 0008_access_tokens.sql —
// that constraint admits exactly these four values. Adding one is an ADDITIVE
// migration (widen the CHECK over a strict superset); removing or renaming one
// is DESTRUCTIVE and invalidates every already-minted token carrying it.

export const ALL_CAPABILITIES = ['atc:read', 'atc:write', 'run:execute', 'workspace:admin'] as const;

export type Capability = typeof ALL_CAPABILITIES[number];
