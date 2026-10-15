'use client';

import type { SaveOutcome } from '@lib/tracker-settings/api-client';
import type { TrackerCheckResult, TrackerFieldErrors, TrackerFormValues } from '@lib/tracker-settings/form-state';
import { QueueConfirmDialog } from '@components/tracker-settings/QueueConfirmDialog';
import { Badge } from '@components/ui/badge';
import { Button } from '@components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card';
import { Input } from '@components/ui/input';
import { Label } from '@components/ui/label';
import { Switch } from '@components/ui/switch';
import { runTrackerCheck, saveTrackerSettings } from '@lib/tracker-settings/api-client';
import {
  canRunCheck,
  canSave,
  checkResultFor,
  normalizeValues,
  READ_ONLY_NOTE,
  validateValues,
} from '@lib/tracker-settings/form-state';
import { TRACKER_SETTINGS_MESSAGES } from '@lib/tracker-settings/rules';
import { useState } from 'react';
import { toast } from 'sonner';

interface TrackerSettingsFormProps {
  projectId: string
  initial: TrackerFormValues
  // Owner or admin of the workspace. Everyone else reads the same card with every
  // control disabled (PO Q4 / AC-10); the server remains the authority.
  canEdit: boolean
}

type Busy = 'check' | 'save' | null;

