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
// It lives here rather than in `principal.ts` because `principal.ts` imports
// `server-only`, and `components/settings/IssueTokenModal.tsx` is a client
// component that needs the vocabulary to render the scope picker. A value
// import from `principal.ts` would drag `server-only` into the client bundle.
//
// Keep in sync with the `scopes` CHECK in migration 0008_access_tokens.sql —
// that constraint admits exactly these four values. Adding one is an ADDITIVE
// migration (widen the CHECK over a strict superset); removing or renaming one
// is DESTRUCTIVE and invalidates every already-minted token carrying it.

export const ALL_CAPABILITIES = ['atc:read', 'atc:write', 'run:execute', 'workspace:admin'] as const;

export type Capability = typeof ALL_CAPABILITIES[number];
