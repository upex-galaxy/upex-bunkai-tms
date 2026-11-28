import type { ReactElement } from 'react';
import { afterEach, beforeEach, expect, it } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

interface FocusCall {
  testId: string | null
  options: FocusOptions | undefined
}

interface LastPageFocusCase {
  render: () => ReactElement
  lastPage: unknown
  loadTestId: string
  footTestId: string
  rowsTestId: string
  rowCount: number
}

const byTestId = (testId: string) => document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);

export function itFocusesTheFootWithoutScrolling({ render, lastPage, loadTestId, footTestId, rowsTestId, rowCount }: LastPageFocusCase) {
  const focusCalls: FocusCall[] = [];
  const realFocus = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'focus')!;
  const realFetch = globalThis.fetch;
  let nextPage: unknown = lastPage;
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    focusCalls.length = 0;
    nextPage = lastPage;
    globalThis.fetch = (async () => Response.json(nextPage)) as unknown as typeof fetch;
    Object.defineProperty(HTMLElement.prototype, 'focus', {
      ...realFocus,
      value(this: HTMLElement, options?: FocusOptions) {
        focusCalls.push({ testId: this.getAttribute('data-testid'), options });
        (realFocus.value as (this: HTMLElement, options?: FocusOptions) => void).call(this, options);
      },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    globalThis.fetch = realFetch;
    Object.defineProperty(HTMLElement.prototype, 'focus', realFocus);
  });

  it('moves focus to the foot without scrolling when the last page arrives', async () => {
    act(() => root.render(render()));

    await act(async () => {
      byTestId(loadTestId)!.click();
    });

    expect(byTestId(rowsTestId)!.querySelectorAll(':scope > tr').length).toBe(rowCount);
    expect(byTestId(loadTestId)).toBeNull();
    expect(document.activeElement).toBe(byTestId(footTestId));
    expect(focusCalls).toEqual([{ testId: footTestId, options: { preventScroll: true } }]);
  });

  it('does not move focus while older pages remain', async () => {
    nextPage = { ...(lastPage as object), next_cursor: 'cursor-2' };
    act(() => root.render(render()));

    await act(async () => {
      byTestId(loadTestId)!.click();
    });

    expect(byTestId(rowsTestId)!.querySelectorAll(':scope > tr').length).toBe(rowCount);
    expect(byTestId(loadTestId)).not.toBeNull();
    expect(focusCalls).toEqual([]);
  });
}
