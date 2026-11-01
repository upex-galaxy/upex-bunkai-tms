import { z } from 'zod';

// BK-206 — request-body validation for
// POST /api/v1/projects/{projectId}/milestones/{milestoneId}/plans.
// At least one plan uuid, failing fast before any database round trip. The 50-plan
// cap is deliberately NOT repeated here: the RPC owns it (45506 milestone_plan_limit,
// counted against the plans already attached), so a 51-plan selection gets the same
// answer whichever way it is reached. A repeated id inside the array is legal: the
// RPC attaches distinct ids only.

export const MilestoneAttachPlansBodySchema = z.object({
  test_plan_ids: z.array(z.string().uuid()).min(1, 'Select at least one test plan to attach.'),
});

export type MilestoneAttachPlansBody = z.infer<typeof MilestoneAttachPlansBodySchema>;
