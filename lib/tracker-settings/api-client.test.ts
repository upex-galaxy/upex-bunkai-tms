import type { TrackerFormValues } from './form-state';
import { describe, expect, it } from 'bun:test';
import { runTrackerCheck, saveTrackerSettings } from './api-client';

// BK-371 — how the screen reads every answer of the save and check routes.

const values: TrackerFormValues = { destinationKey: ' qas ', issueTypeName: ' Bug ', enabled: true };

function respond(status: number, body: unknown) {
  const calls: { url: string, init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const failing = (async () => {
  throw new TypeError('offline');
}) as unknown as typeof fetch;

describe('saveTrackerSettings', () => {
  it('PUTs the normalised body and maps a 200 to the stored values and the queued count', async () => {
    const { fetchImpl, calls } = respond(200, {
      tracker_settings: { destination_project_key: 'QAS', issue_type_name: 'Bug', enabled: true, configured: true, updated_at: 'x' },
      requeued: 3,
    });
    const outcome = await saveTrackerSettings({ projectId: 'p-1', values, confirmQueueCount: 3, fetchImpl });
    expect(outcome).toEqual({ kind: 'saved', settings: { destinationKey: 'QAS', issueTypeName: 'Bug', enabled: true }, requeued: 3 });
    expect(calls[0].url).toBe('/api/v1/projects/p-1/tracker-settings');
    expect(calls[0].init.method).toBe('PUT');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      destination_project_key: 'QAS',
      issue_type_name: 'Bug',
      enabled: true,
      confirm_queue_count: 3,
    });
  });

  it('maps the 409 confirmation to the number the dialog shows (PO Q1)', async () => {
    const { fetchImpl } = respond(409, { error: { code: 'conflict', message: 'x', details: { reason: 'queue_confirmation_required', queue_count: 12 } } });
    expect(await saveTrackerSettings({ projectId: 'p', values, fetchImpl })).toEqual({ kind: 'confirm', queueCount: 12 });
  });

  it('a changed count on the resend is just another confirm', async () => {
    const { fetchImpl } = respond(409, { error: { details: { reason: 'queue_confirmation_required', queue_count: 13 } } });
    expect(await saveTrackerSettings({ projectId: 'p', values, confirmQueueCount: 12, fetchImpl })).toEqual({ kind: 'confirm', queueCount: 13 });
  });

  it('shows the check failure text from the server (AC-2.9)', async () => {
    const { fetchImpl } = respond(422, {
      error: { code: 'validation_failed', message: 'm', details: { reason: 'connection_check_failed', check: { kind: 'unreachable', message: 'Jira could not be reached. Try again in a few minutes.' } } },
    });
    expect(await saveTrackerSettings({ projectId: 'p', values, fetchImpl })).toEqual({ kind: 'check_failed', message: 'Jira could not be reached. Try again in a few minutes.' });
  });

  it('maps field validation to its reason and frozen text', async () => {
    const { fetchImpl } = respond(422, { error: { message: 'Enter a Jira project key.', details: { reason: 'destination_required' } } });
    expect(await saveTrackerSettings({ projectId: 'p', values, fetchImpl })).toEqual({ kind: 'invalid', reason: 'destination_required', message: 'Enter a Jira project key.' });
  });

  it('maps a demotion to forbidden with the frozen text (AC-4.5)', async () => {
    const { fetchImpl } = respond(403, { error: { code: 'forbidden', message: 'You no longer have permission to change this. Reload to see the current settings.', details: { reason: 'admin_required' } } });
    expect(await saveTrackerSettings({ projectId: 'p', values, fetchImpl })).toEqual({
      kind: 'forbidden',
      message: 'You no longer have permission to change this. Reload to see the current settings.',
    });
  });

  it('keeps a stale-count 409 as a plain error that says nothing was saved', async () => {
    const { fetchImpl } = respond(409, { error: { message: 'Nothing was saved; review the count.', details: { reason: 'queue_count_mismatch' } } });
    expect(await saveTrackerSettings({ projectId: 'p', values, fetchImpl })).toEqual({ kind: 'error', message: 'Nothing was saved; review the count.' });
  });

  it('survives a network failure and an unreadable body', async () => {
    expect(await saveTrackerSettings({ projectId: 'p', values, fetchImpl: failing })).toMatchObject({ kind: 'error' });
    const { fetchImpl } = respond(500, 'not json');
    expect(await saveTrackerSettings({ projectId: 'p', values, fetchImpl })).toMatchObject({ kind: 'error' });
  });

  it('refuses a 200 that is not the documented shape', async () => {
    const { fetchImpl } = respond(200, { nope: true });
    expect(await saveTrackerSettings({ projectId: 'p', values, fetchImpl })).toMatchObject({ kind: 'error' });
  });
});

describe('runTrackerCheck', () => {
  it('POSTs only the typed pair, normalised', async () => {
    const { fetchImpl, calls } = respond(200, { ok: true, reason: null });
    await runTrackerCheck({ projectId: 'p-1', values, fetchImpl });
    expect(calls[0].url).toBe('/api/v1/projects/p-1/tracker-settings/check');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ destination_project_key: 'QAS', issue_type_name: 'Bug' });
  });

  it('maps a pass and a failure to a result with the reason text (AC-2.1 / 2.2)', async () => {
    expect(await runTrackerCheck({ projectId: 'p', values, fetchImpl: respond(200, { ok: true, reason: null }).fetchImpl })).toEqual({ kind: 'result', ok: true, message: null });
    expect(await runTrackerCheck({
      projectId: 'p',
      values,
      fetchImpl: respond(200, { ok: false, reason: { kind: 'project_inaccessible', message: 'Bunkai cannot file issues in Jira project QAS: it does not exist or the connection has no access.' } }).fetchImpl,
    })).toEqual({ kind: 'result', ok: false, message: 'Bunkai cannot file issues in Jira project QAS: it does not exist or the connection has no access.' });
  });

  it('maps 429 to busy, 422 to invalid, 403 to forbidden', async () => {
    expect(await runTrackerCheck({ projectId: 'p', values, fetchImpl: respond(429, { error: { message: 'A connection check is already running. Wait for it to finish.', details: { reason: 'check_in_progress' } } }).fetchImpl }))
      .toEqual({ kind: 'busy', message: 'A connection check is already running. Wait for it to finish.' });
    expect(await runTrackerCheck({ projectId: 'p', values, fetchImpl: respond(422, { error: { message: 'm', details: { reason: 'invalid_destination_key' } } }).fetchImpl }))
      .toEqual({ kind: 'invalid', reason: 'invalid_destination_key', message: 'm' });
    expect(await runTrackerCheck({ projectId: 'p', values, fetchImpl: respond(403, { error: { message: 'f', details: { reason: 'admin_required' } } }).fetchImpl }))
      .toEqual({ kind: 'forbidden', message: 'f' });
  });

  it('survives a network failure', async () => {
    expect(await runTrackerCheck({ projectId: 'p', values, fetchImpl: failing })).toMatchObject({ kind: 'error' });
  });
});
