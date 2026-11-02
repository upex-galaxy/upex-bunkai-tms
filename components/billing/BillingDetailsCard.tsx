'use client';

import { readApiError } from '@components/billing/billing-format';
import { Button } from '@components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card';
import { Input } from '@components/ui/input';
import { Label } from '@components/ui/label';
import { Pencil, Plus, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface BillingProfile {
  company_name: string
  billing_email: string
  address_line1: string
  address_line2: string | null
  city: string
  region: string | null
  postal_code: string
  country: string
  updated_at: string
}

interface BillingDetailsCardProps {
  workspaceId: string
  profile: BillingProfile | null
  canEdit: boolean
  onSaved: (profile: BillingProfile) => void
}

type FieldName = 'company_name' | 'billing_email' | 'address_line1' | 'address_line2' | 'city' | 'region' | 'postal_code' | 'country';
type FormValues = Record<FieldName, string>;
type FormErrors = Partial<Record<FieldName, string>>;

interface FieldSpec {
  name: FieldName
  label: string
  required: boolean
  max: number
  wide?: boolean
  type?: 'email'
  autoComplete: string
  hint?: string
}

// Limits mirror the server schema (BK-231). The server does not itemise field
// errors on a 422, so the client validates first and only a genuinely
// unforeseen rejection reaches the form-level message.
const FIELDS: FieldSpec[] = [
  { name: 'company_name', label: 'Company', required: true, max: 120, wide: true, autoComplete: 'organization' },
  { name: 'billing_email', label: 'Billing email', required: true, max: 254, wide: true, type: 'email', autoComplete: 'email', hint: 'Invoices and payment notices are sent here.' },
  { name: 'address_line1', label: 'Address line 1', required: true, max: 120, wide: true, autoComplete: 'address-line1' },
  { name: 'address_line2', label: 'Address line 2 (optional)', required: false, max: 120, wide: true, autoComplete: 'address-line2' },
  { name: 'city', label: 'City', required: true, max: 80, autoComplete: 'address-level2' },
  { name: 'region', label: 'State or region (optional)', required: false, max: 80, autoComplete: 'address-level1' },
  { name: 'postal_code', label: 'Postal code', required: true, max: 20, autoComplete: 'postal-code' },
  { name: 'country', label: 'Country code', required: true, max: 2, autoComplete: 'country', hint: 'Two letters, for example US or ES.' },
];

// Same pattern as zod 4's default `z.email()`, which the PATCH route validates
// with (lib/billing/billing-details.ts), so a value this form accepts is never
// bounced by the server as an unhighlighted 422.
const EMAIL_SHAPE = /^[\w'+\-.]*[\w+-]@(?:[a-z0-9][a-z0-9-]*\.)+[a-z]{2,}$/i;

function isValidEmail(value: string): boolean {
  return !value.startsWith('.') && !value.includes('..') && EMAIL_SHAPE.test(value);
}
const COUNTRY_PATTERN = /^[A-Z]{2}$/i;
const FORM_LEVEL_VALIDATION_MESSAGE = 'Check the highlighted fields and try again.';
const SAVE_FALLBACK_MESSAGE = 'Could not save billing details. Please try again.';

function toFormValues(profile: BillingProfile | null): FormValues {
  return {
    company_name: profile?.company_name ?? '',
    billing_email: profile?.billing_email ?? '',
    address_line1: profile?.address_line1 ?? '',
    address_line2: profile?.address_line2 ?? '',
    city: profile?.city ?? '',
    region: profile?.region ?? '',
    postal_code: profile?.postal_code ?? '',
    country: profile?.country ?? '',
  };
}

function plainLabel(spec: FieldSpec): string {
  return spec.label.replace(' (optional)', '');
}

function validateField(spec: FieldSpec, raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0) {
    return spec.required ? `${plainLabel(spec)} is required.` : null;
  }
  if (spec.name === 'country') {
    return COUNTRY_PATTERN.test(value) ? null : 'Use a two-letter country code, for example US.';
  }
  if (value.length > spec.max) {
    return `${plainLabel(spec)} must be ${spec.max} characters or fewer.`;
  }
  if (spec.name === 'billing_email' && !isValidEmail(value)) {
    return 'Enter a valid email address.';
  }
  return null;
}

function validateAll(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  for (const spec of FIELDS) {
    const message = validateField(spec, values[spec.name]);
    if (message) { errors[spec.name] = message; }
  }
  return errors;
}

// Billing details card (BK-231). Owner edits inline in the same card; an admin
// reads the profile and never gets an Edit/Add control (structurally absent).
// Tax ID is intentionally not part of this surface.
export function BillingDetailsCard({ workspaceId, profile, canEdit, onSaved }: BillingDetailsCardProps) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<FormValues>(() => toFormValues(profile));
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (editing) {
      firstInputRef.current?.focus();
    }
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [editing]);

  const startEditing = () => {
    setValues(toFormValues(profile));
    setErrors({});
    setFormError(null);
    setJustSaved(false);
    setEditing(true);
  };

  const cancel = () => {
    if (saving) { return; }
    restoreFocus.current = true;
    setErrors({});
    setFormError(null);
    setEditing(false);
  };

  const handleChange = (spec: FieldSpec, next: string) => {
    setValues(current => ({ ...current, [spec.name]: next }));
    // Re-validate only a field that is already flagged, so the message clears
    // as soon as it is fixed without nagging the fields not yet visited.
    if (errors[spec.name]) {
      const message = validateField(spec, next);
      setErrors((current) => {
        const copy = { ...current };
        if (message) { copy[spec.name] = message; }
        else { delete copy[spec.name]; }
        return copy;
      });
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) { return; }

    const found = validateAll(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFormError(FORM_LEVEL_VALIDATION_MESSAGE);
      const firstInvalid = FIELDS.find(spec => found[spec.name]);
      if (firstInvalid) {
        document.getElementById(`billing-details-${firstInvalid.name}`)?.focus();
      }
      return;
    }

    const payload: Record<string, string> = {
      company_name: values.company_name.trim(),
      billing_email: values.billing_email.trim(),
      address_line1: values.address_line1.trim(),
      city: values.city.trim(),
      postal_code: values.postal_code.trim(),
      country: values.country.trim().toUpperCase(),
    };
    if (values.address_line2.trim()) { payload.address_line2 = values.address_line2.trim(); }
    if (values.region.trim()) { payload.region = values.region.trim(); }

    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/billing/details`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const info = await readApiError(response);
        setFormError(
          response.status === 422 || info.code === 'validation_failed'
            ? FORM_LEVEL_VALIDATION_MESSAGE
            : (info.message ?? SAVE_FALLBACK_MESSAGE),
        );
        return;
      }
      const saved = await response.json() as BillingProfile;
      restoreFocus.current = true;
      setEditing(false);
      setJustSaved(true);
      onSaved(saved);
    }
    catch {
      setFormError(SAVE_FALLBACK_MESSAGE);
    }
    finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="billing-details-card">
      <CardHeader className="flex-row items-start justify-between gap-4 border-b border-stroke-1 p-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle role="heading" aria-level={2}>Billing details</CardTitle>
          <CardDescription>Shown on every invoice. Changes apply from the next invoice; issued invoices never change.</CardDescription>
        </div>
        {canEdit && !editing && profile && (
          <Button ref={triggerRef} type="button" data-testid="billing-details-edit" onClick={startEditing}>
            <Pencil size={13} aria-hidden="true" />
            Edit
          </Button>
        )}
      </CardHeader>

      <CardContent className="p-4">
        {editing
          ? (
              <form noValidate onSubmit={(event) => { void handleSubmit(event); }} data-testid="billing-details-form" aria-label="Edit billing details">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {FIELDS.map((spec, index) => {
                    const id = `billing-details-${spec.name}`;
                    const errorId = `${id}-error`;
                    const hintId = `${id}-hint`;
                    const describedBy = [errors[spec.name] ? errorId : null, spec.hint ? hintId : null].filter(Boolean).join(' ') || undefined;
                    return (
                      <div key={spec.name} className={spec.wide ? 'flex flex-col gap-1.5 sm:col-span-2' : 'flex flex-col gap-1.5'}>
                        <Label htmlFor={id}>
                          {spec.label}
                          {spec.required && <span aria-hidden="true" className="text-fg-3"> *</span>}
                        </Label>
                        <Input
                          ref={index === 0 ? firstInputRef : undefined}
                          id={id}
                          name={spec.name}
                          type={spec.type ?? 'text'}
                          data-testid={`billing-details-input-${spec.name}`}
                          autoComplete={spec.autoComplete}
                          value={values[spec.name]}
                          disabled={saving}
                          aria-required={spec.required}
                          aria-invalid={errors[spec.name] ? true : undefined}
                          aria-describedby={describedBy}
                          className={errors[spec.name] ? 'border-signal-fail' : undefined}
                          onChange={(event) => { handleChange(spec, event.target.value); }}
                        />
                        {errors[spec.name] && (
                          <p id={errorId} data-testid={`billing-details-error-${spec.name}`} className="text-[11.5px] text-signal-fail">
                            {errors[spec.name]}
                          </p>
                        )}
                        {spec.hint && (
                          <p id={hintId} className="text-[11.5px] text-fg-3">{spec.hint}</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {formError && (
                  <p role="alert" data-testid="billing-details-form-error" className="mt-4 text-sm text-signal-fail">
                    {formError}
                  </p>
                )}

                <div className="mt-4 flex items-center gap-2">
                  <Button type="submit" variant="primary" data-testid="billing-details-save" disabled={saving} aria-busy={saving}>
                    {saving && <RefreshCw size={13} aria-hidden="true" className="motion-safe:animate-spin" />}
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                  <Button type="button" data-testid="billing-details-cancel" disabled={saving} onClick={cancel}>
                    Cancel
                  </Button>
                </div>
              </form>
            )
          : profile
            ? (
                <div data-testid="billing-details-view">
                  <dl className="grid grid-cols-[minmax(0,140px)_1fr] gap-x-6 gap-y-3 sm:grid-cols-[160px_1fr]">
                    <dt className="pt-0.5 text-2xs font-medium uppercase tracking-wider text-fg-3">Company</dt>
                    <dd className="text-base text-fg-1" data-testid="billing-details-value-company">{profile.company_name}</dd>

                    <dt className="pt-0.5 text-2xs font-medium uppercase tracking-wider text-fg-3">Billing email</dt>
                    <dd className="break-words font-mono text-base text-fg-1" data-testid="billing-details-value-email">{profile.billing_email}</dd>

                    <dt className="pt-0.5 text-2xs font-medium uppercase tracking-wider text-fg-3">Billing address</dt>
                    <dd className="text-base text-fg-1" data-testid="billing-details-value-address">
                      <span className="block">{profile.address_line1}</span>
                      {profile.address_line2 && <span className="block">{profile.address_line2}</span>}
                      <span className="block">
                        {profile.postal_code}
                        {' '}
                        {profile.city}
                        {profile.region ? `, ${profile.region}` : ''}
                      </span>
                    </dd>

                    <dt className="pt-0.5 text-2xs font-medium uppercase tracking-wider text-fg-3">Country</dt>
                    <dd className="font-mono text-base text-fg-1" data-testid="billing-details-value-country">{profile.country}</dd>
                  </dl>
                  {justSaved && (
                    <p role="status" data-testid="billing-details-saved" className="mt-4 text-sm text-fg-3">
                      Billing details saved. They apply from the next invoice.
                    </p>
                  )}
                </div>
              )
            : (
                <div data-testid="billing-details-empty" className="flex flex-col items-start gap-3">
                  <p className="text-sm text-fg-2">No billing details yet.</p>
                  {canEdit && (
                    <Button ref={triggerRef} type="button" data-testid="billing-details-add" onClick={startEditing}>
                      <Plus size={13} aria-hidden="true" />
                      Add billing details
                    </Button>
                  )}
                </div>
              )}
      </CardContent>
    </Card>
  );
}
