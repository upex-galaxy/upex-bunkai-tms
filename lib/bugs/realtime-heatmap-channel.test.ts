import { buildHeatmapChannelConfig, HEATMAP_REFETCH_MAX_WAIT_MS } from '@lib/bugs/realtime-heatmap-channel';
import { DEFAULT_REFETCH_DEBOUNCE_MS } from '@lib/runs/realtime-run-channel';
import { describe, expect, test } from 'bun:test';

// BK-718 / ADR-0010 — channel config shape only. The scheduler (including its
// maxWaitMs ceiling) and the reconnect predicate are covered by
// lib/runs/realtime-run-channel.test.ts.

describe('buildHeatmapChannelConfig', () => {
  test('binds INSERT on bugs, filtered to the Project on screen', () => {
    const config = buildHeatmapChannelConfig('project-1', 1);

    expect(config.bindings).toEqual([
      { event: 'INSERT', schema: 'public', table: 'bugs', filter: 'project_id=eq.project-1' },
    ]);
  });

  test('never binds UPDATE: assignment and status changes move no heatmap figure', () => {
    const config = buildHeatmapChannelConfig('project-1', 1);
    expect(config.bindings.every(binding => binding.event === 'INSERT')).toBe(true);
  });

  test('names the channel after the Project and the mount, so a remount never reuses a channel being torn down', () => {
    const first = buildHeatmapChannelConfig('project-1', 1);
    const second = buildHeatmapChannelConfig('project-1', 2);

    expect(first.channelName).toBe('bugs-heatmap-project-1-1');
    expect(second.channelName).not.toBe(first.channelName);
  });
});

describe('HEATMAP_REFETCH_MAX_WAIT_MS', () => {
  test('sits above the trailing debounce and well inside the 5-second bound', () => {
    expect(HEATMAP_REFETCH_MAX_WAIT_MS).toBeGreaterThan(DEFAULT_REFETCH_DEBOUNCE_MS);
    expect(HEATMAP_REFETCH_MAX_WAIT_MS).toBeLessThanOrEqual(2500);
  });
});
