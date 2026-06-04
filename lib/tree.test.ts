import { moduleBreadcrumb } from '@lib/tree';
import { describe, expect, test } from 'bun:test';

interface Chain {
  id: string
  parent_module_id: string | null
  name: string
}

describe('moduleBreadcrumb', () => {
  const modules: Chain[] = [
    { id: 'p', parent_module_id: null, name: 'Payment' },
    { id: 'r', parent_module_id: 'p', name: 'Refunds' },
    { id: 'd', parent_module_id: 'r', name: 'Disputes' },
  ];

  test('returns the display-name chain root→module (AC2: "Payment / Refunds")', () => {
    expect(moduleBreadcrumb(modules, 'r')).toEqual(['Payment', 'Refunds']);
  });

  test('a root module yields a single-name breadcrumb', () => {
    expect(moduleBreadcrumb(modules, 'p')).toEqual(['Payment']);
  });

  test('walks an arbitrarily deep chain', () => {
    expect(moduleBreadcrumb(modules, 'd')).toEqual(['Payment', 'Refunds', 'Disputes']);
  });

  test('uses display names, not the slug path', () => {
    // A module whose name differs in casing/spacing from any slug — proves the
    // breadcrumb reads `name`, never the materialized slug `path`.
    const withSpaces: Chain[] = [
      { id: 'a', parent_module_id: null, name: 'Payment Gateway' },
      { id: 'b', parent_module_id: 'a', name: 'Refund Requests' },
    ];
    expect(moduleBreadcrumb(withSpaces, 'b')).toEqual([
      'Payment Gateway',
      'Refund Requests',
    ]);
  });

  test('unknown module id yields an empty breadcrumb', () => {
    expect(moduleBreadcrumb(modules, 'missing')).toEqual([]);
  });

  test('missing parent stops the walk and returns the resolved prefix', () => {
    const orphan: Chain[] = [
      { id: 'x', parent_module_id: 'gone', name: 'Orphan' },
    ];
    expect(moduleBreadcrumb(orphan, 'x')).toEqual(['Orphan']);
  });

  test('a parent cycle is bounded and does not loop forever', () => {
    const cyclic: Chain[] = [
      { id: 'a', parent_module_id: 'b', name: 'A' },
      { id: 'b', parent_module_id: 'a', name: 'B' },
    ];
    // Visited-set guard stops after each node is seen once; order is root→start.
    expect(moduleBreadcrumb(cyclic, 'a')).toEqual(['B', 'A']);
  });
});
