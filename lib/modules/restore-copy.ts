import type { ArchiveInfo } from '@lib/types';
import type { RestoredModule } from './archive-client';
import { formatActivityTime } from '@lib/activity/view';

// BK-601 — the words around an archived row and a Module restore. Same vocabulary as
// `lib/atcs/restore-copy.ts`. Pure, unit-tested in `restore-copy.test.ts`.

export const RESTORE_MODULE_FAILURE_COPY = 'Could not restore this module. Nothing changed.';
export const NOTHING_ARCHIVED_COPY = 'Nothing in this project is archived.';
export const ARCHIVED_LOAD_FAILURE_COPY = 'Could not load the archived rows.';

function counted(count: number, singular: string, plural: string): string | null {
  if (count === 0) { return null; }
  return `${count} ${count === 1 ? singular : plural}`;
}

function joined(parts: string[]): string {
  if (parts.length <= 1) { return parts.join(''); }
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)!}`;
}

// `modules` counts the restored Module itself, as the archive's own report does; the
// sentence names that Module and counts only what came back with it.
export function restoreModuleToast(result: RestoredModule): string {
  if (!result.changed) { return `"${result.name}" was already active.`; }
  const withIt = [
    counted(result.modules - 1, 'sub-module', 'sub-modules'),
    counted(result.user_stories, 'user story', 'user stories'),
    counted(result.acceptance_criteria, 'acceptance criterion', 'acceptance criteria'),
    counted(result.atcs, 'ATC', 'ATCs'),
  ].filter((part): part is string => part !== null);
  return withIt.length === 0
    ? `Restored "${result.name}".`
    : `Restored "${result.name}" with ${joined(withIt)}.`;
}

// BK-601 (AC-07) — what the Activity Stream says came back with a restored Module.
// Reads the projected payload defensively: a missing count is simply not mentioned.
export function formatModuleRestored(action: string, payload: Record<string, unknown>): string | null {
  if (action !== 'module.restored') { return null; }
  const count = (key: string) => (typeof payload[key] === 'number' ? payload[key] : 0);
  const withIt = [
    counted(Math.max(count('modules') - 1, 0), 'sub-module', 'sub-modules'),
    counted(count('user_stories'), 'user story', 'user stories'),
    counted(count('acceptance_criteria'), 'acceptance criterion', 'acceptance criteria'),
    counted(count('atcs'), 'ATC', 'ATCs'),
  ].filter((part): part is string => part !== null);
  return withIt.length === 0 ? 'Nothing else came back with it' : `Back with ${joined(withIt)}`;
}

// The line under an archived row: when, and who or what when that is known. A row
// archived on its own shows the date only, because no actor was ever recorded.
export function archiveLine(info: ArchiveInfo): string {
  const parts = [formatActivityTime(info.archived_at)];
  // Before the email: the row truncates, and what it went down with says more.
  if (info.archived_with) { parts.push(`with ${info.archived_with}`); }
  if (info.archived_by) { parts.push(info.archived_by.email ?? 'a former member'); }
  return parts.join(' · ');
}
