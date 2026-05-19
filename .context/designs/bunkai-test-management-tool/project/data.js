// Mock data for Bunkai
window.BunkaiData = (function() {

const projects = [
  { id: 'checkout-revamp', code: 'CHK', name: 'Checkout Revamp', modules: 7, atcs: 142, tests: 38, openBugs: 9, coverage: 78, lastActivity: '12m ago', status: 'pass' },
  { id: 'auth-service',    code: 'AUTH', name: 'Auth Service',    modules: 4, atcs: 96,  tests: 24, openBugs: 3, coverage: 91, lastActivity: '1h ago',  status: 'pass' },
  { id: 'mobile-onboard',  code: 'MOB', name: 'Mobile Onboarding', modules: 5, atcs: 64,  tests: 17, openBugs: 14, coverage: 52, lastActivity: '3h ago', status: 'fail' },
  { id: 'admin-console',   code: 'ADM', name: 'Admin Console',     modules: 6, atcs: 110, tests: 28, openBugs: 5, coverage: 84, lastActivity: 'yesterday', status: 'blocked' },
  { id: 'public-api-v3',   code: 'API3', name: 'Public API v3',    modules: 9, atcs: 211, tests: 56, openBugs: 2, coverage: 96, lastActivity: '2d ago',  status: 'pass' },
];

const activity = [
  { who: 'mariko.t', action: 'closed bug', target: 'BUG-204 · Promo code not applied on returning carts', time: '4m', kind: 'bug' },
  { who: 'agent/playwright-ci', action: 'reported run', target: 'RUN-1841 · Checkout · 142 ATCs · 138 pass / 4 fail', time: '11m', kind: 'run' },
  { who: 'jules.h',  action: 'created ATC', target: 'ATC-CHK-079 · Apply expired promo at checkout', time: '38m', kind: 'atc' },
  { who: 'mariko.t', action: 'edited', target: 'ATC-CHK-024 · Tax calculation on multi-currency cart', time: '52m', kind: 'atc' },
  { who: 'agent/claude-qa', action: 'started run', target: 'RUN-1840 · Checkout · agentic execution', time: '1h', kind: 'run' },
  { who: 'r.singh',  action: 'blocked', target: 'ATC-AUTH-031 · MFA enrolment via SMS (provider outage)', time: '2h', kind: 'atc' },
  { who: 'jules.h',  action: 'opened bug', target: 'BUG-205 · Stepper reverts on browser back', time: '3h', kind: 'bug' },
];

const activeRuns = [
  { id: 'RUN-1841', project: 'Checkout Revamp', mode: 'CI', exec: 'playwright-ci', total: 142, done: 142, pass: 138, fail: 4, started: '11m ago', status: 'fail' },
  { id: 'RUN-1840', project: 'Checkout Revamp', mode: 'Agentic', exec: 'claude-qa', total: 38, done: 21, pass: 19, fail: 2, started: '1h ago', status: 'running' },
  { id: 'RUN-1839', project: 'Auth Service',    mode: 'Manual',  exec: 'mariko.t',    total: 24, done: 8,  pass: 7,  fail: 0, started: '24m ago', status: 'running' },
  { id: 'RUN-1838', project: 'Admin Console',   mode: 'Manual',  exec: 'r.singh',     total: 18, done: 18, pass: 14, fail: 0, started: 'yesterday', status: 'blocked' },
];

// Project tree (focused on Checkout Revamp)
const tree = {
  id: 'p:checkout-revamp',
  type: 'project',
  name: 'Checkout Revamp',
  status: 'pass',
  children: [
    {
      id: 'm:cart', type: 'module', name: 'Cart', status: 'pass',
      children: [
        { id: 'f:cart-items', type: 'folder', name: 'Items & quantities', status: 'pass', children: [
          { id: 'a:CHK-001', type: 'atc',  name: 'Add single item to empty cart', code: 'ATC-CHK-001', layer: 'UI',  status: 'pass' },
          { id: 'a:CHK-002', type: 'atc',  name: 'Increase quantity from cart row', code: 'ATC-CHK-002', layer: 'UI',  status: 'pass' },
          { id: 'a:CHK-003', type: 'atc',  name: 'Remove last item empties cart',   code: 'ATC-CHK-003', layer: 'UI',  status: 'pass' },
          { id: 'a:CHK-004', type: 'atc',  name: 'POST /cart/items idempotency',     code: 'ATC-CHK-004', layer: 'API', status: 'pass' },
        ] },
        { id: 'f:cart-pricing', type: 'folder', name: 'Pricing & tax', status: 'fail', children: [
          { id: 'a:CHK-022', type: 'atc',  name: 'Subtotal updates with currency switch', code: 'ATC-CHK-022', layer: 'UI',  status: 'pass' },
          { id: 'a:CHK-024', type: 'atc',  name: 'Tax calculation on multi-currency cart', code: 'ATC-CHK-024', layer: 'API', status: 'fail' },
          { id: 'a:CHK-025', type: 'atc',  name: 'Promo discount stacks below cap',        code: 'ATC-CHK-025', layer: 'API', status: 'pass' },
        ] },
        { id: 't:T-CART-FULL', type: 'test', name: 'E2E · Full cart lifecycle', code: 'T-CART-FULL', status: 'pass' },
      ],
    },
    {
      id: 'm:checkout', type: 'module', name: 'Checkout flow', status: 'fail',
      children: [
        { id: 'f:promo', type: 'folder', name: 'Promo codes', status: 'fail', children: [
          { id: 'a:CHK-061', type: 'atc',  name: 'Apply valid promo code', code: 'ATC-CHK-061', layer: 'UI',  status: 'pass' },
          { id: 'a:CHK-079', type: 'atc',  name: 'Apply expired promo at checkout', code: 'ATC-CHK-079', layer: 'UI',  status: 'fail', selected: true },
          { id: 'a:CHK-080', type: 'atc',  name: 'Reject malformed promo via API',  code: 'ATC-CHK-080', layer: 'API', status: 'pass' },
          { id: 'a:CHK-081', type: 'atc',  name: 'Promo code persists across reload', code: 'ATC-CHK-081', layer: 'UI', status: 'blocked' },
        ] },
        { id: 'f:address', type: 'folder', name: 'Shipping address', status: 'pass', children: [
          { id: 'a:CHK-090', type: 'atc',  name: 'Add new shipping address',  code: 'ATC-CHK-090', layer: 'UI',  status: 'pass' },
          { id: 'a:CHK-091', type: 'atc',  name: 'Validate postal code format', code: 'ATC-CHK-091', layer: 'API', status: 'pass' },
        ] },
        { id: 'f:payment', type: 'folder', name: 'Payment', status: 'skipped', children: [
          { id: 'a:CHK-110', type: 'atc',  name: '3DS challenge happy path',  code: 'ATC-CHK-110', layer: 'UI',  status: 'skipped' },
          { id: 'a:CHK-111', type: 'atc',  name: 'Card declined surfaces inline error', code: 'ATC-CHK-111', layer: 'UI', status: 'skipped' },
        ] },
        { id: 't:T-CHK-PROMO',  type: 'test', name: 'E2E · Checkout with promo',   code: 'T-CHK-PROMO',  status: 'fail' },
        { id: 't:T-CHK-HAPPY',  type: 'test', name: 'E2E · Checkout happy path',   code: 'T-CHK-HAPPY',  status: 'pass' },
      ],
    },
    {
      id: 'm:receipts', type: 'module', name: 'Receipts & email', status: 'pass',
      children: [
        { id: 'a:CHK-140', type: 'atc',  name: 'Receipt PDF renders line items', code: 'ATC-CHK-140', layer: 'UI',  status: 'pass' },
        { id: 'a:CHK-141', type: 'atc',  name: 'Receipt email dispatched within 30s', code: 'ATC-CHK-141', layer: 'API', status: 'pass' },
      ],
    },
  ],
};

// The selected ATC (CHK-079) — full record for editor + detail panel
const focusATC = {
  id: 'ATC-CHK-079',
  title: 'Apply expired promo at checkout',
  module: 'Checkout flow › Promo codes',
  moduleId: 'm:checkout',
  layer: 'UI',
  status: 'fail',
  lastResult: { runId: 'RUN-1841', when: '11m ago', actor: 'playwright-ci', mode: 'CI' },
  story: {
    id: 'US-742',
    title: 'As a returning customer I want clear feedback when my promo code is no longer valid, so I can decide whether to proceed or contact support.',
  },
  acceptanceCriteria: [
    { id: 'AC-742-3', text: 'Expired promo code triggers a non-blocking inline error within 400ms', selected: true },
    { id: 'AC-742-4', text: 'Cart totals revert to pre-promo state when promo is rejected',          selected: true },
    { id: 'AC-742-5', text: 'Error message references the support article slug `promo-expired`',    selected: false },
  ],
  steps: [
    { id: 1, text: 'Open checkout with a cart containing 2+ items and total ≥ $50' },
    { id: 2, text: 'Focus the promo code field' },
    { id: 3, text: 'Enter promo code `WINTER22` (known expired)' },
    { id: 4, text: 'Submit the promo (Enter key)' },
    { id: 5, text: 'Observe inline error and cart total' },
  ],
  assertions: [
    'inline_error.text matches /expired/i',
    'cart.subtotal == cart.subtotal_pre_promo',
    'response_time_ms < 400',
    'no_blocking_modal_shown',
  ],
  tags: ['regression', 'pricing', 'promo', 'P2'],
  usedBy: [
    { id: 'T-CHK-PROMO', name: 'E2E · Checkout with promo',  status: 'fail' },
    { id: 'T-RET-USER',  name: 'E2E · Returning user retry', status: 'pass' },
  ],
};

// Manual run state for Screen 5
const manualRun = {
  id: 'RUN-1839',
  test: { code: 'T-AUTH-MFA', name: 'E2E · Sign-in with MFA & remembered device' },
  project: 'Auth Service',
  executor: 'mariko.t',
  startedAt: '24m ago',
  steps: [
    { id: 1, atc: 'ATC-AUTH-002', title: 'Land on /signin from logged-out homepage', layer: 'UI', steps: ['Open incognito window', 'Navigate to /signin', 'Confirm "Sign in" header renders'], result: 'pass' },
    { id: 2, atc: 'ATC-AUTH-008', title: 'Submit valid credentials',                  layer: 'UI', steps: ['Type registered email', 'Type valid password', 'Click "Continue"'], result: 'pass' },
    { id: 3, atc: 'ATC-AUTH-031', title: 'MFA challenge via authenticator app',       layer: 'UI', steps: [
      'Confirm MFA prompt renders within 1s',
      'Type the current TOTP from authenticator',
      'Click "Verify"',
      'Confirm redirect to /dashboard within 2s',
    ], result: null },
    { id: 4, atc: 'ATC-AUTH-040', title: 'Remember this device for 30 days',          layer: 'UI', steps: ['Open /signin again after sign-out', 'Confirm no MFA challenge is shown'], result: null },
    { id: 5, atc: 'ATC-AUTH-045', title: 'Audit log records the sign-in',             layer: 'API', steps: ['GET /me/audit?limit=1', 'Confirm latest entry kind=signin'], result: null },
    { id: 6, atc: 'ATC-AUTH-050', title: 'Session cookie has Secure & HttpOnly flags',layer: 'API', steps: ['Read cookie attributes', 'Assert Secure, HttpOnly, SameSite=Lax'], result: null },
  ],
  currentStep: 2, // index into steps
};

return { projects, activity, activeRuns, tree, focusATC, manualRun };
})();
