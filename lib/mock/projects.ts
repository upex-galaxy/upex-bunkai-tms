import type { Project } from '@lib/types';

export const projects: Project[] = [
  {
    id: 'prj-bunkai-mvp',
    workspace_id: 'ws-upex-galaxy',
    slug: 'bunkai-mvp',
    name: 'Bunkai MVP',
    description: 'Open-core test management system — Cloud edition, MVP scope.',
    created_at: '2026-04-01T11:00:00Z',
  },
  {
    id: 'prj-checkout-revamp',
    workspace_id: 'ws-upex-galaxy',
    slug: 'checkout-revamp',
    name: 'Checkout Revamp',
    description: 'Q2 checkout overhaul — promo codes, cart persistence, loyalty stacking.',
    created_at: '2026-04-03T09:30:00Z',
  },
  {
    id: 'prj-internal-tools',
    workspace_id: 'ws-acme-qa',
    slug: 'internal-tools',
    name: 'Internal Tools',
    description: 'Acme back-office admin app.',
    created_at: '2026-04-14T16:00:00Z',
  },
];
