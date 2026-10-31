import { describeClaim } from './learn.ts';
import { activeLearned, type AgentProfile, type HardRule, type LearnedKind, type LearnedPref } from './preferences.ts';

/**
 * Does something the user just said disagree with what's already saved? Saved
 * items have a kind, a scope and hours, so this is exact and lives in code; the
 * model only passes the question on. A contradiction is asked about, never
 * averaged away and never overwritten silently.
 *
 * Pure: no DB, no model. contradictions.check.mjs runs it directly.
 */

export type NewRule = { type: 'rule'; kind: string; day?: string; start?: number; end?: number; minutes?: number; label: string };
export type NewPreference = { type: 'preference'; kind: LearnedKind; scope: string; value: Record<string, number>; label: string };
export type NewItem = NewRule | NewPreference;

/** What the new item disagrees with, and what replacing the old one removes. */
export type Conflict = { old: string[]; ruleIds: string[]; prefIds: string[] };

type Hours = { start: number; end: number };

const overlap = (a: Hours, b: Hours) => a.start < b.end && b.start < a.end;
/** "Calls in the morning" next to "nothing before 10" still leaves 10–12: only hours fully forbidden contradict. */
const inside = (a: Hours, b: Hours) => a.start >= b.start && a.end <= b.end;
const num = (v: unknown) => (typeof v === 'number' ? v : undefined);

function ruleHours(r: HardRule): Hours | null {
  const start = num(r.rule.start);
  const end = num(r.rule.end);
  return start === undefined || end === undefined ? null : { start, end };
}

const prefHours = (p: Pick<LearnedPref, 'value'>): Hours => ({ start: p.value.hourStart, end: p.value.hourEnd });

/** Two scopes speak about the same work: the same category, or one of them about all work. */
const sameScope = (a: string, b: string) => a === b || a === '*' || b === '*';

/** One value per day, so a second one with other numbers replaces the first rather than joining it. */
const SINGLE_VALUE = new Set(['work-hours', 'leave-by', 'buffer']);

function rulesAgainstRule(item: NewRule, rules: HardRule[]): HardRule[] {
  if (!SINGLE_VALUE.has(item.kind)) return [];
  return rules.filter((r) => {
    if (r.kind !== item.kind || (r.rule.day ?? undefined) !== item.day) return false;
    return num(r.rule.start) !== item.start || num(r.rule.end) !== item.end || num(r.rule.minutes) !== item.minutes;
  });
}

/** A preference for hours a rule fully forbids. A rule for one weekday doesn't contradict an every-day preference. */
function rulesAgainstPreference(item: NewPreference, rules: HardRule[]): HardRule[] {
  if (item.kind !== 'preferred-hours') return [];
  return rules.filter((r) => {
    const hours = ruleHours(r);
    return r.kind === 'protected' && !r.rule.day && hours !== null && inside(prefHours(item), hours);
  });
}

function prefsAgainstPreference(item: NewPreference, learned: LearnedPref[]): LearnedPref[] {
  return learned.filter((p) => {
    if (item.kind === 'preferred-weekday') return p.kind === 'avoid-weekday' && p.scope === item.scope;
    if (item.kind === 'avoid-weekday') return p.kind === 'preferred-weekday' && p.scope === item.scope;
    if (!sameScope(p.scope, item.scope)) return false;
    if (item.kind === 'preferred-hours' && p.kind === 'preferred-hours') return !overlap(prefHours(p), prefHours(item));
    const opposite = (item.kind === 'preferred-hours' && p.kind === 'avoid-hours') || (item.kind === 'avoid-hours' && p.kind === 'preferred-hours');
    return opposite && overlap(prefHours(p), prefHours(item));
  });
}

/** A new rule forbidding hours a saved preference asks for. */
function prefsAgainstRule(item: NewRule, learned: LearnedPref[]): LearnedPref[] {
  if (item.kind !== 'protected' || item.day || item.start === undefined || item.end === undefined) return [];
  const hours = { start: item.start, end: item.end };
  return learned.filter((p) => p.kind === 'preferred-hours' && inside(prefHours(p), hours));
}

export function findConflict(item: NewItem, profile: AgentProfile): Conflict | null {
  const learned = activeLearned(profile);
  const rules = item.type === 'rule' ? rulesAgainstRule(item, profile.rules) : rulesAgainstPreference(item, profile.rules);
  const prefs = item.type === 'rule' ? prefsAgainstRule(item, learned) : prefsAgainstPreference(item, learned);
  if (!rules.length && !prefs.length) return null;
  return {
    old: [...rules.map((r) => r.label), ...prefs.map((p) => describeClaim(p) ?? '').filter(Boolean)],
    ruleIds: rules.map((r) => r.id),
    prefIds: prefs.map((p) => p.id),
  };
}

const bare = (s: string) => s.trim().replace(/[.!]+$/, '');

/** The question for a conflict: both sides in the user's terms, and a choice. */
export function conflictQuestion(c: Conflict, label: string): { question: string; options: string[] } {
  return {
    question: `Before, I had: "${c.old.map(bare).join('; ')}". Now you said: "${bare(label)}". Which one should I keep?`,
    options: ['Use the new one', 'Keep the old one'],
  };
}
