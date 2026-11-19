import { describe, expect, it } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WelcomeBanner } from './WelcomeBanner';

// BK-2244: the greeting must wrap the longest accepted display name (80
// characters, no spaces) inside its card. Static markup only: no layout engine
// runs here, so this pins the wrapping class, not the rendered width.
const LONGEST_UNBROKEN_NAME = 'W'.repeat(80);

function renderGreeting(displayName: string | null): { classes: string[], text: string } {
  const html = renderToStaticMarkup(
    createElement(WelcomeBanner, { displayName, workspaceName: 'Acme QA', children: null }),
  );
  const match = /<h1 data-testid="home-welcome-greeting" class="([^"]*)">([^<]*)<\/h1>/.exec(html);
  if (match === null) {
    throw new Error(`home-welcome-greeting not rendered: ${html}`);
  }
  return { classes: match[1].split(/\s+/), text: match[2] };
}

describe('WelcomeBanner greeting (BK-2244)', () => {
  it('renders the full 80-character name with no spaces', () => {
    expect(renderGreeting(LONGEST_UNBROKEN_NAME).text).toBe(`Welcome back, ${LONGEST_UNBROKEN_NAME}.`);
  });

  it('breaks an unbroken word instead of overflowing, like the Settings Identity card', () => {
    expect(renderGreeting(LONGEST_UNBROKEN_NAME).classes).toContain('break-words');
  });
});
