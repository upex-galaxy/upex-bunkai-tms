// BK-214 — pure, framework-agnostic grouping/truncation for the email digest.
// No DB, no network, no Resend — this is the part of the digest pipeline
// that stays unit-testable without a live Supabase instance (mirrors
// lib/notifications/view.ts's own framework-agnostic split). The eligibility
// filter itself (unread + preference + membership) lives in the migration's
// `bunkai_notification_digest_candidates()` — this module only groups and
// caps rows that function already decided are eligible.
//
// business-rules.md: "up to a handful" of items per project section; the
// AI Product Owner FASE 8 ratification fixed the cap at 5, with overflow
// collapsing into a single "and N more" line.

// `resolveNotificationHref` is intentionally NOT reused here — it requires
// `entity_available` (computed by the inbox's read-time RPC), while the
// digest candidate query already excludes unavailable entities at the SQL
// layer (the entity/project join misses -> row never appears). Every row
// reaching this function is by construction available, so the href is built
// directly from the row's own entity_type/entity_id + project_slug.
import { buildEntityHref } from './entity-routes';

import { resolveNotificationTitle } from './view';

export const DIGEST_ITEMS_PER_PROJECT_CAP = 5;

export interface DigestCandidateRow {
  recipient_user_id: string
  recipient_email: string
  workspace_id: string
  project_id: string
  project_name: string
  project_slug: string
  notification_id: string
  event_type: string
  entity_type: string
  entity_id: string | null
  payload: Record<string, unknown>
  created_at: string
}

export interface DigestNotificationLine {
  notificationId: string
  title: string
  signal: { label: string, status: 'pass' | 'fail' | 'aborted' } | null
  reason: string | null
  href: string | null
  createdAt: string
}

export interface DigestProjectGroup {
  projectId: string
  projectName: string
  projectSlug: string
  totalCount: number
  items: DigestNotificationLine[]
  overflowCount: number
}

export interface DigestForUser {
  userId: string
  email: string
  totalCount: number
  projects: DigestProjectGroup[]
}

function buildHref(row: DigestCandidateRow): string | null {
  if (row.entity_id === null) {
    return null;
  }
  if (row.entity_type !== 'run' && row.entity_type !== 'bug') {
    return null;
  }
  return buildEntityHref(row.entity_type, { projectSlug: row.project_slug, entityId: row.entity_id });
}

// Rows arrive already ordered (recipient, project name, created_at desc) by
// `bunkai_notification_digest_candidates()` — this function trusts that
// order rather than re-sorting, so a caller feeding it out-of-order rows
// gets out-of-order output (tests exercise this contract directly).
export function groupDigestCandidates(rows: DigestCandidateRow[]): DigestForUser[] {
  const byUser = new Map<string, DigestCandidateRow[]>();
  for (const row of rows) {
    const existing = byUser.get(row.recipient_user_id);
    if (existing) {
      existing.push(row);
    }
    else {
      byUser.set(row.recipient_user_id, [row]);
    }
  }

  const result: DigestForUser[] = [];
  for (const [userId, userRows] of byUser) {
    const byProject = new Map<string, DigestCandidateRow[]>();
    for (const row of userRows) {
      const existing = byProject.get(row.project_id);
      if (existing) {
        existing.push(row);
      }
      else {
        byProject.set(row.project_id, [row]);
      }
    }

    const projects: DigestProjectGroup[] = [];
    for (const [projectId, projectRows] of byProject) {
      const kept = projectRows.slice(0, DIGEST_ITEMS_PER_PROJECT_CAP);
      projects.push({
        projectId,
        projectName: projectRows[0].project_name,
        projectSlug: projectRows[0].project_slug,
        totalCount: projectRows.length,
        overflowCount: Math.max(0, projectRows.length - DIGEST_ITEMS_PER_PROJECT_CAP),
        items: kept.map((row) => {
          const title = resolveNotificationTitle({
            event_type: row.event_type,
            entity_type: row.entity_type,
            payload: row.payload,
          });
          return {
            notificationId: row.notification_id,
            title: title.text,
            signal: title.signal,
            reason: title.reason,
            href: buildHref(row),
            createdAt: row.created_at,
          };
        }),
      });
    }

    result.push({
      userId,
      email: userRows[0].recipient_email,
      totalCount: userRows.length,
      projects,
    });
  }

  return result;
}
