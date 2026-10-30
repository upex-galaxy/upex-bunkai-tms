import { describe, expect, test } from 'bun:test';

import { renderPage, scriptJson } from './page.ts';

function config(html: string): Record<string, unknown> {
  const m = /<script id="ui-config" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  expect(m).not.toBeNull();
  return JSON.parse(m![1]);
}

describe('renderPage', () => {
  test('one self-contained document: no placeholder left, no external script', () => {
    const html = renderPage({ mode: 'live', lang: 'es', token: 'tok' });
    expect(html).not.toContain('/*@@');
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="es">');
    expect(html).toContain('Content-Security-Policy');
  });

  test('the config carries the language table and the token, and no journal in live mode', () => {
    const c = config(renderPage({ mode: 'live', lang: 'en', token: 'tok-123' }));
    expect(c.token).toBe('tok-123');
    expect(c.lang).toBe('en');
    expect((c.S as Record<string, string>).stateRun).toBe('Running');
    expect((c.G as Record<string, unknown>).preflight).toBeDefined();
    expect(c.journal).toBeUndefined();
  });

  test('a saved page embeds the journal safely', () => {
    const html = renderPage({ mode: 'saved', lang: 'es', journal: [{ t: 'notice', level: 'info', text: '</script><script>alert(1)</script>', seq: 1, ts: 0 }] });
    expect(html).not.toContain('</script><script>alert(1)');
    const c = config(html);
    expect((c.journal as { text: string }[])[0].text).toBe('</script><script>alert(1)</script>');
    expect(c.note).toBe('saved');
  });

  test('scriptJson escapes < and the JavaScript line separators', () => {
    const out = scriptJson({ a: `<x>${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}` });
    expect(out).toBe('{"a":"\\u003cx>\\u2028\\u2029"}');
  });
});
