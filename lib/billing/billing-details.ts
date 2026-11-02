import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertBillingOwner, noActiveSubscription } from '@lib/billing/billing-state';
import { internalDbError, toProcessorError } from '@lib/billing/errors';
import { getStripeClient } from '@lib/billing/stripe';
import { createAdminClient } from '@lib/supabase/admin';
import { z } from 'zod';

type Client = SupabaseClient<Database>;

// BK-231 — the company billing profile. Limits are the 2026-11-02 AI Product
// Owner ruling (comment 13337) and mirror the CHECK constraints of migration
// 0113 exactly, so a value the form accepts can never be rejected by the table.
// Tax ID is deliberately absent (VAT handling is out of scope for the story).
export const BILLING_DETAIL_LIMITS = {
  company_name: 120,
  billing_email: 254,
  address_line1: 120,
  address_line2: 120,
  city: 80,
  region: 80,
  postal_code: 20,
} as const;

const required = (max: number) => z.string().trim().min(1).max(max);
const optional = (max: number) => z
  .string()
  .trim()
  .max(max)
  .nullish()
  .transform(value => (value || null));

export const BillingDetailsSchema = z.object({
  company_name: required(BILLING_DETAIL_LIMITS.company_name),
  billing_email: z.string().trim().max(BILLING_DETAIL_LIMITS.billing_email).pipe(z.email()),
  address_line1: required(BILLING_DETAIL_LIMITS.address_line1),
  address_line2: optional(BILLING_DETAIL_LIMITS.address_line2),
  city: required(BILLING_DETAIL_LIMITS.city),
  region: optional(BILLING_DETAIL_LIMITS.region),
  postal_code: required(BILLING_DETAIL_LIMITS.postal_code),
  country: z.string().trim().regex(/^[A-Z]{2}$/i).transform(value => value.toUpperCase()),
}).strict();

export type BillingDetailsInput = z.infer<typeof BillingDetailsSchema>;

export type BillingProfile = Database['public']['Tables']['workspace_billing_profiles']['Row'];

export function toPublicProfile(row: BillingProfile) {
  return {
    company_name: row.company_name,
    billing_email: row.billing_email,
    address_line1: row.address_line1,
    address_line2: row.address_line2,
    city: row.city,
    region: row.region,
    postal_code: row.postal_code,
    country: row.country,
    updated_at: row.updated_at,
  };
}

export type PublicBillingProfile = ReturnType<typeof toPublicProfile>;

export interface SaveBillingDetailsArgs {
  db: Client
  workspaceId: string
  userId: string
  input: BillingDetailsInput
}

// PATCH /billing/details. The Stripe Customer is updated FIRST: Stripe freezes
// the name, email and address on every invoice at finalization, so this call is
// exactly what makes a later invoice carry the new details while issued ones
// stay untouched (AC1.3). Only when Stripe accepted the change is the local row
// written, so the Billing screen never shows details Stripe does not have. A
// failure after the Stripe call is logged and converges on the next save (the
// Stripe update is idempotent).
export async function saveBillingDetails(args: SaveBillingDetailsArgs): Promise<PublicBillingProfile> {
  const { db, workspaceId, userId, input } = args;

  await assertBillingOwner(db, workspaceId, 'edit billing details');

  const admin = createAdminClient();
  const { data: state, error: stateError } = await admin
    .from('workspace_billing_state')
    .select('stripe_customer_id')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (stateError) {
    throw internalDbError('workspace_billing_state lookup failed', stateError);
  }
  if (!state) {
    throw noActiveSubscription();
  }

  const stripe = getStripeClient();
  try {
    await stripe.customers.update(state.stripe_customer_id, {
      name: input.company_name,
      email: input.billing_email,
      address: {
        line1: input.address_line1,
        // An empty string clears the field on Stripe's side.
        line2: input.address_line2 ?? '',
        city: input.city,
        state: input.region ?? '',
        postal_code: input.postal_code,
        country: input.country,
      },
    });
  }
  catch (raw) {
    throw toProcessorError(raw, 'stripe customer update failed', { workspaceId });
  }

  const { data: saved, error: saveError } = await admin
    .from('workspace_billing_profiles')
    .upsert(
      {
        workspace_id: workspaceId,
        ...input,
        updated_by_user_id: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id' },
    )
    .select('*')
    .single();
  if (saveError || !saved) {
    throw internalDbError('workspace_billing_profiles upsert failed', saveError ?? { message: 'no row returned' });
  }
  return toPublicProfile(saved);
}

export async function loadBillingProfile(db: Client, workspaceId: string): Promise<PublicBillingProfile | null> {
  const { data, error } = await db
    .from('workspace_billing_profiles')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) {
    throw internalDbError('workspace_billing_profiles lookup failed', error);
  }
  return data ? toPublicProfile(data) : null;
}
