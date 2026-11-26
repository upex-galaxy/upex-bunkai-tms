import type { AtcLibraryItem } from '@components/tests/AtcChainPicker';
import type { ExpandedTest } from '@components/tests/TestDetailView';
import { TEST_TITLE_MAX } from '@lib/tests/validation';

const COPY_PREFIX = 'Copy of ';

export const DUPLICATE_TAGS_NOT_SAVED_COPY = 'Test created, but its tags were not saved. Add them on this page.';

export function duplicateSourceId(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw.trim() === '') {
    return null;
  }
  return raw;
}

export function duplicateTestTitle(sourceTitle: string): string {
  const full = `${COPY_PREFIX}${sourceTitle.trim()}`;
  if ([...full].length <= TEST_TITLE_MAX) {
    return full;
  }
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  let cut = '';
  let length = 0;
  for (const { segment } of segmenter.segment(full)) {
    const size = [...segment].length;
    if (length + size > TEST_TITLE_MAX) {
      break;
    }
    cut += segment;
    length += size;
  }
  return cut.trimEnd();
}

export interface DuplicatePrefill {
  title: string
  chain: AtcLibraryItem[]
  tags: string[]
  archivedStepCount: number
}

export function duplicatePrefill(source: Pick<ExpandedTest, 'title' | 'tags' | 'atcs'>): DuplicatePrefill {
  const steps = [...source.atcs].sort((a, b) => a.position - b.position);
  const live = steps.filter(step => step.archived_at === null);
  return {
    title: duplicateTestTitle(source.title),
    chain: live.map(step => ({ id: step.id, slug: step.slug, title: step.title, layer: step.layer })),
    tags: [...(source.tags ?? [])],
    archivedStepCount: steps.length - live.length,
  };
}

export function archivedStepsNotice(count: number): string | null {
  if (count <= 0) {
    return null;
  }
  return count === 1
    ? '1 chain step was left out because its ATC is archived.'
    : `${count} chain steps were left out because their ATCs are archived.`;
}
