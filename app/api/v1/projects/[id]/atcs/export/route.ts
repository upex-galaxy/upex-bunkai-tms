import type { AtcExportRow } from '@lib/atcs/csv-export';
import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, withApiHandler } from '@lib/api/handler';
import { atcsExportFilename, renderAtcsCsv, withUtf8Bom } from '@lib/atcs/csv-export';
import { fetchAllPages } from '@lib/atcs/export-query';
import { NextResponse } from 'next/server';

interface ModuleSourceRow {
  id: string
  path: string
}

interface AtcSourceRow {
  id: string
  slug: string
  title: string
  module_id: string
  layer: string
  tags: string[] | null
  status: string
}

// GET /api/v1/projects/{id}/atcs/export — a Project's whole ATC library as an
// RFC4180 CSV download (BK-315). No row CAP (AI Tech Lead decision, Jira
// BK-315: PO ruled no hard cap for this MVP), but the read IS paginated
// (Conductor review of PR #207, BLOCKER fix): PostgREST caps a single REST
// read at `db-max-rows` (empirically 1000 rows), so a bare `.select()` with
// no `.range()` silently truncated any Project past that size — 200, partial
// file, no signal. `fetchAllPages` (`@lib/atcs/export-query`) pages the read
// to completion; a buffered (not streamed) response is still sufficient for
// an occasional, human-triggered audit pull.
//
// No RPC, no migration (story constraint). Uses `principal.db`, the
// RLS-scoped impersonating client ADR-0001 gives both cookie and Bearer PAT
// callers — same non-RPC shape as `modules/[id]/route.ts` DELETE's
// `assertActiveModule`: read the Project by id through the RLS-scoped client,
// treat a `null` result as the non-disclosure 404 (missing, foreign-workspace,
// and former-member-removed Projects are structurally indistinguishable,
// because RLS denies all three identically — never a 403, never an existence
// leak). A fully unauthenticated request never reaches the handler body: the
// `auth: 'required'` gateway throws 401 first, the same guarantee every other
// route on this posture already gets.
export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const projectId = extractProjectId(request);
  if (!isUuid(projectId)) {
    throw new ApiError('bad_request', 'Project id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  const { data: project, error: projectError } = await db
    .from('projects')
    .select('id, slug')
    .eq('id', projectId)
    .maybeSingle();
  if (projectError) {
    throw new ApiError('internal_error', projectError.message);
  }
  if (!project) {
    throw new ApiError('not_found', 'Project not found.', { details: { reason: 'not_found' } });
  }

  // BK-637 — the modules read is paged for exactly the same reason the atcs
  // read is: an unranged PostgREST select stops at `db-max-rows` (1000) with
  // no error, `modulePathById` then misses every module past the cap, and the
  // first ATC pointing at one of them trips the hard throw below — turning a
  // silent truncation into a permanent 500 for that Project. `.order('id')`
  // is what makes the offset windows stable across pages.
  const [modules, atcs] = await Promise.all([
    fetchAllPages<ModuleSourceRow>(async (offset, limit) => {
      const { data, error } = await db
        .from('modules')
        .select('id, path')
        .eq('project_id', projectId)
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1);
      return { data, error };
    }),
    fetchAllPages<AtcSourceRow>(async (offset, limit) => {
      const { data, error } = await db
        .from('atcs')
        .select('id, slug, title, module_id, layer, tags, status')
        .eq('project_id', projectId)
        .is('archived_at', null)
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1);
      return { data, error };
    }),
  ]);

  const modulePathById = new Map(modules.map(m => [m.id, m.path]));
  const rows: AtcExportRow[] = atcs.map((a) => {
    const modulePath = modulePathById.get(a.module_id);
    // `atcs.module_id` is a NOT NULL FK, so this can only fire if a module
    // referenced by a live ATC is absent from this Project's own module set
    // — a broken data invariant. Fail loudly rather than mask it behind a
    // placeholder (Conductor review, optional item, dev-owned call).
    if (modulePath === undefined) {
      throw new ApiError('internal_error', `ATC ${a.id} references module ${a.module_id}, which was not found in the Project's module set.`);
    }
    return {
      id: a.id,
      slug: a.slug,
      title: a.title,
      module_path: modulePath,
      layer: a.layer,
      tags: a.tags ?? [],
      status: a.status,
    };
  });

  const csv = renderAtcsCsv(rows);
  const filename = atcsExportFilename(project.slug);

  return new NextResponse(withUtf8Bom(csv), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}, { auth: 'required', requires: ['atc:read'] });

// Path ends `/{id}/atcs/export`, so the id is the third-to-last segment.
function extractProjectId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-3) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
