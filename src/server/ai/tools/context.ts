import type { ApiEvent, ChatMessage, ChatProposal, TraceStep } from '@/lib/api-types';
import { agentTool } from '@/lib/agent-tools';
import type { ApiHabit } from '@/server/habits-repo';
import type { ApiTask } from '@/server/tasks-repo';
import type { PlanTask } from '../plan-week';
import { CATEGORIES, type AgentProfile } from '../preferences';
import type { StoredProposal } from '../repo';

/**
 * What every tool handler gets (TurnCtx) and gives back (ToolResult). The turn
 * (turn.ts) loads the calendar once, calls one handler, then stores and sends
 * the reply. A handler never writes the reply message itself.
 */

export type Span = { start: string; end: string; title: string };

export type TurnCtx = {
  userId: string;
  sessionId: string;
  /** the user's sentence, as typed */
  text: string;
  /** what understand.ts read, for the trace */
  summary: string;
  /** wall-clock now in the user's zone */
  now: Date;
  nowISO: string;
  horizonISO: string;
  profile: AgentProfile;
  /** events in [now, horizon] */
  events: ApiEvent[];
  /** what blocks time (blocksTime) */
  busy: Span[];
  /** what a person would see at a time, busy or not */
  shown: Span[];
  openTasks: ApiTask[];
  habits: ApiHabit[];
  /** a step starts (streamed) */
  begin: (key: string) => void;
  /** a step finished (streamed, and kept on the reply as its trace) */
  step: (s: TraceStep) => void;
};

export type ToolResult = {
  /** omitted → the parsed `reply` argument */
  reply?: string;
  /** omitted → 'text' */
  kind?: 'text' | 'plan' | 'question';
  proposals?: ChatProposal[];
  question?: ChatMessage['question'];
  savedRule?: ChatMessage['savedRule'];
  timeOff?: ChatMessage['timeOff'];
  deleted?: ChatMessage['deleted'];
  changes?: ChatMessage['changes'];
  /** the blocks a delete question listed — kept server-side, deleted only on a yes */
  pendingDeleteIds?: string[];
  /** place_at asked "it overlaps X — put it there anyway?"; the next turn reads the answer */
  clashAsked?: boolean;
};

/** A turn that can't go on: the user sees `fail` as an error (HTTP 500). */
export type ToolFailure = { fail: string };

export type ToolHandler = (args: Record<string, unknown>, ctx: TurnCtx) => Promise<ToolResult | ToolFailure>;

// ── shared helpers ──────────────────────────────────────────────────────────

export const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, '.000Z');
export const laterOf = (a: string, b: string) => (Date.parse(a) > Date.parse(b) ? a : b);
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The step's own words from the UI registry, so a renamed tool renames everywhere. */
export const doneLabel = (key: string, fallback: string) => agentTool(key)?.label ?? fallback;
export const runningLabel = (key: string) => agentTool(key)?.running ?? 'Working';

export const hoursText = (min: number) => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h}h${String(min % 60).padStart(2, '0')}` : `${h}h`;
};

/** A category argument from the known list, else `dflt`. */
export const categoryOr = (v: unknown, dflt: string) =>
  typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v) ? v : dflt;

/** "2–3x a week, 1h, mornings" */
export function habitText(h: ApiHabit): string {
  const often = h.minPerWeek && h.minPerWeek < h.perWeek ? `${h.minPerWeek}–${h.perWeek}x a week` : `${h.perWeek}x a week`;
  return [often, hoursText(h.durationMin), h.preferredWindow ? `${h.preferredWindow}s` : ''].filter(Boolean).join(', ');
}

/** A stored task, as the planner sees it. */
export function toPlanTask(t: ApiTask): PlanTask {
  return {
    id: t.id,
    title: t.title,
    category: categoryOr(t.category, 'deep-work'),
    durationMin: t.durationMin,
    dueByISO: t.dueBy,
    preferByISO: t.preferBy,
    notBeforeISO: t.notBefore,
    priority: t.priority,
    effort: t.effort,
    preferredWindow: t.preferredWindow,
    splittable: t.splittable,
    minChunkMin: t.minChunkMin,
  };
}

/** A saved proposal as the chat card shows it. */
export function toChatProposal(p: StoredProposal, withAlternatives = false): ChatProposal {
  return {
    id: p.id,
    title: p.title,
    startISO: p.startISO,
    endISO: p.endISO,
    category: p.category,
    reason: p.reason,
    alternatives: withAlternatives ? p.alternatives.map((a) => ({ startISO: a.startISO, endISO: a.endISO })) : [],
    ...(p.taskId ? { taskId: p.taskId } : {}),
    ...(p.habitId ? { habitId: p.habitId } : {}),
  };
}
