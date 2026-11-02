'use client';

import { readApiError } from '@components/billing/billing-format';
import { Button } from '@components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@components/ui/card';
import * as Dialog from '@radix-ui/react-dialog';
import { CreditCard, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface PaymentMethodSummary {
  brand: string
  last4: string
  exp_month: number
  exp_year: number
}

interface PaymentMethodCardProps {
  workspaceId: string
  paymentMethod: PaymentMethodSummary | null
  canEdit: boolean
  failed: boolean
  replaceOpen: boolean
  onReplaceOpenChange: (open: boolean) => void
}

const BRAND_LABELS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
};

const PROVIDER_NOTE = 'Card details are entered in the payment provider\'s secure window. Bunkai never sees or stores the full card number.';
const DIALOG_BODY = 'You will enter the new card in the payment provider\'s secure window. Bunkai never sees or stores the full card number.';
const WINDOW_FALLBACK_MESSAGE = 'Could not open the secure window. Please try again.';

function brandLabel(brand: string): string {
  const key = brand.toLowerCase();
  return BRAND_LABELS[key] ?? (brand.length > 0 ? brand.charAt(0).toUpperCase() + brand.slice(1) : 'Card');
}

function formatExpiry(month: number, year: number): string {
  return `${String(month).padStart(2, '0')}/${String(year % 100).padStart(2, '0')}`;
}

// Only ever an https hand-off: the URL comes from the server, and the browser
// is about to be navigated to it, so anything else (javascript:, data:, http:)
// is refused rather than assigned.
function isSecureUrl(value: unknown): value is string {
  if (typeof value !== 'string') { return false; }
  try {
    return new URL(value).protocol === 'https:';
  }
  catch {
    return false;
  }
}

// Payment method card (BK-231). Shows brand, last four and expiry only; card
// entry happens on the provider-hosted page the dialog hands off to. There is
// no card number, CVC or expiry input anywhere in this component. `replaceOpen`
// is controlled by the parent so the failed-renewal banner can open the same
// dialog.
export function PaymentMethodCard({
  workspaceId,
  paymentMethod,
  canEdit,
  failed,
  replaceOpen,
  onReplaceOpenChange,
}: PaymentMethodCardProps) {
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Closing the dialog (any path) leaves a clean slate for the next open.
  useEffect(() => {
    if (!replaceOpen) {
      setSubmitting(false);
      setRedirecting(false);
      setError(null);
    }
  }, [replaceOpen]);

  const handleOpenChange = (open: boolean) => {
    // The POST is in flight: closing now would orphan its result.
    if (!open && submitting) { return; }
    onReplaceOpenChange(open);
  };

  const continueToSecureWindow = async () => {
    if (submitting || redirecting) { return; }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/billing/payment-method`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
      if (!response.ok) {
        const info = await readApiError(response);
        setError(info.message ?? WINDOW_FALLBACK_MESSAGE);
        return;
      }
      const body = await response.json().catch(() => null) as { url?: unknown } | null;
      if (!isSecureUrl(body?.url)) {
        setError(WINDOW_FALLBACK_MESSAGE);
        return;
      }
      setRedirecting(true);
      window.location.assign(body.url);
    }
    catch {
      setError(WINDOW_FALLBACK_MESSAGE);
    }
    finally {
      setSubmitting(false);
    }
  };

  return (
    <Card data-testid="payment-method-card">
      <CardHeader className="border-b border-stroke-1 p-4">
        <CardTitle role="heading" aria-level={2}>Payment method</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          {paymentMethod
            ? (
                <>
                  <span
                    aria-hidden="true"
                    className="inline-flex items-center gap-2 rounded-1 border border-stroke-2 bg-surface-3 px-3 py-2 font-mono text-xs font-semibold uppercase tracking-wide text-fg-1"
                  >
                    <CreditCard size={13} className="text-fg-3" />
                    {paymentMethod.brand}
                  </span>
                  <div>
                    <div className="text-base text-fg-1" data-testid="payment-method-summary">
                      {brandLabel(paymentMethod.brand)}
                      {' ending '}
                      <span className="font-mono text-fg-0">{paymentMethod.last4}</span>
                    </div>
                    <div className="mt-px text-sm text-fg-3" data-testid="payment-method-expiry">
                      Expires
                      {' '}
                      <span className="font-mono">{formatExpiry(paymentMethod.exp_month, paymentMethod.exp_year)}</span>
                    </div>
                  </div>
                  {failed && (
                    <span className="status-chip" data-status="fail" data-testid="payment-method-failed-chip">
                      <X size={11} aria-hidden="true" />
                      Last charge failed
                    </span>
                  )}
                </>
              )
            : (
                <p className="text-sm text-fg-2" data-testid="payment-method-unavailable">
                  Payment method details are not available right now.
                </p>
              )}

          {canEdit && (
            <div className="ml-auto">
              <Button
                ref={triggerRef}
                type="button"
                variant={failed ? 'primary' : 'default'}
                data-testid="payment-method-replace"
                onClick={() => { onReplaceOpenChange(true); }}
              >
                Replace payment method
              </Button>
            </div>
          )}
        </div>

        <p className="mt-3 text-[11.5px] text-fg-3" data-testid="payment-method-note">{PROVIDER_NOTE}</p>
      </CardContent>

      {canEdit && (
        <Dialog.Root open={replaceOpen} onOpenChange={handleOpenChange}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
            <Dialog.Content
              data-testid="payment-method-dialog"
              onCloseAutoFocus={(event) => {
                // No Radix Trigger here (the banner can open this dialog too),
                // so hand focus back to the card's own button by hand.
                event.preventDefault();
                triggerRef.current?.focus();
              }}
              className="fixed left-1/2 top-1/2 z-50 flex w-[440px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-3 border border-stroke-3 bg-surface-3 p-6 shadow-pop"
            >
              <Dialog.Title className="text-md font-semibold text-fg-0">Replace payment method</Dialog.Title>
              <Dialog.Description className="text-sm text-fg-2">{DIALOG_BODY}</Dialog.Description>

              {error && (
                <p role="alert" data-testid="payment-method-dialog-error" className="text-sm text-signal-fail">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-end gap-2">
                <Button type="button" data-testid="payment-method-dialog-cancel" disabled={submitting} onClick={() => { onReplaceOpenChange(false); }}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  data-testid="payment-method-dialog-continue"
                  disabled={submitting || redirecting}
                  aria-busy={submitting || redirecting}
                  onClick={() => { void continueToSecureWindow(); }}
                >
                  {(submitting || redirecting) && <RefreshCw size={13} aria-hidden="true" className="motion-safe:animate-spin" />}
                  {redirecting ? 'Opening secure window…' : 'Continue to secure window'}
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </Card>
  );
}
