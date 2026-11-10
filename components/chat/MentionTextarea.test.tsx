import type { ChatMention } from '@lib/chat/mentions';
import type { ChatMember } from '@lib/chat/messages';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

// BK-217 — the composer popover and the pill. The DOM is registered per file and
// React is imported afterwards (same pattern as the billing component tests).
// Members and handlers are module-level so the doubles are referentially stable
// across renders.
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { act, createElement, useState } = await import('react');
const { createRoot } = await import('react-dom/client');
const { MentionTextarea } = await import('./MentionTextarea');
const { MentionPill } = await import('./MentionPill');

const MEMBERS: ChatMember[] = [
  { user_id: 'u-sara', display_name: 'Sara Iglesias', email: 'sara.iglesias@x.test', role: 'owner' },
  { user_id: 'u-elena', display_name: 'Elena Vargas', email: 'elena.vargas@x.test', role: 'member' },
  { user_id: 'u-noa', display_name: 'Noa Viewer', email: 'noa@x.test', role: 'viewer' },
];

const observed: { value: string, picked: ChatMention[], keys: string[] } = { value: '', picked: [], keys: [] };
const onKeyDown = (e: { key: string }) => { observed.keys.push(e.key); };

function Harness() {
  const [value, setValue] = useState('');
  const [picked, setPicked] = useState<ChatMention[]>([]);
  observed.value = value;
  observed.picked = picked;
  return createElement(MentionTextarea, {
    testId: 'composer',
    ariaLabel: 'Message #general',
    value,
    onValueChange: setValue,
    picked,
    onPickedChange: setPicked,
    members: MEMBERS,
    selfUserId: 'u-sara',
    onKeyDown,
  });
}

let mounted: { container: HTMLElement, root: { unmount: () => void } }[] = [];

function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(createElement(Harness)); });
  mounted.push({ container, root });
  return container;
}

afterEach(() => {
  for (const m of mounted) { act(() => { m.root.unmount(); }); m.container.remove(); }
  mounted = [];
  observed.keys.length = 0;
});

function type(container: HTMLElement, text: string) {
  const el = container.querySelector('textarea') as HTMLTextAreaElement;
  act(() => {
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    descriptor?.set?.call(el, text);
    el.selectionStart = text.length;
    el.selectionEnd = text.length;
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  return el;
}

function press(el: HTMLElement, key: string) {
  act(() => {
    el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

const hasPopover = (c: HTMLElement) => c.querySelector('[data-testid="chat_mention_popover"]') !== null;
const optionNames = (c: HTMLElement) => [...c.querySelectorAll('[data-testid="chat_mention_option"]')].map(o => o.textContent ?? '');

describe('MentionTextarea', () => {
  test('typing "@El" lists the matching active member with her role', () => {
    const c = mount();
    type(c, 'hi @El');
    expect(optionNames(c)).toHaveLength(1);
    expect(optionNames(c)[0]).toContain('Elena Vargas');
    expect(optionNames(c)[0]).toContain('member');
  });

  test('a bare "@" lists everyone, viewers included', () => {
    const c = mount();
    type(c, '@');
    expect(optionNames(c).join('|')).toContain('Noa Viewer');
    expect(optionNames(c)).toHaveLength(3);
  });

  test('no popover without "@" or for a name nobody has', () => {
    const c = mount();
    type(c, 'plain text');
    expect(hasPopover(c)).toBe(false);
    type(c, '@Mateo');
    expect(hasPopover(c)).toBe(false);
  });

  test('Enter picks the highlighted member, inserts "@Name " and records the id', () => {
    const c = mount();
    const el = type(c, 'hey @El');
    press(el, 'Enter');
    expect(observed.value).toBe('hey @Elena Vargas ');
    expect(observed.picked).toEqual([{ user_id: 'u-elena', name: 'Elena Vargas' }]);
    expect(observed.keys).toEqual([]);
    expect(hasPopover(c)).toBe(false);
  });

  test('Down moves the selection before Enter picks', () => {
    const c = mount();
    const el = type(c, '@');
    press(el, 'ArrowDown');
    press(el, 'Enter');
    expect(observed.picked).toEqual([{ user_id: 'u-elena', name: 'Elena Vargas' }]);
  });

  test('Escape dismisses the popover without leaving the field, and the text stays', () => {
    const c = mount();
    const el = type(c, '@El');
    press(el, 'Escape');
    expect(hasPopover(c)).toBe(false);
    expect(observed.value).toBe('@El');
    expect(observed.keys).toEqual([]);
  });

  test('with the popover closed, Enter reaches the parent (it sends)', () => {
    const c = mount();
    const el = type(c, 'just text');
    press(el, 'Enter');
    expect(observed.keys).toEqual(['Enter']);
  });
});

describe('MentionPill', () => {
  const sara = MEMBERS[0];
  const render = (props: { member: ChatMember | undefined, isSelf: boolean, online: boolean }) =>
    renderToStaticMarkup(createElement(MentionPill, { text: '@Sara Iglesias', ...props }));

  test('a mention of someone else is a plain pill with a member card', () => {
    const html = render({ member: sara, isSelf: false, online: true });
    expect(html).toContain('data-self="false"');
    expect(html).toContain('@Sara Iglesias');
    expect(html).toContain('Online');
    expect(html).toContain('OWNER'.toLowerCase());
  });

  test('a mention of the reader renders the stronger self style', () => {
    const html = render({ member: sara, isSelf: true, online: false });
    expect(html).toContain('data-self="true"');
    expect(html).toContain('bg-accent-soft');
    expect(html).toContain('Offline');
  });

  test('a former member is a muted pill labelled "former member" with no member card', () => {
    const html = render({ member: undefined, isSelf: false, online: false });
    expect(html).toContain('data-former="true"');
    expect(html).toContain('former member');
    expect(html).not.toContain('chat_mention_card');
  });
});
