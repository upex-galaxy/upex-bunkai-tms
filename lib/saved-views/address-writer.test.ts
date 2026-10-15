import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import { createAddressWriter, isLinkTarget } from './address-writer';

// BK-443 — the debounced address write must never discard the member's own
// navigation and must never write workbench keys onto another route's address.
// Fake timers: every case below is about WHEN the write may and may not fire.

const INDEX = '/projects/demo';

function setup(initial: { pathname: string, search: string }) {
  const location = { ...initial };
  const writes: string[] = [];
  const writer = createAddressWriter({
    delayMs: 250,
    indexPath: INDEX,
    location: () => location,
    replace: (url) => { writes.push(url); },
  });
  return { writer, writes, location };
}

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

describe('createAddressWriter', () => {
  test('writes once, after the quiet period, for a burst of changes', () => {
    const { writer, writes } = setup({ pathname: INDEX, search: '' });
    writer.schedule({ atc_q: 'l' });
    jest.advanceTimersByTime(100);
    writer.schedule({ atc_q: 'lo' });
    writer.schedule({ atc_q: 'log' });
    jest.advanceTimersByTime(249);
    expect(writes).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(writes).toEqual([`${INDEX}?atc_q=log`]);
  });

  test('(a) a navigation started within the delay cancels the write: nothing is written, so nothing is discarded', () => {
    const { writer, writes } = setup({ pathname: INDEX, search: '' });
    writer.schedule({ tag: 'smoke' });
    jest.advanceTimersByTime(100);
    // The member clicks a link: the owner cancels on that click.
    const link = { closest: (selector: string) => (selector === 'a[href]' ? {} : null) };
    if (isLinkTarget(link)) { writer.cancel(); }
    jest.advanceTimersByTime(1000);
    expect(writes).toEqual([]);
  });

  test('(b) a timer that fires after the pathname changed writes nothing', () => {
    const { writer, writes, location } = setup({ pathname: INDEX, search: '' });
    writer.schedule({ tag: 'smoke' });
    jest.advanceTimersByTime(100);
    // The navigation committed, but the effect cleanup has not cancelled yet.
    location.pathname = `${INDEX}/atcs/123`;
    jest.advanceTimersByTime(200);
    expect(writes).toEqual([]);
  });

  test('(c) cancel on unmount drops the pending write', () => {
    const { writer, writes } = setup({ pathname: INDEX, search: '' });
    writer.schedule({ tag: 'smoke' });
    writer.cancel();
    jest.advanceTimersByTime(1000);
    expect(writes).toEqual([]);
  });

  test('(d) an address that already shows the state is not rewritten', () => {
    const { writer, writes } = setup({ pathname: INDEX, search: '?tag=smoke' });
    writer.schedule({ tag: 'smoke' });
    jest.advanceTimersByTime(250);
    expect(writes).toEqual([]);
  });

  test('(e) the Command Palette\'s ?module= survives the write', () => {
    const { writer, writes } = setup({ pathname: INDEX, search: '?module=abc&layer=UI' });
    writer.schedule({ tag: 'smoke' });
    jest.advanceTimersByTime(250);
    expect(writes).toEqual([`${INDEX}?module=abc&tag=smoke`]);
  });

  test('a cancelled writer can be scheduled again (back on the index route)', () => {
    const { writer, writes } = setup({ pathname: INDEX, search: '' });
    writer.schedule({ tag: 'a' });
    writer.cancel();
    writer.schedule({ tag: 'b' });
    jest.advanceTimersByTime(250);
    expect(writes).toEqual([`${INDEX}?tag=b`]);
  });
});

describe('isLinkTarget', () => {
  test('is true for a click inside a link and false for anything else', () => {
    expect(isLinkTarget({ closest: () => ({}) })).toBe(true);
    expect(isLinkTarget({ closest: () => null })).toBe(false);
    expect(isLinkTarget(null)).toBe(false);
    expect(isLinkTarget({})).toBe(false);
  });
});
