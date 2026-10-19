import { describe, expect, test } from 'bun:test';
import { debounce } from './debounce';

// BK-443 — the trailing-edge debounce behind the workbench address writes.

const wait = async (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('debounce', () => {
  test('a burst of calls fires once, with the last arguments', async () => {
    const seen: string[] = [];
    const d = debounce((value: string) => { seen.push(value); }, 20);
    d.call('l');
    d.call('lo');
    d.call('log');
    expect(seen).toEqual([]);
    await wait(60);
    expect(seen).toEqual(['log']);
  });

  test('cancel drops a pending call', async () => {
    const seen: string[] = [];
    const d = debounce((value: string) => { seen.push(value); }, 20);
    d.call('x');
    d.cancel();
    await wait(50);
    expect(seen).toEqual([]);
  });

  test('a later call after the quiet period fires again', async () => {
    let count = 0;
    const d = debounce(() => { count += 1; }, 10);
    d.call();
    await wait(40);
    d.call();
    await wait(40);
    expect(count).toBe(2);
  });
});
