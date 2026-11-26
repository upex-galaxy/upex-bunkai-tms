import { describe, expect, mock, test } from 'bun:test';

// BK-2093: a Viewer is offered no way to create a project, on the index or at
// /projects/new; a member keeps every create affordance.

const WS = '8a2d1ff6-5e00-4c23-84d5-4d4aa3c021ec';
let role: string | null = 'viewer';
let projects: Array<{ slug: string, name: string, description: string | null, created_at: string }> = [];

function query(table: string) {
  const rows = (): unknown => {
    if (table === 'workspaces') { return [{ id: WS }]; }
    if (table === 'projects') { return projects; }
    return null;
  };
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => ({ data: table === 'workspace_members' && role ? { role } : null, error: null }),
    then: (resolve: (value: { data: unknown, error: null }) => unknown) => resolve({ data: rows(), error: null }),
  };
  return builder;
}

const client = {
  auth: { getUser: async () => ({ data: { user: { id: 'u-qa' } } }) },
  from: (table: string) => query(table),
};
void mock.module('@lib/supabase/server', () => ({ createClient: async () => client }));
const cookieStore = { get: () => ({ value: WS }) };
void mock.module('next/headers', () => ({ cookies: async () => cookieStore }));
const router = { push: () => {}, refresh: () => {}, replace: () => {} };
void mock.module('next/navigation', () => ({
  redirect: (to: string) => { throw new Error(`redirect ${to}`); },
  useRouter: () => router,
}));

const { renderToStaticMarkup } = await import('react-dom/server');
const { default: ProjectsIndexPage } = await import('./page');
const { default: NewProjectPage } = await import('./new/page');

async function html(page: () => Promise<React.ReactElement>): Promise<string> {
  return renderToStaticMarkup(await page());
}

const PROJECT = { slug: 'checkout', name: 'Checkout', description: null, created_at: '2026-11-01T10:00:00Z' };

describe('projects index create affordances by role (BK-2093)', () => {
  test('a Viewer with projects gets the role note instead of New project', async () => {
    role = 'viewer';
    projects = [PROJECT];
    const out = await html(ProjectsIndexPage);
    expect(out).not.toContain('data-testid="projects-new-link"');
    expect(out).toContain('data-testid="projects-viewer-note"');
    expect(out).toContain('Creating projects requires the member role or higher.');
  });

  test('a Viewer of an empty workspace gets no Create your first project button', async () => {
    role = 'viewer';
    projects = [];
    const out = await html(ProjectsIndexPage);
    expect(out).toContain('data-testid="projects-empty"');
    expect(out).not.toContain('data-testid="projects-empty-create"');
  });

  test('a Viewer of an empty workspace is told no project exists yet, not to create one (BK-2096)', async () => {
    role = 'viewer';
    projects = [];
    const out = await html(ProjectsIndexPage);
    expect(out).toContain('No project has been created in this workspace yet.');
    expect(out).not.toContain('Create the first one');
  });

  test('a member keeps New project and the empty-state button', async () => {
    role = 'member';
    projects = [PROJECT];
    expect(await html(ProjectsIndexPage)).toContain('data-testid="projects-new-link"');
    projects = [];
    const empty = await html(ProjectsIndexPage);
    expect(empty).toContain('data-testid="projects-empty-create"');
    expect(empty).toContain('Create the first one to start covering this workspace.');
    expect(empty).not.toContain('data-testid="projects-viewer-note"');
  });
});

describe('/projects/new by role (BK-2093)', () => {
  test('a Viewer who opens the address gets the note, not the form', async () => {
    role = 'viewer';
    projects = [PROJECT];
    const out = await html(NewProjectPage);
    expect(out).toContain('data-testid="projects-new-viewer-note"');
    expect(out).not.toContain('<form');
  });

  test('a member gets the form', async () => {
    role = 'member';
    projects = [PROJECT];
    const out = await html(NewProjectPage);
    expect(out).toContain('<form');
    expect(out).not.toContain('data-testid="projects-new-viewer-note"');
  });
});
