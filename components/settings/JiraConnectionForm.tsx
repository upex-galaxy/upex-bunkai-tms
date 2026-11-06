'use client';

import type { JiraConnectionView } from '@lib/jira/connection-client';
import { DisconnectJiraDialog } from '@components/settings/DisconnectJiraDialog';
import { Badge } from '@components/ui/badge';
import { Button } from '@components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card';
import { Input } from '@components/ui/input';
import { Label } from '@components/ui/label';
import {
  checkFailureCopy,
  deleteJiraConnection,
  sameSite,
  saveJiraConnection,
  testJiraConnection,
} from '@lib/jira/connection-client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

interface JiraConnectionFormProps {
  workspaceId: string
  // Metadata of the stored connection, or null when none. The token is never part
  // of it: the server never sends it.
  initial: JiraConnectionView | null
}

type Busy = 'test' | 'save' | 'disconnect' | null;
type FieldErrors = Partial<Record<'siteUrl' | 'email' | 'apiToken', string>>;
interface TestResult { ok: boolean, message: string }

const TOKEN_LINK = 'https://id.atlassian.com/manage-profile/security/api-tokens';

// Deterministic on server and client (no locale, no timezone), so hydration agrees.
function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

// "Jira connection" card (BK-1170): the workspace's own Jira site, email and API
// token. The token is write-only: it is typed here, sent once, and cleared from
// state after a save. It is never read back, logged or stored in the browser.
export function JiraConnectionForm({ workspaceId, initial }: JiraConnectionFormProps) {
  const router = useRouter();
  const [saved, setSaved] = useState<JiraConnectionView | null>(initial);
  const [siteUrl, setSiteUrl] = useState(initial?.siteUrl ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [apiToken, setApiToken] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const connected = saved !== null;
  const siteChanged = saved !== null && !sameSite(siteUrl, saved.siteUrl);
  const emailChanged = saved !== null && email.trim() !== saved.email;
  const tokenRequired = saved === null || siteChanged;
  const tokenMissing = tokenRequired && apiToken === '';
  const filled = siteUrl.trim() !== '' && email.trim() !== '';
  const dirty = saved === null || siteChanged || emailChanged || apiToken !== '';
  const idle = busy === null;

  const edit = (apply: () => void) => {
    apply();
    setFieldErrors({});
    setFormError(null);
    setTestResult(null);
  };

  const handleTest = async () => {
    setFormError(null);
    setFieldErrors({});
    let values: { siteUrl: string, email: string, apiToken: string } | null;
    if (filled && apiToken !== '') {
      values = { siteUrl, email, apiToken };
    }
    else if (saved !== null && !siteChanged && !emailChanged && apiToken === '') {
      values = null;
    }
    else {
      setTestResult({
        ok: false,
        message: saved === null
          ? 'Fill in the site URL, email and API token to test them.'
          : 'Enter the API token to test these changes, or undo them to test the saved connection.',
      });
      return;
    }
    setBusy('test');
    setTestResult(null);
    const outcome = await testJiraConnection({ workspaceId, values });
    setBusy(null);
    switch (outcome.kind) {
      case 'result':
        setTestResult(outcome.ok
          ? { ok: true, message: 'Connected. Jira accepted these credentials.' }
          : { ok: false, message: checkFailureCopy(outcome.failure, outcome.message) });
        break;
      case 'busy':
        setTestResult({ ok: false, message: outcome.message });
        break;
      default:
        setFormError(outcome.message);
    }
  };

  const handleSave = async () => {
    if (!filled) {
      setFieldErrors({
        siteUrl: siteUrl.trim() === '' ? 'Enter your Jira site URL.' : undefined,
        email: email.trim() === '' ? 'Enter the Atlassian account email.' : undefined,
      });
      return;
    }
    if (tokenMissing) {
      setFieldErrors({ apiToken: 'Enter the API token.' });
      return;
    }
    setBusy('save');
    setFormError(null);
    setFieldErrors({});
    setTestResult(null);
    const outcome = await saveJiraConnection({ workspaceId, values: { siteUrl, email, apiToken } });
    setBusy(null);
    switch (outcome.kind) {
      case 'saved':
        setSaved(outcome.connection);
        setSiteUrl(outcome.connection.siteUrl);
        setEmail(outcome.connection.email);
        setApiToken('');
        toast.success('Jira connection saved.');
        router.refresh();
        break;
      case 'invalid':
        if (outcome.reason === 'invalid_site_url') {
          setFieldErrors({ siteUrl: outcome.message });
        }
        else if (outcome.reason === 'invalid_email') {
          setFieldErrors({ email: outcome.message });
        }
        else if (outcome.reason === 'token_required') {
          setFieldErrors({ apiToken: outcome.message });
        }
        else {
          setFormError(outcome.message);
        }
        break;
      default:
        setFormError(outcome.message);
    }
  };

  const handleDisconnect = async () => {
    setBusy('disconnect');
    setFormError(null);
    const outcome = await deleteJiraConnection({ workspaceId });
    setBusy(null);
    if (outcome.kind === 'deleted') {
      setConfirmOpen(false);
      setSaved(null);
      setSiteUrl('');
      setEmail('');
      setApiToken('');
      setTestResult(null);
      toast.success('Jira disconnected.');
      router.refresh();
      return;
    }
    setConfirmOpen(false);
    setFormError(outcome.message);
  };

  return (
    <>
      <Card data-testid="jira-connection-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Jira connection</CardTitle>
            <Badge
              variant="outline"
              data-testid="jira-connection-status"
              data-state={connected ? 'connected' : 'not-connected'}
              className={connected
                ? 'border-transparent bg-signal-pass-bg text-signal-pass'
                : 'border-transparent bg-surface-3 text-fg-3'}
            >
              {connected ? 'Connected' : 'Not connected'}
            </Badge>
          </div>
          <CardDescription>
            Imports from Jira and defect sync use this connection, shared by everyone in the workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="jira-connection-site-url">Site URL</Label>
            <Input
              id="jira-connection-site-url"
              data-testid="jira-connection-site-url"
              value={siteUrl}
              disabled={!idle}
              placeholder="https://your-team.atlassian.net"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={fieldErrors.siteUrl ? true : undefined}
              aria-describedby={fieldErrors.siteUrl ? 'jira-connection-site-url-error' : undefined}
              onChange={event => edit(() => setSiteUrl(event.target.value))}
            />
            {fieldErrors.siteUrl && (
              <p id="jira-connection-site-url-error" role="alert" data-testid="jira-connection-site-url-error" className="m-0 text-xs text-signal-fail">
                {fieldErrors.siteUrl}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="jira-connection-email">Email</Label>
            <Input
              id="jira-connection-email"
              type="email"
              data-testid="jira-connection-email"
              value={email}
              disabled={!idle}
              placeholder="you@your-company.com"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? 'jira-connection-email-error' : undefined}
              onChange={event => edit(() => setEmail(event.target.value))}
            />
            {fieldErrors.email && (
              <p id="jira-connection-email-error" role="alert" data-testid="jira-connection-email-error" className="m-0 text-xs text-signal-fail">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="jira-connection-api-token">API token</Label>
            <Input
              id="jira-connection-api-token"
              type="password"
              data-testid="jira-connection-api-token"
              value={apiToken}
              disabled={!idle}
              placeholder={connected ? '••••••••' : undefined}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={fieldErrors.apiToken ? true : undefined}
              aria-describedby="jira-connection-api-token-help"
              onChange={event => edit(() => setApiToken(event.target.value))}
            />
            {fieldErrors.apiToken && (
              <p role="alert" data-testid="jira-connection-api-token-error" className="m-0 text-xs text-signal-fail">
                {fieldErrors.apiToken}
              </p>
            )}
            <p id="jira-connection-api-token-help" data-testid="jira-connection-api-token-help" className="m-0 text-xs text-fg-3">
              {connected && !siteChanged && 'Leave blank to keep the saved token. '}
              {connected && siteChanged && (
                <span data-testid="jira-connection-token-required-hint" className="text-signal-blocked">
                  You changed the site URL, so enter the API token again.
                  {' '}
                </span>
              )}
              Use a classic API token (not a scoped one).
              {' '}
              <a
                href={TOKEN_LINK}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="jira-connection-token-link"
                className="text-accent hover:underline"
              >
                Create an API token
              </a>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              data-testid="jira-connection-test"
              disabled={!idle}
              onClick={() => { void handleTest(); }}
            >
              {busy === 'test' ? 'Testing…' : 'Test connection'}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              data-testid="jira-connection-save"
              disabled={!idle || !dirty}
              onClick={() => { void handleSave(); }}
            >
              {busy === 'save' ? 'Saving…' : 'Save'}
            </Button>
            {connected && (
              <Button
                type="button"
                variant="danger"
                size="sm"
                data-testid="jira-connection-disconnect"
                disabled={!idle}
                onClick={() => setConfirmOpen(true)}
              >
                Disconnect
              </Button>
            )}
          </div>

          <div aria-live="polite" className="flex flex-col gap-2">
            {testResult && (
              <div className="flex items-start gap-2">
                <Badge
                  variant="outline"
                  data-testid="jira-connection-test-result"
                  data-state={testResult.ok ? 'pass' : 'fail'}
                  className={testResult.ok
                    ? 'border-transparent bg-signal-pass-bg text-signal-pass'
                    : 'border-transparent bg-signal-fail-bg text-signal-fail'}
                >
                  {testResult.ok ? 'Connection OK' : 'Check failed'}
                </Badge>
                <span data-testid="jira-connection-test-message" className="text-xs text-fg-2">{testResult.message}</span>
              </div>
            )}
            {formError && (
              <p role="alert" data-testid="jira-connection-error" className="m-0 text-xs text-signal-fail">
                {formError}
              </p>
            )}
            {saved && (
              <p data-testid="jira-connection-updated-at" className="m-0 text-xs text-fg-3">
                Last updated
                {' '}
                {formatUpdatedAt(saved.updatedAt)}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <DisconnectJiraDialog
        open={confirmOpen}
        submitting={busy === 'disconnect'}
        onConfirm={() => { void handleDisconnect(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
