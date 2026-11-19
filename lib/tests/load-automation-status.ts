import type { AutomationStatusEntry, TestAutomationStatus } from '@lib/tests/automation-status';
import { getTestAutomationStatus } from '@lib/supabase/rpc';
import { createClient } from '@lib/supabase/server';
import { toAutomationStatus } from '@lib/tests/automation-status';
import { notFound } from 'next/navigation';
import { cache } from 'react';

// BK-227 — the Test header and the Status history tab share ONE
// `bunkai_get_test_automation_status` call per request (React `cache()`,
// keyed on the two strings). Callers run `loadTestDetail` first for its 404
// semantics; the RPC's own read gate stays authoritative.
export const loadTestAutomationStatus = cache(async (testId: string, actorUserId: string): Promise<TestAutomationStatus> => {
  const supabase = await createClient();
  const { data, error } = await getTestAutomationStatus(supabase, { actorUserId, testId });
  if (error || !data) { notFound(); }
  const raw = data as unknown as { test_id: string, automation_status: string, history: AutomationStatusEntry[] };
  return {
    test_id: raw.test_id,
    automation_status: toAutomationStatus(raw.automation_status),
    history: (raw.history ?? []).map(entry => ({
      ...entry,
      from_status: toAutomationStatus(entry.from_status),
      to_status: toAutomationStatus(entry.to_status),
    })),
  };
});
