import type { CalendarEvent, EventCategory } from './types';

/**
 * Local, deterministic planner used for the MVP so "Plan with AI" works fully
 * offline with zero configuration.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ LLM PLUG POINT                                                               │
 * │ Replace `parseRequest` with a call to a model (e.g. Claude) that returns the │
 * │ same PlanIntent shape, then keep `placeBlocks` as the deterministic          │
 * │ scheduler. The screen calls `generatePlan` and does not care which is used.  │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

export type PlanIntent = {
  title: string;
  category: EventCategory;
  durationMin: number;
  count: number;
  dayOffset: number;
  window: 'morning' | 'afternoon' | 'evening' | 'any';
};

export type PlanResult = {
  intent: PlanIntent;
  blocks: CalendarEvent[];
  rationale: string;
  notes: string[];
};

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 20;

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function parseDuration(text: string): number {
  const h = text.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/);
  if (h) return Math.round(parseFloat(h[1]) * 60);
  const m = text.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/);
  if (m) return parseInt(m[1], 10);
  return 60;
}

function parseCount(text: string): number {
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  const digit = text.match(/(\d+)\s*(?:x|sessions?|blocks?|slots?|times)\b/);
  if (digit) return Math.min(5, Math.max(1, parseInt(digit[1], 10)));
  for (const [w, n] of Object.entries(words)) {
    if (new RegExp(`\\b${w}\\s+(?:sessions?|blocks?|slots?)\\b`).test(text)) return n;
  }
  return 1;
}

function parseDayOffset(text: string): number {
  if (/\btomorrow\b/.test(text)) return 1;
  if (/\btoday\b/.test(text)) return 0;
  if (/\bday after tomorrow\b/.test(text)) return 2;
  const now = new Date();
  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (new RegExp(`\\b${WEEKDAYS[i]}\\b`).test(text)) {
      let diff = (i - now.getDay() + 7) % 7;
      if (diff === 0) diff = 7; // "on monday" said on a Monday means next Monday
      return diff;
    }
  }
  return 0;
}

function parseWindow(text: string): PlanIntent['window'] {
  if (/\bmorning\b/.test(text)) return 'morning';
  if (/\bafternoon\b/.test(text)) return 'afternoon';
  if (/\b(evening|tonight)\b/.test(text)) return 'evening';
  return 'any';
}

function parseCategory(text: string): EventCategory {
  if (/\b(meeting|call|sync|1:1|one on one|catch up)\b/.test(text)) return 'meeting';
  if (/\b(email|inbox|admin|expenses?|paperwork|errand)\b/.test(text)) return 'admin';
  if (/\b(gym|run|workout|lunch|break|family|personal)\b/.test(text)) return 'personal';
  return 'focus';
}

function parseTitle(text: string): string {
  const cleaned = text
    .replace(/\b(find|book|block|schedule|plan|get|need|want|please|me|some|a|an|for|of|time|slot|slots|session|sessions|block|blocks)\b/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/gi, ' ')
    .replace(/\b(today|tomorrow|morning|afternoon|evening|tonight|day after tomorrow)\b/gi, ' ')
    .replace(new RegExp(`\\b(${WEEKDAYS.join('|')})\\b`, 'gi'), ' ')
    .replace(/\b(on|this|next|the)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Focus block';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function parseRequest(raw: string): PlanIntent {
  const text = ` ${raw.toLowerCase().trim()} `;
  return {
    title: parseTitle(raw),
    category: parseCategory(text),
    durationMin: parseDuration(text),
    count: parseCount(text),
    dayOffset: parseDayOffset(text),
    window: parseWindow(text),
  };
}

function windowRange(window: PlanIntent['window']): [number, number] {
  switch (window) {
    case 'morning':
      return [DAY_START_HOUR, 12];
    case 'afternoon':
      return [12, 17];
    case 'evening':
      return [17, DAY_END_HOUR];
    default:
      return [DAY_START_HOUR, DAY_END_HOUR];
  }
}

function overlaps(startMs: number, endMs: number, events: CalendarEvent[]): boolean {
  return events.some((e) => {
    const s = new Date(e.start).getTime();
    const en = new Date(e.end).getTime();
    return startMs < en && endMs > s;
  });
}

/** Deterministic scheduler: walk the day in 15-minute steps, take the first free windows. */
export function placeBlocks(intent: PlanIntent, existing: CalendarEvent[]): CalendarEvent[] {
  const base = new Date();
  base.setDate(base.getDate() + intent.dayOffset);
  base.setHours(0, 0, 0, 0);

  const dayEvents = existing.filter((e) => {
    const d = new Date(e.start);
    return d.getFullYear() === base.getFullYear() && d.getMonth() === base.getMonth() && d.getDate() === base.getDate();
  });

  const [fromHour, toHour] = windowRange(intent.window);
  const earliest = new Date(base);
  earliest.setHours(fromHour, 0, 0, 0);
  // Don't propose blocks in the past.
  const now = Date.now();
  let cursor = Math.max(earliest.getTime(), intent.dayOffset === 0 ? Math.ceil(now / (15 * 60000)) * 15 * 60000 : earliest.getTime());
  const dayEnd = new Date(base);
  dayEnd.setHours(toHour, 0, 0, 0);

  const durMs = intent.durationMin * 60000;
  const step = 15 * 60000;
  const placed: CalendarEvent[] = [];

  while (placed.length < intent.count && cursor + durMs <= dayEnd.getTime()) {
    const conflictSet = [...dayEvents, ...placed];
    if (!overlaps(cursor, cursor + durMs, conflictSet)) {
      const n = placed.length + 1;
      placed.push({
        id: `plan_${base.getTime()}_${cursor}`,
        title: intent.count > 1 ? `${intent.title} (${n}/${intent.count})` : intent.title,
        start: new Date(cursor).toISOString(),
        end: new Date(cursor + durMs).toISOString(),
        category: intent.category,
        draft: true,
      });
      cursor += durMs + step; // leave a short buffer between blocks
    } else {
      cursor += step;
    }
  }

  return placed;
}

function humanDay(offset: number): string {
  if (offset === 0) return 'today';
  if (offset === 1) return 'tomorrow';
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString(undefined, { weekday: 'long' });
}

export function generatePlan(raw: string, existing: CalendarEvent[]): PlanResult {
  const intent = parseRequest(raw);
  const blocks = placeBlocks(intent, existing);
  const notes: string[] = [];

  if (blocks.length === 0) {
    notes.push(`No free ${intent.window === 'any' ? '' : intent.window + ' '}slot of ${intent.durationMin} min ${humanDay(intent.dayOffset)}. Try a shorter block or a different day.`);
  } else if (blocks.length < intent.count) {
    notes.push(`Only ${blocks.length} of ${intent.count} requested blocks fit ${humanDay(intent.dayOffset)}.`);
  }

  const rationale =
    blocks.length > 0
      ? `Placed ${blocks.length} × ${intent.durationMin}-min ${intent.category} ${blocks.length === 1 ? 'block' : 'blocks'} ${humanDay(intent.dayOffset)}${intent.window !== 'any' ? ` in the ${intent.window}` : ''}, working around your existing events.`
      : `Couldn't fit this request.`;

  return { intent, blocks, rationale, notes };
}
