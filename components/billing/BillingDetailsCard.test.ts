import type { FetchHandler } from './billing-test-support';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { errorResponse, installFetchDouble, jsonResponse, setInputValue } from './billing-test-support';

// BK-231 BillingDetailsCard. MOCK ONLY: there is no Stripe account for this
// project, so the PATCH endpoint is a fetch double and no live provider is
// contacted. The DOM is registered per file and React is imported afterwards
// (same pattern as BillingOverviewView.test.ts).
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { BillingDetailsCard } = await import('@components/billing/BillingDetailsCard');

type Props = Parameters<typeof BillingDetailsCard>[0];
type Profile = NonNullable<Props['profile']>;

const realSetTimeout = globalThis.setTimeout;

const PROFILE: Profile = {
  company_name: 'Upex Systems S.L.',
  billing_email: 'billing@upex.dev',
  address_line1: 'Calle de Serrano 41',
  address_line2: '3a planta',
  city: 'Madrid',
  region: 'Madrid',
  postal_code: '28001',
  country: 'ES',
  updated_at: '2026-07-01T10:00:00.000Z',
};

let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];
let double: ReturnType<typeof installFetchDouble>;

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => { realSetTimeout(resolve, 0); });
  });
}

function mount(overrides: Partial<Props> = {}) {
  const props: Props = {
    workspaceId: 'ws-1',
    profile: PROFILE,
    canEdit: true,
    onSaved: () => {},
    ...overrides,
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(createElement(BillingDetailsCard, props)); });
  mounted.push({ container, root });
  return container;
}

function el<T extends HTMLElement = HTMLElement>(container: HTMLElement, id: string): T | null {
  return container.querySelector<T>(`[data-testid="${id}"]`);
}

function input(container: HTMLElement, name: string): HTMLInputElement {
  const found = el<HTMLInputElement>(container, `billing-details-input-${name}`);
  if (!found) { throw new Error(`missing input ${name}`); }
  return found;
}

function type(container: HTMLElement, name: string, value: string) {
  act(() => { setInputValue(input(container, name), value); });
}

function click(target: HTMLElement | null) {
  if (!target) { throw new Error('click target missing'); }
  act(() => { target.click(); });
}

