import { todayUtcIso } from '@lib/milestones/validation';

// BK-205 — the days-remaining chip vocabulary. Ratified by the AI Product
// Owner (BK-205 comment) as a closed, fully-decided set — no part of it is
// invented at build time:
//   * `target_date === today`           -> "Due today" (the mockup's own
//     string — `milestones-board.html`'s `timeChip()` returns this verbatim
//     for `d === 0`, so Critical Rule #15 fidelity is satisfied by not
//     deviating).
//   * `target_date` in the future       -> "N day(s) left" (the mockup's own
//     string/pluralization).
//   * `target_date` in the past         -> "N day(s) past target" — a
//     DELIBERATE DEPARTURE from the mockup's "Overdue by N days" (recorded in
//     §5 D25 of the master design plan). "Overdue" asserts the milestone was
//     not met, and per the domain glossary a Milestone is overdue only when
//     its target date passes UNMET (readiness below 100%) — a predicate this
//     story cannot evaluate (no attached plans exist yet; that arrives with
//     BK-206). "N days past target" states only what this story knows.
//     Styling stays NEUTRAL in every row (the 2026-07-24 Three Amigos design
//     decision), never the mockup's urgency/overdue color treatment.

export type CountdownTone = 'ontrack' | 'neutral-past';

export interface Countdown {
  label: string
  tone: CountdownTone
  daysFromToday: number
}

// `target_date` is a plain `date` (no time component) rendered as
// `YYYY-MM-DD` by Postgres/PostgREST — comparing the two ISO date strings
// directly (both server UTC) avoids any `Date` timezone parsing pitfall.
export function computeCountdown(targetDateIso: string, todayIso: string = todayUtcIso()): Countdown {
  const days = daysBetween(todayIso, targetDateIso);

  if (days === 0) {
    return { label: 'Due today', tone: 'ontrack', daysFromToday: 0 };
  }
  if (days > 0) {
    return { label: `${days} ${days === 1 ? 'day' : 'days'} left`, tone: 'ontrack', daysFromToday: days };
  }
  const past = Math.abs(days);
  return { label: `${past} ${past === 1 ? 'day' : 'days'} past target`, tone: 'neutral-past', daysFromToday: days };
}

function daysBetween(fromIso: string, toIso: string): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / MS_PER_DAY);
}