// "Jira defect sync" card (BK-371, PO Q6): one Card on a single column, existing
// primitives only. It configures WHERE a Project's defects go; it never sends one.
export function TrackerSettingsForm({ projectId, initial, canEdit: canEditProp }: TrackerSettingsFormProps) {
  const [saved, setSaved] = useState<TrackerFormValues>(initial);
  const [current, setCurrent] = useState<TrackerFormValues>(initial);
  const [check, setCheck] = useState<TrackerCheckResult | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [fieldErrors, setFieldErrors] = useState<TrackerFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [demoted, setDemoted] = useState(false);
  const [queueCount, setQueueCount] = useState<number | null>(null);

  const canEdit = canEditProp && !demoted;
  const visibleCheck = checkResultFor(check, current);

  const edit = (patch: Partial<TrackerFormValues>) => {
    setCurrent(previous => ({ ...previous, ...patch }));
    setFormError(null);
    setFieldErrors({});
  };

  // A server-side 422 that the screen's own validation did not catch (the rules
  // are shared, so this is a safety net) lands on the field it names.
  const applyInvalid = (reason: string, message: string) => {
    if (reason === 'invalid_issue_type') {
      setFieldErrors({ issueTypeName: message });
    }
    else if (reason === 'invalid_destination_key' || reason === 'destination_required') {
      setFieldErrors({ destinationKey: message });
    }
    else {
      setFormError(message);
    }
  };

  const handleDemotion = (message: string) => {
    setDemoted(true);
    setFormError(message);
  };

  const handleCheck = async () => {
    const errors = validateValues(current);
    // Same key rule as the server, so a malformed key never leaves the browser (AC-2.6).
    if (errors.destinationKey || errors.issueTypeName) {
      setFieldErrors(errors);
      return;
    }
    setBusy('check');
    setFormError(null);
    const outcome = await runTrackerCheck({ projectId, values: current });
    setBusy(null);
    const normalized = normalizeValues(current);
    switch (outcome.kind) {
      case 'result':
        setCheck({ destinationKey: normalized.destinationKey, issueTypeName: normalized.issueTypeName, ok: outcome.ok, message: outcome.message });
        break;
      case 'busy':
        setCheck({ destinationKey: normalized.destinationKey, issueTypeName: normalized.issueTypeName, ok: false, message: outcome.message });
        break;
      case 'invalid':
        applyInvalid(outcome.reason, outcome.message);
        break;
      case 'forbidden':
        handleDemotion(outcome.message);
        break;
      default:
        setFormError(outcome.message);
    }
  };

  const applySaveOutcome = (outcome: SaveOutcome, normalized: TrackerFormValues) => {
    switch (outcome.kind) {
      case 'saved': {
        const stored: TrackerFormValues = {
          destinationKey: outcome.settings.destinationKey,
          issueTypeName: outcome.settings.issueTypeName,
          enabled: outcome.settings.enabled,
        };
        setSaved(stored);
        setCurrent(stored);
        setQueueCount(null);
        toast.success(outcome.requeued > 0 ? `Settings saved. ${outcome.requeued} defects queued for Jira.` : 'Settings saved.');
        break;
      }
      case 'confirm':
        // A first confirmation, or a NEW number on a resend: either way the user
        // confirms exactly what this save would queue now.
        setQueueCount(outcome.queueCount);
        break;
      case 'check_failed':
        setQueueCount(null);
        setCheck({ destinationKey: normalized.destinationKey, issueTypeName: normalized.issueTypeName, ok: false, message: outcome.message });
        break;
      case 'invalid':
        setQueueCount(null);
        applyInvalid(outcome.reason, outcome.message);
        break;
      case 'forbidden':
        setQueueCount(null);
        handleDemotion(outcome.message);
        break;
      default:
        setQueueCount(null);
        setFormError(outcome.message);
    }
  };

  const submit = async (confirmQueueCount?: number) => {
    const errors = validateValues(current);
    if (errors.destinationKey || errors.issueTypeName) {
      setFieldErrors(errors);
      return;
    }
    setBusy('save');
    setFormError(null);
    const outcome = await saveTrackerSettings({ projectId, values: current, confirmQueueCount });
    setBusy(null);
    applySaveOutcome(outcome, normalizeValues(current));
  };

  const saveEnabled = canSave({ saved, current, canEdit, busy: busy !== null });
  const checkEnabled = canRunCheck({ current, canEdit, busy: busy !== null });
  const normalizedKey = normalizeValues(current).destinationKey;

  return (
    <>
      <Card data-testid="tracker-settings-card">
        <CardHeader>
          <CardTitle>Jira defect sync</CardTitle>
          <CardDescription>
            Choose the Jira project and issue type this Project&apos;s defects go to, and switch the sync on or off.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!canEditProp && (
            <p data-testid="tracker-settings-readonly-note" className="m-0 text-xs text-fg-3">
              {READ_ONLY_NOTE}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tracker-destination-key">Jira project key</Label>
            <Input
              id="tracker-destination-key"
              data-testid="tracker-settings-key"
              value={current.destinationKey}
              disabled={!canEdit || busy !== null}
              placeholder="e.g. QAS"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={fieldErrors.destinationKey ? true : undefined}
              aria-describedby={fieldErrors.destinationKey ? 'tracker-destination-key-error' : undefined}
              onChange={event => edit({ destinationKey: event.target.value })}
            />
            {fieldErrors.destinationKey && (
              <p id="tracker-destination-key-error" role="alert" data-testid="tracker-settings-key-error" className="m-0 text-xs text-signal-fail">
                {fieldErrors.destinationKey}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tracker-issue-type">Issue type</Label>
            <Input
              id="tracker-issue-type"
              data-testid="tracker-settings-issue-type"
              value={current.issueTypeName}
              disabled={!canEdit || busy !== null}
              autoComplete="off"
              aria-invalid={fieldErrors.issueTypeName ? true : undefined}
              aria-describedby={fieldErrors.issueTypeName ? 'tracker-issue-type-error' : undefined}
              onChange={event => edit({ issueTypeName: event.target.value })}
            />
            {fieldErrors.issueTypeName && (
              <p id="tracker-issue-type-error" role="alert" data-testid="tracker-settings-issue-type-error" className="m-0 text-xs text-signal-fail">
                {fieldErrors.issueTypeName}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <Switch
              id="tracker-enabled"
              data-testid="tracker-settings-enabled"
              aria-label="Sync defects to Jira"
              checked={current.enabled}
              disabled={!canEdit || busy !== null}
              onCheckedChange={enabled => edit({ enabled })}
            />
            <Label htmlFor="tracker-enabled" className="normal-case tracking-normal text-sm text-fg-1">
              Sync defects to Jira
            </Label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              data-testid="tracker-settings-check"
              disabled={!checkEnabled}
              onClick={() => { void handleCheck(); }}
            >
              {busy === 'check' ? 'Checking…' : 'Run connection check'}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              data-testid="tracker-settings-save"
              disabled={!saveEnabled}
              onClick={() => { void submit(); }}
            >
              {busy === 'save' && queueCount === null ? 'Saving…' : 'Save'}
            </Button>
          </div>

          <div aria-live="polite" data-testid="tracker-settings-status" className="flex flex-col gap-2">
            {visibleCheck && (
              <div className="flex items-start gap-2">
                <Badge
                  variant="outline"
                  data-testid="tracker-settings-check-result"
                  data-state={visibleCheck.ok ? 'pass' : 'fail'}
                  className={visibleCheck.ok
                    ? 'border-transparent bg-signal-pass-bg text-signal-pass'
                    : 'border-transparent bg-signal-fail-bg text-signal-fail'}
                >
                  {visibleCheck.ok ? 'Connection OK' : 'Check failed'}
                </Badge>
                <span className="text-xs text-fg-2">
                  {visibleCheck.ok
                    ? `Jira project ${visibleCheck.destinationKey} accepts ${visibleCheck.issueTypeName} issues.`
                    : visibleCheck.message}
                </span>
              </div>
            )}
            {formError && (
              <p role="alert" data-testid="tracker-settings-error" className="m-0 text-xs text-signal-fail">
                {demoted ? TRACKER_SETTINGS_MESSAGES.admin_required : formError}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <QueueConfirmDialog
        queueCount={queueCount}
        destinationKey={normalizedKey}
        submitting={busy === 'save'}
        onConfirm={() => { if (queueCount !== null) { void submit(queueCount); } }}
        onCancel={() => setQueueCount(null)}
      />
    </>
  );
}
