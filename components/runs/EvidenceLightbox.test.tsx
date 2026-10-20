import type { StepAttachment } from '@lib/runs/evidence-view';
import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { EvidenceLightbox } from './EvidenceLightbox';

// BK-593 - the full-size view, rendered on the server. Keyboard handling (Escape, arrows) lives
// in an effect and is NOT exercised here: no browser was run, so this is not live-UI evidence.

function att(id: string): StepAttachment {
  return {
    id,
    run_id: 'r1',
    run_step_id: 's1',
    filename: `${id}.png`,
    content_type: 'image/png',
    byte_size: 10 * 1024 * 1024,
    status: 'committed',
    created_by: 'me',
    created_at: '2026-10-19T10:00:00Z',
    committed_at: '2026-10-19T10:00:05Z',
  };
}

function render(openId: string) {
  return renderToStaticMarkup(
    <EvidenceLightbox attachments={[att('a1'), att('a2'), att('a3')]} openId={openId} onSelect={() => undefined} onClose={() => undefined} />,
  );
}

describe('EvidenceLightbox', () => {
  it('names the image, its size and its position, and shows it from the authorized route', () => {
    const html = render('a2');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Evidence image a2.png"');
    expect(html).toContain('10 MiB');
    expect(html).toContain('2 / 3');
    expect(html).toContain('src="/api/v1/runs/r1/steps/s1/attachments/a2/content"');
  });

  it('disables Previous on the first image and Next on the last', () => {
    const first = render('a1');
    expect(first.match(/aria-label="Previous image"[^>]*disabled=""/)).not.toBeNull();
    expect(first.match(/aria-label="Next image"[^>]*disabled=""/)).toBeNull();
    const last = render('a3');
    expect(last.match(/aria-label="Next image"[^>]*disabled=""/)).not.toBeNull();
  });

  it('renders nothing for an id that is no longer in the list (removed meanwhile)', () => {
    expect(render('gone')).toBe('');
  });
});
