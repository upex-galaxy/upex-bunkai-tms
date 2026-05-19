import type { Atc, AtcAcceptanceCriterion, AtcAssertion, AtcStep } from '@lib/types';

const PROJECT_ID = 'prj-bunkai-mvp';
const T = '2026-04-08T15:00:00Z';

export const atcs: Atc[] = [
  {
    id: 'atc-001',
    project_id: PROJECT_ID,
    module_id: 'mod-auth-magiclink',
    user_story_id: 'us-magic-link',
    slug: 'send-magic-link-happy-path',
    title: 'Send magic link to a registered email',
    layer: 'UI',
    version: 1,
    status: 'pass',
    tags: ['auth', 'smoke', 'P1'],
    created_at: T,
    updated_at: T,
  },
  {
    id: 'atc-002',
    project_id: PROJECT_ID,
    module_id: 'mod-auth-magiclink',
    user_story_id: 'us-magic-link',
    slug: 'reject-invalid-email-format',
    title: 'Reject malformed email at the input layer',
    layer: 'UI',
    version: 1,
    status: 'pass',
    tags: ['auth', 'validation'],
    created_at: T,
    updated_at: T,
  },
  {
    id: 'atc-003',
    project_id: PROJECT_ID,
    module_id: 'mod-auth-magiclink',
    user_story_id: 'us-magic-link',
    slug: 'expired-link-returns-410',
    title: 'Expired magic link returns 410 with re-send prompt',
    layer: 'API',
    version: 2,
    status: 'fail',
    tags: ['auth', 'regression', 'P2'],
    created_at: T,
    updated_at: '2026-05-15T10:12:00Z',
  },
  {
    id: 'atc-004',
    project_id: PROJECT_ID,
    module_id: 'mod-workspaces-members',
    user_story_id: 'us-workspace-switcher',
    slug: 'switcher-filters-suspended',
    title: 'Workspace switcher hides suspended memberships',
    layer: 'API',
    version: 1,
    status: 'pass',
    tags: ['workspaces', 'rbac'],
    created_at: T,
    updated_at: T,
  },
  {
    id: 'atc-005',
    project_id: PROJECT_ID,
    module_id: 'mod-projects-tree',
    user_story_id: 'us-tree-view',
    slug: 'tree-renders-depth-6',
    title: 'Tree renders 6-level module hierarchy without crash',
    layer: 'UI',
    version: 1,
    status: 'blocked',
    tags: ['tree', 'P2'],
    created_at: T,
    updated_at: T,
  },
  {
    id: 'atc-006',
    project_id: PROJECT_ID,
    module_id: 'mod-atcs-anchoring',
    user_story_id: 'us-atc-anchoring',
    slug: 'save-disabled-without-us',
    title: 'Save button is disabled when no User Story is selected',
    layer: 'UI',
    version: 1,
    status: 'pass',
    tags: ['anchoring', 'moat', 'P1'],
    created_at: T,
    updated_at: T,
  },
  {
    id: 'atc-007',
    project_id: PROJECT_ID,
    module_id: 'mod-atcs-anchoring',
    user_story_id: 'us-atc-anchoring',
    slug: 'save-disabled-without-ac',
    title: 'Save button is disabled when no AC is bound',
    layer: 'UI',
    version: 1,
    status: 'pass',
    tags: ['anchoring', 'moat', 'P1'],
    created_at: T,
    updated_at: T,
  },
  {
    id: 'atc-008',
    project_id: PROJECT_ID,
    module_id: 'mod-atcs-search',
    user_story_id: 'us-atc-search',
    slug: 'tag-prefix-filter',
    title: 'Search supports tag:foo prefix filter',
    layer: 'Unit',
    version: 1,
    status: 'unrun',
    tags: ['search', 'parser'],
    created_at: T,
    updated_at: T,
  },
];

export const atcSteps: AtcStep[] = [
  // atc-001
  { id: 'stp-001-1', atc_id: 'atc-001', position: 0, content: 'Navigate to /login', input_data: null, expected: 'Login page renders with email input visible' },
  { id: 'stp-001-2', atc_id: 'atc-001', position: 1, content: 'Type "qa@example.com" in the email field', input_data: 'qa@example.com', expected: 'Send button becomes enabled' },
  { id: 'stp-001-3', atc_id: 'atc-001', position: 2, content: 'Click "Send magic link"', input_data: null, expected: 'Confirmation toast appears within 1s' },
  { id: 'stp-001-4', atc_id: 'atc-001', position: 3, content: 'Open the inbox and click the magic link', input_data: null, expected: 'Browser navigates to /workspaces with an active session cookie' },

  // atc-003
  { id: 'stp-003-1', atc_id: 'atc-003', position: 0, content: 'Generate a magic link and wait 11 minutes', input_data: null, expected: 'Link is past TTL' },
  { id: 'stp-003-2', atc_id: 'atc-003', position: 1, content: 'GET the magic link URL', input_data: null, expected: 'Server responds 410 Gone' },
  { id: 'stp-003-3', atc_id: 'atc-003', position: 2, content: 'Inspect the response body', input_data: null, expected: 'Body contains { "error": "expired", "resend_url": "/auth/resend" }' },

  // atc-006
  { id: 'stp-006-1', atc_id: 'atc-006', position: 0, content: 'Open /atcs/new in the editor', input_data: null, expected: 'Editor renders with empty form' },
  { id: 'stp-006-2', atc_id: 'atc-006', position: 1, content: 'Type a title; leave User Story blank', input_data: 'Some title', expected: 'Save button stays disabled' },
  { id: 'stp-006-3', atc_id: 'atc-006', position: 2, content: 'Hover Save button', input_data: null, expected: 'Tooltip reads "Pick a User Story to enable Save"' },
];

export const atcAssertions: AtcAssertion[] = [
  // atc-001
  { id: 'asr-001-1', atc_id: 'atc-001', position: 0, content: 'response.status === 200' },
  { id: 'asr-001-2', atc_id: 'atc-001', position: 1, content: 'toast.text matches /magic link sent/i' },

  // atc-003
  { id: 'asr-003-1', atc_id: 'atc-003', position: 0, content: 'response.status === 410' },
  { id: 'asr-003-2', atc_id: 'atc-003', position: 1, content: 'response.body.error === "expired"' },
  { id: 'asr-003-3', atc_id: 'atc-003', position: 2, content: 'response.body.resend_url === "/auth/resend"' },

  // atc-006
  { id: 'asr-006-1', atc_id: 'atc-006', position: 0, content: 'saveButton.disabled === true' },
];

export const atcAcceptanceCriteria: AtcAcceptanceCriterion[] = [
  { atc_id: 'atc-001', acceptance_criterion_id: 'ac-ml-001' },
  { atc_id: 'atc-002', acceptance_criterion_id: 'ac-ml-002' },
  { atc_id: 'atc-003', acceptance_criterion_id: 'ac-ml-003' },
  { atc_id: 'atc-004', acceptance_criterion_id: 'ac-ws-001' },
  { atc_id: 'atc-004', acceptance_criterion_id: 'ac-ws-002' },
  { atc_id: 'atc-005', acceptance_criterion_id: 'ac-tv-001' },
  { atc_id: 'atc-006', acceptance_criterion_id: 'ac-an-001' },
  { atc_id: 'atc-007', acceptance_criterion_id: 'ac-an-002' },
  { atc_id: 'atc-008', acceptance_criterion_id: 'ac-as-002' },
];
