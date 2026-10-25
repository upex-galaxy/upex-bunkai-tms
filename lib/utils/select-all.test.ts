import { describe, expect, it } from 'bun:test';
import { selectAll } from './select-all';

function source(total: number) {
  const calls: Array<{ from: number, to: number }> = [];
  const fetchPage = async (range: { from: number, to: number }) => {
    calls.push(range);
    const data = Array.from({ length: Math.max(0, Math.min(total, range.to + 1) - range.from) }, (_, i) => range.from + i);
    return { data, error: null };
  };
  return { calls, fetchPage };
}

describe('selectAll', () => {
  it('pages past the 1000-row cap and returns every row once', async () => {
    const { calls, fetchPage } = source(2500);
    const rows = await selectAll(fetchPage);
    expect(rows).toHaveLength(2500);
    expect(new Set(rows).size).toBe(2500);
    expect(calls).toHaveLength(3);
  });

  it('stops after one request when the table fits in a page', async () => {
    const { calls, fetchPage } = source(10);
    expect(await selectAll(fetchPage)).toHaveLength(10);
    expect(calls).toHaveLength(1);
  });

  it('issues a final empty page when the total is an exact multiple of the page size', async () => {
    const { calls, fetchPage } = source(1000);
    expect(await selectAll(fetchPage)).toHaveLength(1000);
    expect(calls).toHaveLength(2);
  });

  it('throws the first page error', async () => {
    let thrown: unknown;
    try {
      await selectAll(async () => ({ data: null, error: { message: 'boom' } }));
    }
    catch (error) {
      thrown = error;
    }
    expect((thrown as Error).message).toBe('boom');
  });
});
