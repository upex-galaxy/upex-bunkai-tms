import { describe, expect, test } from 'bun:test';
import { deriveRunMode, executorsForMode, resolveModeFilter } from './run-mode';

describe('deriveRunMode', () => {
  test('human is Manual', () => {
    expect(deriveRunMode('human')).toBe('manual');
  });
  test('agent and ci are Automated', () => {
    expect(deriveRunMode('agent')).toBe('automated');
    expect(deriveRunMode('ci')).toBe('automated');
  });
});

describe('resolveModeFilter', () => {
  test('no executor selected is All', () => {
    expect(resolveModeFilter([])).toBe('all');
  });
  test('human only is Manual', () => {
    expect(resolveModeFilter(['human'])).toBe('manual');
  });
  test('agent + ci in any order is Automated', () => {
    expect(resolveModeFilter(['agent', 'ci'])).toBe('automated');
    expect(resolveModeFilter(['ci', 'agent'])).toBe('automated');
  });
  test('selections matching no preset are Custom', () => {
    expect(resolveModeFilter(['agent'])).toBe('custom');
    expect(resolveModeFilter(['ci'])).toBe('custom');
    expect(resolveModeFilter(['human', 'ci'])).toBe('custom');
    expect(resolveModeFilter(['human', 'agent', 'ci'])).toBe('custom');
  });
});

describe('executorsForMode', () => {
  test('round-trips with resolveModeFilter', () => {
    for (const mode of ['all', 'manual', 'automated'] as const) {
      expect(resolveModeFilter(executorsForMode(mode))).toBe(mode);
    }
  });
});
