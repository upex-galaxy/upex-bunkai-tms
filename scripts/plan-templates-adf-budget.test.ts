import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { mdToAdf } from '../.agents/skills/acli/scripts/md-to-adf.ts';

// Jira Cloud caps a rich-text value at 32,767 characters of serialized ADF
// (acli/SKILL.md "Size budget"). An unfilled template body must leave most of
// that room to the plan's content, so it stays under half the cap.
const JIRA_RICH_TEXT_CAP = 32_767;
const SKELETON_CEILING = Math.floor(JIRA_RICH_TEXT_CAP / 2);

const REFERENCES = join(import.meta.dir, '..', '.agents', 'skills', 'sprint-development', 'references');
const START = '<!-- plan-body:start -->';
const END = '<!-- plan-body:end -->';

function planBody(file: string): string {
  const text = readFileSync(join(REFERENCES, file), 'utf8');
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`${file}: plan-body markers missing`);
  }
  if (text.includes(START, start + 1)) {
    throw new Error(`${file}: more than one plan-body block`);
  }
  return text.slice(start + START.length, end);
}

// Same count as `jq -c . plan.adf.json | wc -m` minus the trailing newline.
const adfSize = (markdown: string): number => [...JSON.stringify(mdToAdf(markdown))].length;

describe('implementation-plan templates fit the Jira ADF budget', () => {
  for (const file of ['feature-plan.md', 'story-plan.md']) {
    test(`${file} skeleton stays under half the rich-text cap`, () => {
      const body = planBody(file);
      expect(body).toContain('# ');
      expect(adfSize(body)).toBeLessThanOrEqual(SKELETON_CEILING);
    });
  }
});
