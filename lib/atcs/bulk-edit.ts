import type { AtcLayer, AtcPriority, ModuleTreeNode } from '@lib/types';
import { MAX_ATC_TAGS } from '@lib/atcs/validation';

// BK-507 — the shared vocabulary of the ATC bulk edit (ADR-0027): the change a
// user picks, the report the server returns, and the wording both sides use.
// Pure and surface-agnostic on purpose: nothing here names the Project ATC list,
// so the workspace ATC Library can reuse it. Kept free of zod so the browser
// bundle does not pull it in; the request schema lives in `bulk-edit-validation`.

// One request may touch at most this many ATCs. The same figure is enforced by
// `bunkai_bulk_edit_atcs` (migration 0124) before it takes any lock.
export const BULK_EDIT_CEILING = 200;
export const BULK_TAG_MAX_LENGTH = 50;

export const BULK_EDIT_FIELDS = ['tags', 'module', 'layer', 'priority'] as const;
export type BulkEditField = (typeof BULK_EDIT_FIELDS)[number];

export const BULK_TAG_OPS = ['add', 'remove'] as const;
export type BulkTagOp = (typeof BULK_TAG_OPS)[number];

export type BulkEditChange
  = | { field: 'tags', op: BulkTagOp, tags: string[] }
    | { field: 'module', moduleId: string }
    | { field: 'layer', layer: AtcLayer }
    | { field: 'priority', priority: AtcPriority | null };

export interface BulkEditItem {
  id: string
  // The version the user saw. A mismatch refuses that ATC instead of overwriting.
  version: number | null
}

export type BulkOutcomeKind = 'changed' | 'unchanged' | 'refused';

// The closed set of reasons an ATC can be refused for. The server never sends
// raw database text; anything unrecognised is shown as `write_failed`.
export const BULK_REFUSAL_REASONS = [
  'stale_version',
  'archived',
  'tags_limit_exceeded',
  'module_outside_story_subtree',
  'slug_conflict',
  'not_found',
  'write_failed',
] as const;
export type BulkRefusalReason = (typeof BULK_REFUSAL_REASONS)[number];

export const BULK_REASON_LABEL: Record<BulkRefusalReason, string> = {
  stale_version: 'Edited by someone else since you loaded the list',
  archived: 'Archived',
  tags_limit_exceeded: `Would exceed ${MAX_ATC_TAGS} tags`,
  module_outside_story_subtree: 'Destination is outside its User Story’s Module',
  slug_conflict: 'Its new ID would collide with another ATC',
  not_found: 'No longer available',
  write_failed: 'The write failed',
};

export interface BulkOutcome {
  atc_id: string
  slug: string | null
  title: string | null
  outcome: BulkOutcomeKind
  reason: string | null
  version: number | null
}

export interface BulkEditReport {
  dry_run: boolean
  field: BulkEditField
  requested: number
  changed: number
  unchanged: number
  refused: number
  outcomes: BulkOutcome[]
}

// The tag a user typed, in the stored shape: trimmed, inner whitespace collapsed,
// lower-cased. Mirrors the SQL normalisation in 0124 and `canAddTag`.
export function normalizeBulkTag(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().toLowerCase();
}

