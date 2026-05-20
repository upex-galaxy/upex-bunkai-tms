import type { AtcAssertion, AtcStep } from '@lib/types';

// Lightweight parsers for the editor's authoring format. Both formats are
// chosen for paste-friendly authoring: markdown numbered list for steps,
// YAML-ish bullet list for assertions. Neither needs a full parser — every
// edge case beyond what's encoded here should fall back to "treat the line
// as raw content" so the user never loses their work.
//
// We match prefixes only and slice the remainder with `String.prototype.slice`
// rather than capturing the trailing content inside the regex. Capturing the
// tail with `(.*)$` after a variable-length `\s*` triggers the ESLint
// `regexp/no-super-linear-backtracking` rule because `.` overlaps with `\s`.

const STEP_PREFIX = /^\s*\d+\.\s?/;
const INPUT_PREFIX = /^\s+input:\s?/;
const EXPECTED_PREFIX = /^\s+expected:\s?/;
const BULLET_PREFIX = /^\s*-\s?/;

export interface ParsedStep {
  content: string
  input_data: string | null
  expected: string | null
}

export function parseStepsMarkdown(input: string): ParsedStep[] {
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  const steps: ParsedStep[] = [];
  let current: ParsedStep | null = null;

  for (const line of lines) {
    const stepMatch = STEP_PREFIX.exec(line);
    if (stepMatch) {
      if (current && current.content.trim().length > 0) {
        steps.push(current);
      }
      current = {
        content: line.slice(stepMatch[0].length).trim(),
        input_data: null,
        expected: null,
      };
      continue;
    }
    if (!current) { continue; }

    const inputMatch = INPUT_PREFIX.exec(line);
    if (inputMatch) {
      const value = line.slice(inputMatch[0].length).trim();
      current.input_data = value.length > 0 ? value : null;
      continue;
    }

    const expectedMatch = EXPECTED_PREFIX.exec(line);
    if (expectedMatch) {
      const value = line.slice(expectedMatch[0].length).trim();
      current.expected = value.length > 0 ? value : null;
      continue;
    }

    if (line.trim().length > 0) {
      current.content = `${current.content}\n${line.trim()}`;
    }
  }
  if (current && current.content.trim().length > 0) {
    steps.push(current);
  }
  return steps;
}

export interface ParsedAssertion {
  content: string
}

export function parseAssertionsYaml(input: string): ParsedAssertion[] {
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  const out: ParsedAssertion[] = [];
  for (const raw of lines) {
    const match = BULLET_PREFIX.exec(raw);
    if (!match) { continue; }
    const content = raw.slice(match[0].length).trim();
    if (content.length === 0) { continue; }
    out.push({ content });
  }
  return out;
}

// Round-trip helpers for the editor's initial state.

export function stepsToMarkdown(steps: AtcStep[]): string {
  if (steps.length === 0) { return '01. '; }
  return steps
    .map((s, i) => {
      const head = `${String(i + 1).padStart(2, '0')}. ${s.content}`;
      const input = s.input_data ? `\n    input: ${s.input_data}` : '';
      const expected = s.expected ? `\n    expected: ${s.expected}` : '';
      return `${head}${input}${expected}`;
    })
    .join('\n\n');
}

export function assertionsToYaml(assertions: AtcAssertion[]): string {
  if (assertions.length === 0) { return '- '; }
  return assertions.map(a => `- ${a.content}`).join('\n');
}
