import type { Workspace, WorkspaceMember } from '@lib/types';

export const CURRENT_USER_ID = 'usr-elyermad';

export const workspaces: Workspace[] = [
  {
    id: 'ws-upex-galaxy',
    slug: 'upex-galaxy',
    name: 'Upex Galaxy',
    owner_user_id: CURRENT_USER_ID,
    plan: 'cloud',
    created_at: '2026-04-01T10:00:00Z',
  },
  {
    id: 'ws-acme-qa',
    slug: 'acme-qa',
    name: 'Acme QA',
    owner_user_id: CURRENT_USER_ID,
    plan: 'community',
    created_at: '2026-04-12T14:22:00Z',
  },
];

export const workspaceMembers: WorkspaceMember[] = [
  {
    workspace_id: 'ws-upex-galaxy',
    user_id: CURRENT_USER_ID,
    role: 'owner',
    status: 'active',
    joined_at: '2026-04-01T10:00:00Z',
  },
  {
    workspace_id: 'ws-acme-qa',
    user_id: CURRENT_USER_ID,
    role: 'admin',
    status: 'active',
    joined_at: '2026-04-12T14:22:00Z',
  },
];
