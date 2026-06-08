import { sanitizeAtcAssertions, sanitizeAtcSteps } from '@lib/atcs/sanitize';
import { describe, expect, test } from 'bun:test';

describe('sanitizeAtcSteps', () => {
  test('strips a script block from step content', () => {
    const [step] = sanitizeAtcSteps([{ position: 1, content: 'do it <script>alert(1)</script> now' }]);
    expect(step.content).not.toContain('<script');
    expect(step.content).toBe('do it  now');
  });

  test('reduces a javascript: markdown link to its visible text', () => {
    const [step] = sanitizeAtcSteps([{ position: 1, content: 'click [here](javascript:alert(1))' }]);
    expect(step.content).toBe('click here');
  });

  test('leaves input_data and expected untouched (literal test data)', () => {
    const [step] = sanitizeAtcSteps([{ position: 1, content: 'ok', input_data: '<script>x</script>', expected: 'a < b' }]);
    expect(step.input_data).toBe('<script>x</script>');
    expect(step.expected).toBe('a < b');
  });

  test('preserves safe Markdown content byte-for-byte', () => {
    const [step] = sanitizeAtcSteps([{ position: 1, content: '**bold** and `code`' }]);
    expect(step.content).toBe('**bold** and `code`');
  });
});

describe('sanitizeAtcAssertions', () => {
  test('strips a script block from assertion content', () => {
    const [assertion] = sanitizeAtcAssertions([{ content: 'shown <script>evil()</script>' }]);
    expect(assertion.content).not.toContain('<script');
  });
});
