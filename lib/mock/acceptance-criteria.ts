import type { AcceptanceCriterion } from '@lib/types';

const T = '2026-04-05T09:10:00Z';

export const acceptanceCriteria: AcceptanceCriterion[] = [
  // us-magic-link
  {
    id: 'ac-ml-001',
    user_story_id: 'us-magic-link',
    title: 'Valid email triggers magic-link email',
    description: 'Given a registered email, when I submit the form, then an OTP link is sent within 30s.',
    position: 0,
    created_at: T,
  },
  {
    id: 'ac-ml-002',
    user_story_id: 'us-magic-link',
    title: 'Invalid email format is rejected client-side',
    description: 'The Send button stays disabled until the input matches a valid RFC 5322 email.',
    position: 1,
    created_at: T,
  },
  {
    id: 'ac-ml-003',
    user_story_id: 'us-magic-link',
    title: 'Magic link expires after 10 minutes',
    description: 'Clicking an expired link returns a 410 with a re-send prompt.',
    position: 2,
    created_at: T,
  },

  // us-workspace-switcher
  {
    id: 'ac-ws-001',
    user_story_id: 'us-workspace-switcher',
    title: 'Switcher lists every workspace the user is an active member of',
    description: 'Suspended or invited memberships are filtered out.',
    position: 0,
    created_at: T,
  },
  {
    id: 'ac-ws-002',
    user_story_id: 'us-workspace-switcher',
    title: 'Selection persists across reload',
    description: 'Last selected workspace_id stored in a HttpOnly cookie scoped to the host.',
    position: 1,
    created_at: T,
  },

  // us-tree-view
  {
    id: 'ac-tv-001',
    user_story_id: 'us-tree-view',
    title: 'Tree renders depth ≤ 6 without recursion stack overflow',
    description: 'Recursive CTE on Postgres caps depth at 6 (enforced at insert).',
    position: 0,
    created_at: T,
  },
  {
    id: 'ac-tv-002',
    user_story_id: 'us-tree-view',
    title: 'Open / closed state per node is persisted per user',
    description: 'Tree state survives reload; stored client-side in localStorage scoped to project_id.',
    position: 1,
    created_at: T,
  },

  // us-atc-anchoring
  {
    id: 'ac-an-001',
    user_story_id: 'us-atc-anchoring',
    title: 'Save button is disabled until a User Story is selected',
    description: 'Editor must pick a user_story_id before Save can fire.',
    position: 0,
    created_at: T,
  },
  {
    id: 'ac-an-002',
    user_story_id: 'us-atc-anchoring',
    title: 'Save button is disabled until at least one AC is bound',
    description: 'atc_acceptance_criteria must have ≥ 1 row at insert time.',
    position: 1,
    created_at: T,
  },
  {
    id: 'ac-an-003',
    user_story_id: 'us-atc-anchoring',
    title: 'ATC is anchored to the selected module',
    description: 'module_id is auto-resolved from the current tree path, not editable per ATC.',
    position: 2,
    created_at: T,
  },

  // us-atc-search
  {
    id: 'ac-as-001',
    user_story_id: 'us-atc-search',
    title: 'Search returns results in < 100ms p95',
    description: 'Backed by Postgres tsvector + GIN index on title + tags array.',
    position: 0,
    created_at: T,
  },
  {
    id: 'ac-as-002',
    user_story_id: 'us-atc-search',
    title: 'Search supports tag:foo and layer:UI prefix filters',
    description: 'Free-text + prefix filters share the same query parser.',
    position: 1,
    created_at: T,
  },
];