function submit(container: HTMLElement) {
  const form = el<HTMLFormElement>(container, 'billing-details-form');
  if (!form) { throw new Error('form missing'); }
  act(() => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}

function fillValid(container: HTMLElement) {
  type(container, 'company_name', '  Acme Corp  ');
  type(container, 'billing_email', 'ap@acme.test');
  type(container, 'address_line1', '1 Main St');
  type(container, 'address_line2', '');
  type(container, 'city', 'Austin');
  type(container, 'region', '');
  type(container, 'postal_code', '78701');
  type(container, 'country', 'us');
}

function useHandler(handler: FetchHandler) {
  double = installFetchDouble(handler);
}

const SAVED: Profile = {
  company_name: 'Acme Corp',
  billing_email: 'ap@acme.test',
  address_line1: '1 Main St',
  address_line2: null,
  city: 'Austin',
  region: null,
  postal_code: '78701',
  country: 'US',
  updated_at: '2026-07-02T10:00:00.000Z',
};

beforeEach(() => {
  mounted = [];
  useHandler(() => jsonResponse(SAVED));
});

afterEach(() => {
  mounted.forEach(({ container, root }) => {
    act(() => { root.unmount(); });
    container.remove();
  });
  mounted = [];
  double.restore();
});

describe('BillingDetailsCard view mode', () => {
  test('shows the title, description, profile fields and the country as its code', () => {
    const container = mount();
    expect(container.textContent).toContain('Billing details');
    expect(container.textContent).toContain('Shown on every invoice. Changes apply from the next invoice; issued invoices never change.');
    expect(el(container, 'billing-details-value-company')?.textContent).toBe('Upex Systems S.L.');
    expect(el(container, 'billing-details-value-email')?.textContent).toBe('billing@upex.dev');
    const address = el(container, 'billing-details-value-address')?.textContent ?? '';
    expect(address).toContain('Calle de Serrano 41');
    expect(address).toContain('3a planta');
    expect(address).toContain('28001 Madrid, Madrid');
    expect(el(container, 'billing-details-value-country')?.textContent).toBe('ES');
  });

  test('omits empty optional address parts instead of printing blanks', () => {
    const container = mount({ profile: { ...PROFILE, address_line2: null, region: null } });
    const address = el(container, 'billing-details-value-address');
    expect(address?.querySelectorAll('span.block')).toHaveLength(2);
    expect(address?.textContent).toContain('28001 Madrid');
    expect(address?.textContent).not.toContain(',');
  });

  test('has no Tax ID anywhere', () => {
    const container = mount();
    expect(container.textContent?.toLowerCase()).not.toContain('tax id');
    click(el(container, 'billing-details-edit'));
    expect(container.textContent?.toLowerCase()).not.toContain('tax id');
  });
});

describe('BillingDetailsCard empty state and role gating', () => {
  test('owner with no profile: "No billing details yet." plus an Add button', () => {
    const container = mount({ profile: null });
    expect(el(container, 'billing-details-empty')?.textContent).toContain('No billing details yet.');
    expect(el(container, 'billing-details-add')?.textContent).toContain('Add billing details');
    expect(el(container, 'billing-details-edit')).toBeNull();
  });

  test('admin with no profile: the empty text only, no Add button', () => {
    const container = mount({ profile: null, canEdit: false });
    expect(el(container, 'billing-details-empty')?.textContent).toContain('No billing details yet.');
    expect(el(container, 'billing-details-add')).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  test('admin with a profile reads it but gets no Edit control', () => {
    const container = mount({ canEdit: false });
    expect(el(container, 'billing-details-view')).not.toBeNull();
    expect(el(container, 'billing-details-edit')).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  test('Add opens an empty form; Edit opens it prefilled from the profile', () => {
    const empty = mount({ profile: null });
    click(el(empty, 'billing-details-add'));
    expect(input(empty, 'company_name').value).toBe('');

    const filled = mount();
    click(el(filled, 'billing-details-edit'));
    expect(input(filled, 'company_name').value).toBe('Upex Systems S.L.');
    expect(input(filled, 'country').value).toBe('ES');
  });

  test('Cancel returns to view mode without any request', () => {
    const container = mount();
    click(el(container, 'billing-details-edit'));
    type(container, 'company_name', 'Changed');
    click(el(container, 'billing-details-cancel'));
    expect(el(container, 'billing-details-form')).toBeNull();
    expect(el(container, 'billing-details-value-company')?.textContent).toBe('Upex Systems S.L.');
    expect(double.calls).toHaveLength(0);
  });
});

describe('BillingDetailsCard validation before any request', () => {
  test('required fields: empty submit shows per-field errors, the form-level message and sends nothing', () => {
    const container = mount({ profile: null });
    click(el(container, 'billing-details-add'));
    submit(container);

    expect(double.calls).toHaveLength(0);
    for (const name of ['company_name', 'billing_email', 'address_line1', 'city', 'postal_code', 'country']) {
      expect(el(container, `billing-details-error-${name}`)).not.toBeNull();
      expect(input(container, name).getAttribute('aria-invalid')).toBe('true');
    }
    // Optional fields stay clean.
    expect(el(container, 'billing-details-error-address_line2')).toBeNull();
    expect(el(container, 'billing-details-error-region')).toBeNull();
    expect(el(container, 'billing-details-form-error')?.textContent).toBe('Check the highlighted fields and try again.');
    expect(el(container, 'billing-details-form-error')?.getAttribute('role')).toBe('alert');
  });

  test('errors are wired with aria-describedby to the message under the field', () => {
    const container = mount({ profile: null });
    click(el(container, 'billing-details-add'));
    submit(container);
    const company = input(container, 'company_name');
    const errorId = company.getAttribute('aria-describedby');
    expect(errorId).toBe('billing-details-company_name-error');
    expect(container.querySelector(`#${errorId}`)?.textContent).toBe('Company is required.');
  });

  test('email format is checked', () => {
    const container = mount();
    click(el(container, 'billing-details-edit'));
    type(container, 'billing_email', 'not-an-email');
    submit(container);
    expect(el(container, 'billing-details-error-billing_email')?.textContent).toBe('Enter a valid email address.');
    expect(double.calls).toHaveLength(0);
  });

  test('email check mirrors the server: single-letter TLDs and double dots are refused', async () => {
    const container = mount();
    click(el(container, 'billing-details-edit'));
    for (const bad of ['a@b.c', 'a..b@acme.test', '.a@acme.test', 'a@acme', 'a b@acme.test']) {
      type(container, 'billing_email', bad);
      submit(container);
      expect(el(container, 'billing-details-error-billing_email')?.textContent).toBe('Enter a valid email address.');
    }
    type(container, 'billing_email', 'first.last+tag@sub.acme.co');
    submit(container);
    await flush();
    expect(el(container, 'billing-details-error-billing_email')).toBeNull();
  });

  test('length limits: company 120, email 254, lines 120, city 80, region 80, postal 20', () => {
    const container = mount();
    click(el(container, 'billing-details-edit'));
    type(container, 'company_name', 'x'.repeat(121));
    type(container, 'billing_email', `${'a'.repeat(250)}@b.co`);
    type(container, 'address_line1', 'x'.repeat(121));
    type(container, 'address_line2', 'x'.repeat(121));
    type(container, 'city', 'x'.repeat(81));
    type(container, 'region', 'x'.repeat(81));
    type(container, 'postal_code', 'x'.repeat(21));
    submit(container);

    expect(el(container, 'billing-details-error-company_name')?.textContent).toBe('Company must be 120 characters or fewer.');
    expect(el(container, 'billing-details-error-billing_email')?.textContent).toBe('Billing email must be 254 characters or fewer.');
    expect(el(container, 'billing-details-error-address_line1')?.textContent).toBe('Address line 1 must be 120 characters or fewer.');
    expect(el(container, 'billing-details-error-address_line2')?.textContent).toBe('Address line 2 must be 120 characters or fewer.');
    expect(el(container, 'billing-details-error-city')?.textContent).toBe('City must be 80 characters or fewer.');
    expect(el(container, 'billing-details-error-region')?.textContent).toBe('State or region must be 80 characters or fewer.');
    expect(el(container, 'billing-details-error-postal_code')?.textContent).toBe('Postal code must be 20 characters or fewer.');
    expect(double.calls).toHaveLength(0);
  });

  test('exact boundary values are accepted', async () => {
    const container = mount();
    click(el(container, 'billing-details-edit'));
    type(container, 'company_name', 'x'.repeat(120));
    type(container, 'city', 'x'.repeat(80));
    type(container, 'postal_code', 'x'.repeat(20));
    submit(container);
    await flush();
    expect(el(container, 'billing-details-form-error')).toBeNull();
    expect(double.calls).toHaveLength(1);
  });

  test('country must be exactly two letters', () => {
    const container = mount();
    click(el(container, 'billing-details-edit'));
    for (const bad of ['U', 'USA', 'U1', '12']) {
      type(container, 'country', bad);
      submit(container);
      expect(el(container, 'billing-details-error-country')?.textContent).toBe('Use a two-letter country code, for example US.');
    }
    expect(double.calls).toHaveLength(0);
  });

  test('a flagged field clears its message as soon as it is fixed', () => {
    const container = mount();
    click(el(container, 'billing-details-edit'));
    type(container, 'billing_email', 'nope');
    submit(container);
    expect(el(container, 'billing-details-error-billing_email')).not.toBeNull();
    type(container, 'billing_email', 'ok@acme.test');
    expect(el(container, 'billing-details-error-billing_email')).toBeNull();
    expect(input(container, 'billing_email').getAttribute('aria-invalid')).toBeNull();
  });
});

describe('BillingDetailsCard save', () => {
  test('PATCHes the trimmed payload (country uppercased, empty optionals omitted), then returns to view and calls onSaved', async () => {
    const saved: Profile[] = [];
    const container = mount({ onSaved: (profile) => { saved.push(profile); } });
    click(el(container, 'billing-details-edit'));
    fillValid(container);
    submit(container);
    await flush();

    expect(double.calls).toHaveLength(1);
    const call = double.calls[0];
    expect(call.url).toBe('/api/v1/workspaces/ws-1/billing/details');
    expect(call.method).toBe('PATCH');
    expect(call.headers['content-type']).toBe('application/json');
    expect(JSON.parse(call.body ?? '{}')).toEqual({
      company_name: 'Acme Corp',
      billing_email: 'ap@acme.test',
      address_line1: '1 Main St',
      city: 'Austin',
      postal_code: '78701',
      country: 'US',
    });

    expect(saved).toEqual([SAVED]);
    expect(el(container, 'billing-details-form')).toBeNull();
    expect(el(container, 'billing-details-view')).not.toBeNull();
    expect(el(container, 'billing-details-saved')?.textContent).toContain('Billing details saved');
  });

  test('clearing a saved optional field omits it, which the full-replace route stores as null', async () => {
    const container = mount();
    click(el(container, 'billing-details-edit'));
    expect(input(container, 'address_line2').value).toBe('3a planta');
    type(container, 'address_line2', '');
    type(container, 'region', '   ');
    submit(container);
    await flush();
    const payload = JSON.parse(double.calls[0].body ?? '{}') as Record<string, unknown>;
    expect(payload).not.toHaveProperty('address_line2');
    expect(payload).not.toHaveProperty('region');
    expect(payload.company_name).toBe('Upex Systems S.L.');
  });

  test('sends optional address_line2 and region when they are filled', async () => {
    const container = mount();
    click(el(container, 'billing-details-edit'));
    fillValid(container);
    type(container, 'address_line2', 'Suite 4');
    type(container, 'region', 'TX');
    submit(container);
    await flush();
    expect(JSON.parse(double.calls[0].body ?? '{}')).toMatchObject({ address_line2: 'Suite 4', region: 'TX' });
  });

  test('saving state: Save is disabled and aria-busy, inputs lock, a second submit sends nothing', async () => {
    let release: (response: Response) => void = () => {};
    useHandler(async () => new Promise<Response>((resolve) => { release = resolve; }));
    const container = mount();
    click(el(container, 'billing-details-edit'));
    fillValid(container);
    submit(container);
    await flush();

    const save = el<HTMLButtonElement>(container, 'billing-details-save');
    expect(save?.disabled).toBe(true);
    expect(save?.getAttribute('aria-busy')).toBe('true');
    expect(save?.textContent).toContain('Saving');
    expect(input(container, 'company_name').disabled).toBe(true);
    expect(el<HTMLButtonElement>(container, 'billing-details-cancel')?.disabled).toBe(true);

    submit(container);
    expect(double.calls).toHaveLength(1);

    await act(async () => { release(jsonResponse(SAVED)); });
    await flush();
    expect(el(container, 'billing-details-form')).toBeNull();
  });

  test('422 validation_failed: shows the form-level message, stays in the form with the typed values', async () => {
    useHandler(() => errorResponse(422, 'validation_failed', 'Request validation failed.'));
    const container = mount();
    click(el(container, 'billing-details-edit'));
    fillValid(container);
    submit(container);
    await flush();

    expect(el(container, 'billing-details-form-error')?.textContent).toBe('Check the highlighted fields and try again.');
    expect(input(container, 'city').value).toBe('Austin');
    expect(el<HTMLButtonElement>(container, 'billing-details-save')?.disabled).toBe(false);
  });

  test('403, 409, 502 and 503 show the server error.message', async () => {
    const cases: Array<[number, string, string]> = [
      [403, 'forbidden', 'Only the workspace owner can change billing details.'],
      [409, 'no_active_subscription', 'This workspace has no active subscription.'],
      [502, 'upstream_error', 'The billing provider is unavailable.'],
      [503, 'service_unavailable', 'Billing is temporarily unavailable.'],
    ];
    for (const [status, code, message] of cases) {
      double?.restore();
      useHandler(() => errorResponse(status, code, message));
      const container = mount();
      click(el(container, 'billing-details-edit'));
      fillValid(container);
      submit(container);
      await flush();
      expect(el(container, 'billing-details-form-error')?.textContent).toBe(message);
    }
  });

  test('an unreadable error body falls back to a safe message and never prints the raw body', async () => {
    useHandler(() => new Response('<html>stack trace</html>', { status: 500 }));
    const container = mount();
    click(el(container, 'billing-details-edit'));
    fillValid(container);
    submit(container);
    await flush();
    expect(el(container, 'billing-details-form-error')?.textContent).toBe('Could not save billing details. Please try again.');
    expect(container.textContent).not.toContain('stack trace');
  });
});
