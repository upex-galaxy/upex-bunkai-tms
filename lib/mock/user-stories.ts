import type { UserStory } from '@lib/types';

const T = '2026-04-05T09:00:00Z';

export const userStories: UserStory[] = [
  {
    id: 'us-magic-link',
    module_id: 'mod-auth-magiclink',
    title: 'As a QA engineer I can sign in with a magic link to my work email',
    description: 'Reduce password sprawl across Bunkai instances. Magic link is the MVP auth path; OAuth ships next sprint.',
    external_id: 'BK-101',
    external_url: 'https://example.atlassian.net/browse/BK-101',
    created_at: T,
  },
  {
    id: 'us-workspace-switcher',
    module_id: 'mod-workspaces',
    title: 'As a multi-tenant user I can switch between workspaces without re-auth',
    description: 'Workspace state lives in URL + cookie. Persist last selected workspace per device.',
    external_id: 'BK-204',
    external_url: 'https://example.atlassian.net/browse/BK-204',
    created_at: T,
  },
  {
    id: 'us-tree-view',
    module_id: 'mod-projects-tree',
    title: 'As a QA lead I can browse a project as a Modules → US → AC → ATCs tree',
    description: 'File-explorer paradigm. Tree state persisted per project, per user.',
    external_id: 'BK-312',
    external_url: 'https://example.atlassian.net/browse/BK-312',
    created_at: T,
  },
  {
    id: 'us-atc-anchoring',
    module_id: 'mod-atcs-anchoring',
    title: 'As an author I must anchor every ATC to a User Story and at least one Acceptance Criterion',
    description: 'Anchoring is the structural moat — without it, ATCs drift into orphan freeform tests. Save is disabled until US + ≥1 AC are bound.',
    external_id: 'BK-407',
    external_url: 'https://example.atlassian.net/browse/BK-407',
    created_at: T,
  },
  {
    id: 'us-atc-search',
    module_id: 'mod-atcs-search',
    title: 'As an author I can find ATCs by title, ID, tag, or layer',
    description: 'tsvector GIN index on atcs.title + tags array. Sub-100ms search across 10k ATCs.',
    external_id: 'BK-512',
    external_url: 'https://example.atlassian.net/browse/BK-512',
    created_at: T,
  },
];
