import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TrackerSettingsForm } from '../tracker-settings/TrackerSettingsForm';
import { RepositorySettingsForm } from './RepositorySettingsForm';

const INITIAL = { destinationKey: 'QA', issueTypeName: 'Bug', enabled: true };

function isDisabled(html: string, testId: string): boolean {
  const at = html.indexOf(`data-testid="${testId}"`);
  return html.slice(html.lastIndexOf('<', at), html.indexOf('>', at) + 1).includes(' disabled=""');
}

describe('Project Settings on a read-only project (BK-2541)', () => {
  it('locks the repository field for an owner and says the project is read-only', () => {
    const html = renderToStaticMarkup(<RepositorySettingsForm projectId="proj" initialUrl={null} canEdit readOnly />);
    expect(html).toContain('This project is read-only.');
    expect(html).not.toContain('Ask a workspace admin');
    expect(html).not.toContain('data-testid="repository-settings-save"');
    expect(isDisabled(html, 'repository-settings-url')).toBe(true);
  });

  it('locks the Jira sync card for an owner and says the project is read-only', () => {
    const html = renderToStaticMarkup(<TrackerSettingsForm projectId="proj" initial={INITIAL} canEdit readOnly />);
    expect(html).toContain('This project is read-only.');
    expect(html).not.toContain('Only workspace owners and admins can change this.');
    expect(isDisabled(html, 'tracker-settings-key')).toBe(true);
    expect(isDisabled(html, 'tracker-settings-save')).toBe(true);
  });

  it('keeps the role notes for a member of a writable project', () => {
    const repository = renderToStaticMarkup(<RepositorySettingsForm projectId="proj" initialUrl={null} canEdit={false} />);
    expect(repository).toContain('Ask a workspace admin');
    const tracker = renderToStaticMarkup(<TrackerSettingsForm projectId="proj" initial={INITIAL} canEdit={false} />);
    expect(tracker).toContain('Only workspace owners and admins can change this.');
  });

  it('leaves an owner of a writable project with usable controls', () => {
    const repository = renderToStaticMarkup(<RepositorySettingsForm projectId="proj" initialUrl={null} canEdit />);
    expect(repository).toContain('data-testid="repository-settings-save"');
    expect(isDisabled(repository, 'repository-settings-url')).toBe(false);
    const tracker = renderToStaticMarkup(<TrackerSettingsForm projectId="proj" initial={INITIAL} canEdit />);
    expect(tracker).not.toContain('data-testid="tracker-settings-readonly-note"');
    expect(isDisabled(tracker, 'tracker-settings-key')).toBe(false);
  });
});
