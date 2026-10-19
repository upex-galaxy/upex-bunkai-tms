import type { StepAttachment } from '@lib/runs/evidence-view';
import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { StepEvidence } from './StepEvidence';

// BK-593 - the step evidence panel, rendered on the server (the path its first paint takes).
// It pins which controls each role and Run state sees; the upload sequence is
// `evidence-upload.test.ts` and the rules are `evidence-view.test.ts`. No browser is involved,
// so this is NOT live-UI evidence (picking a file, the thumbnail and the lightbox were not run).

function att(id: string, overrides: Partial<StepAttachment> = {}): StepAttachment {
  return {
    id,
    run_id: 'r1',
    run_step_id: 's1',
    filename: `${id}.png`,
    content_type: 'image/png',
    byte_size: 2048,
    status: 'committed',
    created_by: 'me',
    created_at: '2026-10-19T10:00:00Z',
    committed_at: '2026-10-19T10:00:05Z',
    ...overrides,
  };
}

function render(props: Partial<Parameters<typeof StepEvidence>[0]> = {}) {
  return renderToStaticMarkup(
    <StepEvidence
      runId="r1"
      stepId="s1"
      runStatus="running"
      canAttach
      attachments={[]}
      onAdded={() => undefined}
      testSuffix="1-0"
      {...props}
    />,
  );
}

describe('StepEvidence', () => {
  it('offers Attach and the counter to a member on a running Run, on a step with no image yet', () => {
    const html = render();
    expect(html).toContain('data-testid="runner-step-attach-1-0"');
    expect(html).toContain('0 / 10');
    expect(html).toContain('accept="image/png,image/jpeg,image/webp"');
    expect(html).not.toContain('disabled=""');
  });

  it('renders nothing for a viewer with no image, and nothing on a closed Run with no image', () => {
    expect(render({ canAttach: false })).toBe('');
    expect(render({ runStatus: 'passed' })).toBe('');
  });

  it('shows committed images read-only to a viewer and on a closed Run: no Attach control', () => {
    for (const props of [{ canAttach: false }, { runStatus: 'aborted' as const }]) {
      const html = render({ ...props, attachments: [att('a1'), att('a2')] });
      expect(html).not.toContain('runner-step-attach-1-0');
      expect(html).toContain('a1.png');
      expect(html).toContain('/api/v1/runs/r1/steps/s1/attachments/a1/content');
    }
  });

  it('disables Attach at 10 images and says why', () => {
    const ten = Array.from({ length: 10 }, (_, i) => att(`a${i}`));
    const html = render({ attachments: ten });
    expect(html).toContain('10 / 10');
    expect(html).toContain('disabled=""');
    expect(html).toContain('This step already holds the maximum evidence (10 images or 50 MiB).');
  });
});
