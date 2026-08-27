import type { AtcExportRow } from '@lib/atcs/csv-export';
import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, withApiHandler } from '@lib/api/handler';
import { atcsExportFilename, renderAtcsCsv } from '@lib/atcs/csv-export';
import { NextResponse } from 'next/server';

// GET /api/v1/projects/{id}/atcs/export — a Project's whole ATC library as an
// RFC4180 CSV download (BK-315). No pagination, no row cap (AI Tech Lead
// decision, Jira BK-315: PO ruled no hard cap for this MVP; a buffered
// single-response body is sufficient for an occasional, human-triggered audit
// pull — revisit only if usage data later shows real libraries growing large
// enough to matter).
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

  const [{ data: modules, error: modulesError }, { data: atcs, error: atcsError }] = await Promise.all([
    db.from('modules').select('id, path').eq('project_id', projectId),
    db.from('atcs').select('id, slug, title, module_id, layer, tags, status').eq('project_id', projectId).is('archived_at', null),
  ]);
  if (modulesError) {
    throw new ApiError('internal_error', modulesError.message);
  }
  if (atcsError) {
    throw new ApiError('internal_error', atcsError.message);
  }

  const modulePathById = new Map((modules ?? []).map(m => [m.id, m.path]));
  const rows: AtcExportRow[] = (atcs ?? []).map(a => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    module_path: modulePathById.get(a.module_id) ?? '—',
    layer: a.layer,
    tags: a.tags ?? [],
    status: a.status,
  }));

  const csv = renderAtcsCsv(rows);
  const filename = atcsExportFilename(project.slug);

  return new NextResponse(csv, {
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