// "a, B ,a" -> ['a', 'b']: comma or newline separated, empties dropped,
// duplicates folded (the first spelling wins).
export function parseBulkTagInput(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of text.split(/[,\n]/)) {
    const tag = normalizeBulkTag(part);
    if (tag === '' || seen.has(tag)) { continue; }
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

export function bulkTagsProblem(tags: string[]): string | null {
  if (tags.length === 0) { return 'Enter at least one tag.'; }
  if (tags.length > MAX_ATC_TAGS) { return `Enter at most ${MAX_ATC_TAGS} tags at a time.`; }
  if (tags.some(t => t.length > BULK_TAG_MAX_LENGTH)) {
    return `A tag can be at most ${BULK_TAG_MAX_LENGTH} characters.`;
  }
  return null;
}

// E14 — refused BEFORE any confirmation, naming the ceiling.
export function bulkSelectionProblem(count: number): string | null {
  if (count > BULK_EDIT_CEILING) {
    return `You can bulk-edit at most ${BULK_EDIT_CEILING} ATCs at a time. Deselect ${count - BULK_EDIT_CEILING} to continue.`;
  }
  return null;
}

function quoteTags(tags: string[]): string {
  return tags.map(t => `“${t}”`).join(', ');
}

// The exact change, in words, as the confirmation states it. `moduleLabel` is
// the destination Module's path (the caller owns the tree, this file does not).
export function describeBulkChange(change: BulkEditChange, moduleLabel?: string): string {
  switch (change.field) {
    case 'tags':
      return change.op === 'add'
        ? `Add ${change.tags.length === 1 ? 'tag' : 'tags'} ${quoteTags(change.tags)}`
        : `Remove ${change.tags.length === 1 ? 'tag' : 'tags'} ${quoteTags(change.tags)}`;
    case 'module':
      return `Move to Module ${moduleLabel ?? change.moduleId}`;
    case 'layer':
      return `Set layer to ${change.layer}`;
    case 'priority':
      return change.priority === null ? 'Clear the priority' : `Set priority to ${change.priority}`;
  }
}

export function pluralAtcs(count: number): string {
  return `${count} ${count === 1 ? 'ATC' : 'ATCs'}`;
}

export function isBulkRefusalReason(reason: string | null): reason is BulkRefusalReason {
  return reason !== null && (BULK_REFUSAL_REASONS as readonly string[]).includes(reason);
}

export function bulkReasonLabel(reason: string | null): string {
  return BULK_REASON_LABEL[isBulkRefusalReason(reason) ? reason : 'write_failed'];
}

export interface RefusalGroup {
  reason: BulkRefusalReason
  label: string
  outcomes: BulkOutcome[]
}

// The refusals grouped by reason, in the vocabulary's order, so a long list reads
// as "3 were edited by someone else, 2 are outside the story's Module" and not as
// fifty lines.
export function groupRefusals(report: BulkEditReport): RefusalGroup[] {
  const groups = new Map<BulkRefusalReason, BulkOutcome[]>();
  for (const outcome of report.outcomes) {
    if (outcome.outcome !== 'refused') { continue; }
    const reason = isBulkRefusalReason(outcome.reason) ? outcome.reason : 'write_failed';
    groups.set(reason, [...(groups.get(reason) ?? []), outcome]);
  }
  return BULK_REFUSAL_REASONS
    .filter(reason => groups.has(reason))
    .map(reason => ({ reason, label: BULK_REASON_LABEL[reason], outcomes: groups.get(reason) ?? [] }));
}

export function refusedAtcIds(report: BulkEditReport): string[] {
  return report.outcomes.filter(o => o.outcome === 'refused').map(o => o.atc_id);
}

// The `change` member of the request body for each field. Both the client and
// the schema read this shape; the field itself travels beside it.
export function toWireChange(change: BulkEditChange): Record<string, unknown> {
  switch (change.field) {
    case 'tags': return { op: change.op, tags: change.tags };
    case 'module': return { module_id: change.moduleId };
    case 'layer': return { layer: change.layer };
    case 'priority': return { priority: change.priority };
  }
}

export interface BulkModuleOption {
  id: string
  path: string
}

// The live Modules a bulk move can target, flattened from the explorer's tree and
// sorted by path. Archived Modules are left out: the server refuses them anyway.
export function flattenModuleOptions(tree: readonly ModuleTreeNode[]): BulkModuleOption[] {
  const options: BulkModuleOption[] = [];
  const walk = (nodes: readonly ModuleTreeNode[]): void => {
    for (const node of nodes) {
      if (node.archived_at === null || node.archived_at === undefined) {
        options.push({ id: node.id, path: node.path });
        walk(node.children);
      }
    }
  };
  walk(tree);
  return options.sort((a, b) => a.path.localeCompare(b.path));
}
