# ADR-0019 - File storage foundation: private Supabase Storage bucket, direct signed upload with a commit gate, authorized redirect for reads, outbox cleanup

- **Status:** Proposed <!-- Proposed | Accepted | Superseded by ADR-MMMM | Deprecated -->
- **Date:** 2026-10-19
- **Deciders:** AI Tech Lead (BK-593 implementation); Ely (PO/approver) to accept
- **Tags:** storage, files, authorization, api, cross-cutting-invariant
- **Supersedes:** -
- **Superseded by:** -

---

## Context

BK-593 is the first story that stores a file. Before it, evidence was a plain string: no storage bucket held user content (only the export archive of 0083, written by a background worker), no upload route existed and no object-storage client was in `package.json`. Every later file-holding surface (BK-594 defect evidence first) inherits whatever this story picks.

Constraints in play:

- A Vercel Function accepts and returns at most 4.5 MB, so a 10 MiB image cannot go through a Next route in either direction.
- Authorization already lives in two reviewed places: SECURITY DEFINER RPCs (ADR-0012) and table RLS. A PAT caller has no Storage JWT, so Storage-side RLS on path segments would cover cookie sessions only.
- Bytes in flight cannot hold a database lock, yet a Run can be finished or aborted while an upload is under way.
- Storage objects are not rows: a database delete (remove, Run delete, workspace deletion) does not delete the object.
- The SRS names Cloudflare R2 as the Phase 2 target.

The AI Tech Lead ruling on BK-593 (Jira, 2026-08-21) scored Supabase Storage 27/30 against R2 (19) and Vercel Blob (15) for the MVP. This ADR records the shape.

## Decision

1. **Backend:** Supabase Storage, one private bucket per file surface. For Run step evidence: `run-evidence`, created by migration 0097 with bucket-level `file_size_limit` (10 MiB) and `allowed_mime_types` (png, jpeg, webp).
2. **No client policies:** no `storage.objects` policy exists for `anon` or `authenticated`. Every object is written and read only by the service-role client, after an RPC or RLS check. This is the shape of `workspace-exports` (0083) and works for PAT callers.
3. **Upload = init, direct PUT, commit.** `init` is a SECURITY DEFINER RPC that authorizes, locks the `runs` row, checks quotas and inserts a `pending` row; the route then mints a Storage signed upload URL for a server-chosen path. The browser PUTs the bytes straight to Storage. `commit` reads the size from Storage metadata and the first 64 KiB of the object, validates the content (magic bytes, declared type must equal sniffed type, no animated image), and the commit RPC locks the Run again and flips `pending` to `committed`.
4. **Nothing is visible before commit and nothing commits after the Run closes.** The table's select policy exposes committed rows only. Both RPCs take `FOR UPDATE` on the `runs` row and require `status = 'running'`; the loser of a race with finish or abort gets 409 and finish and abort are unchanged. Signed upload tokens live 2 hours and cannot be shortened, so the commit gate and the 3 hour pending TTL are the real control.
5. **Object key** is `{workspace_id}/{run_id}/{run_step_id}/{attachment_id}` (lowercase uuids, no extension, never the user filename).
6. **Reads** go through an authorized route that checks access with the caller's RLS-scoped client and answers 302 to a signed URL valid for 60 seconds, with `Cache-Control: private, no-store`. The URL is never logged. Missing, foreign and inaccessible ids return the same 404.
7. **Cleanup is an outbox.** An AFTER DELETE trigger on the metadata table writes the object path into the generic `storage_cleanup_queue`. A daily sweep route (ADR-0017 shape: `app/api/v1/admin/**`, `CRON_SECRET`) expires stale pending rows and drains the queue with retries. Removal, Run deletion and workspace deletion all enqueue with no extra code. Later file surfaces reuse the queue.
8. **Metadata is a typed table per surface** (`run_step_attachments`), not a polymorphic attachments table, and the composed Run json is not extended.

The invariant for any future file surface: no anonymous read path, no client Storage policy, no object visible before its commit, and every database delete reaches the outbox.

## Consequences

- **Positive:** one reviewable authorization path (RPC plus RLS) for cookie and PAT callers; large files never cross a function; a failed or abandoned upload is invisible and self-cleaning; BK-594 inherits bucket pattern, queue, validation library and limits.
- **Negative / trade-offs:** Storage egress is billed per signed-URL read; the init response (and its Idempotency-Key replay snapshot) holds a 2 hour upload token for one server-chosen path; two requests per upload instead of one; EXIF is not stripped from JPEGs (follow-up); data export (0083) does not include evidence images yet (follow-up).
- **Neutral / follow-ups:** R2 stays the Phase 2 target behind the same routes. Evidence images in the workspace data export; EXIF stripping; admin override for removal (purely additive).

## Alternatives considered

- **Cloudflare R2** - cheapest egress, but a new account, secrets and client dependency, and tenant isolation would have to be invented outside Postgres.
- **Vercel Blob** - no per-tenant authorization model; public-by-URL semantics.
- **Server-mediated multipart or chunked relay through the route** - blocked by the 4.5 MB function cap.
- **`storage.objects` RLS policies on path segments** - works for cookie sessions only, puts authorization in a third place, and a policy mistake leaks data.
- **Proxy bytes on read** - hits the 4.5 MB response cap for images between 4.5 and 10 MiB.
- **Public bucket with unguessable paths** - a reference alone would be enough to read; violates the business rule.
- **Inline compensating delete only, or pg_cron plus pg_net** - an inline delete loses objects on failure; `pg_net` is not installed.
- **Full decode with a native image library** - heavier dependency for a gap the magic-byte check already closes.

## References

- Jira BK-593: AI Product Owner and AI Tech Lead decisions (2026-10-19) and the storage backend ruling (2026-08-21).
- `supabase/migrations/0097_run_step_attachments.sql`; precedent `0083_workspace_data_export.sql`, `0042_run_step_mark.sql`.
- ADR-0012 (RPC authorization), ADR-0017 (cron principal), ADR-0001 (two principals).
