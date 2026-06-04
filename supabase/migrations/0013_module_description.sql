-- Migration: 0013 — module description
-- Authored: 2026-06-04
--
-- BK-9 (Create modules with nested sub-modules) adds an optional Markdown
-- description to a module. Stored raw; rendered plain + truncated in the tree
-- for the MVP (the rich Markdown editor ships with BK-16). Additive and
-- nullable, so it is backward compatible with every existing `modules` row.
--
-- The 500-character cap is enforced both here (DB safety net) and in the
-- create route's Zod validation (app-layer fail-fast).

alter table public.modules
  add column if not exists description text;

alter table public.modules
  drop constraint if exists modules_description_max_500;

alter table public.modules
  add constraint modules_description_max_500
    check (description is null or char_length(description) <= 500);
