-- Migration: 0012 — Drop legacy secret-hash columns (CONTRACT step)
-- Authored: 2026-05-29
--
-- WHY: Follows 0011. After the application has been deployed to read/write the
-- sibling secret tables and verification has passed, the original secret
-- columns on the main tables are dead weight AND still readable by QA roles.
-- Dropping them completes the isolation.
--
-- APPLY ONLY AFTER: 0011 is live, code is deployed, and §6 verification in
-- .scratch/auth-secret-split-spec.md passes. This is the destructive step.
--
-- ROLLBACK (manual, if ever needed):
--   alter table public.access_tokens     add column hash text;
--   update public.access_tokens t set hash = s.hash
--     from public.access_token_secrets s where s.token_id = t.id;
--   alter table public.access_tokens     alter column hash set not null;
--   (analogous for magic_link_tokens.token_hash/ip_hash and
--    workspace_invites.token_hash, re-adding UNIQUE on the token_hash columns)

alter table public.access_tokens     drop column hash;

alter table public.magic_link_tokens drop column token_hash;
alter table public.magic_link_tokens drop column ip_hash;

alter table public.workspace_invites drop column token_hash;
