import type { CalendarEvent } from "../types/event";
import type { SchedulerProfile } from "../types/user";
import type { Constraint } from "../types/ai";
import {
  bufferOverrideMinutes,
  computeFocusIntervals,
  computeWorkHourFreeIntervals,
  intersectWindow,
  protectedConstraintIntervals,
  subtractIntervals,
} from "./capacity";
import { enumerateSlotCandidates, type SlotCandidate } from "./slots";
import { scorePlacement } from "./score";
import { buildConflict } from "./conflicts";
import type { ExpandedItem, FreeInterval, ScheduleConflict, ScheduledBlock } from "./types";

const PRIORITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

export interface PlaceContext {
  calendar: CalendarEvent[];
  profile: SchedulerProfile;
  constraints: Constraint[];
  horizonStart: Date;
  horizonEnd: Date;
  now: Date;
  /** Blocks kept as-is from a previous plan (incremental re-plan) — they occupy capacity but are never moved or re-scored. */
  fixedBlocks: ScheduledBlock[];
}

export interface PlaceResult {
  blocks: ScheduledBlock[];
  conflicts: ScheduleConflict[];
}

/**
 * Most-constrained-first ordering: hard-deadline items before soft ones, earliest deadline
 * first among those, then higher priority, then earliest soft `preferBy` as a tiebreaker.
 */
function orderMostConstrainedFirst(items: ExpandedItem[]): ExpandedItem[] {
  return [...items].sort((a, b) => {
    const aHard = a.dueBy ? 0 : 1;
    const bHard = b.dueBy ? 0 : 1;
    if (aHard !== bHard) return aHard - bHard;
    if (a.dueBy && b.dueBy && a.dueBy.getTime() !== b.dueBy.getTime()) {
      return a.dueBy.getTime() - b.dueBy.getTime();
    }
    const priorityDelta = (PRIORITY_RANK[b.priority] ?? 1) - (PRIORITY_RANK[a.priority] ?? 1);
    if (priorityDelta !== 0) return priorityDelta;
    const aPref = a.preferBy?.getTime() ?? Infinity;
    const bPref = b.preferBy?.getTime() ?? Infinity;
    return aPref - bPref;
  });
}

function blockToBusy(block: ScheduledBlock): FreeInterval {
  return { start: new Date(block.start), end: new Date(block.end) };
}

function pickBestCandidate(
  candidates: SlotCandidate[],
  item: ExpandedItem,
  profile: SchedulerProfile,
  now: Date
): { candidate: SlotCandidate; score: number } | null {
  let best: { candidate: SlotCandidate; score: number } | null = null;
  for (const c of candidates) {
    const breakdown = scorePlacement(item, c.start, c.end, c.interval.start, c.interval.end, profile, now);
    if (!best || breakdown.total > best.score) {
      best = { candidate: c, score: breakdown.total };
    }
  }
  return best;
}

/** Try to place `item` as a single pack-only block within `freeIntervals`. Null if nothing fits. */
function trySingleBlock(
  item: ExpandedItem,
  freeIntervals: FreeInterval[],
  profile: SchedulerProfile,
  now: Date,
  displacedFocus: boolean
): ScheduledBlock | null {
  const candidates = enumerateSlotCandidates(freeIntervals, item.durationMin);
  const best = pickBestCandidate(candidates, item, profile, now);
  if (!best) return null;
  return {
    id: `${item.refId}__0`,
    refId: item.refId,
    taskId: item.taskId,
    title: item.title,
    start: best.candidate.start.toISOString(),
    end: best.candidate.end.toISOString(),
    chunkIndex: 0,
    chunkCount: 1,
    score: best.score,
    rationale: displacedFocus
      ? "Placed to meet a hard deadline; this displaces a protected focus window."
      : "Placed based on priority, preferred window and energy alignment.",
    displacedFocus,
    movable: true,
  };
}

/** Greedily split `item` across the largest available free intervals, each chunk honoring `minChunkMin`. Null if the full duration can't be covered that way. */
function trySplitBlocks(
  item: ExpandedItem,
  freeIntervals: FreeInterval[],
  profile: SchedulerProfile,
  now: Date
): ScheduledBlock[] | null {
  const bySize = [...freeIntervals]
    .map((interval) => ({ interval, minutes: (interval.end.getTime() - interval.start.getTime()) / 60_000 }))
    .filter((f) => f.minutes >= item.minChunkMin)
    .sort((a, b) => b.minutes - a.minutes);

  let remaining = item.durationMin;
  const plannedChunks: { interval: FreeInterval; minutes: number }[] = [];
  for (const { interval, minutes } of bySize) {
    if (remaining <= 0) break;
    let take = Math.min(remaining, minutes);
    if (take < item.minChunkMin) continue;
    // Don't strand a too-small leftover for the next interval: shrink this chunk so the
    // remainder is either 0 or big enough to still satisfy minChunkMin.
    const leftoverAfter = remaining - take;
    if (leftoverAfter > 0 && leftoverAfter < item.minChunkMin) {
      const shrunk = take - (item.minChunkMin - leftoverAfter);
      if (shrunk >= item.minChunkMin) take = shrunk;
    }
    plannedChunks.push({ interval, minutes: take });
    remaining -= take;
  }
  if (remaining > 0) return null;

  const blocks: ScheduledBlock[] = [];
  plannedChunks.forEach(({ interval, minutes }, idx) => {
    const candidates = enumerateSlotCandidates([interval], minutes);
    const best = pickBestCandidate(candidates, item, profile, now);
    if (!best) return;
    blocks.push({
      id: `${item.refId}__${idx}`,
      refId: item.refId,
      taskId: item.taskId,
      title: item.title,
      start: best.candidate.start.toISOString(),
      end: best.candidate.end.toISOString(),
      chunkIndex: idx,
      chunkCount: plannedChunks.length,
      score: best.score,
      rationale: `Split across ${plannedChunks.length} sessions (min ${item.minChunkMin} min each) to fit available capacity.`,
      displacedFocus: false,
      movable: true,
    });
  });
  return blocks.length === plannedChunks.length ? blocks : null;
}

/**
 * One level of backtracking: if a lower-constraint block placed earlier in *this run* can be
 * moved elsewhere, evict it, place `item` (which must carry a hard deadline — that's what earns
 * the right to bump another placement) in the freed capacity, then re-place the victim. Returns
 * the updated placement list, or null if no such swap frees enough room.
 */
function tryBacktrack(
  item: ExpandedItem,
  placed: ScheduledBlock[],
  ctx: PlaceContext,
  itemsByRefId: Map<string, ExpandedItem>,
  baseFree: FreeInterval[]
): ScheduledBlock[] | null {
  if (!item.dueBy) return null;

  const victims = placed.filter((b) => {
    const victimItem = itemsByRefId.get(b.refId);
    return b.movable && victimItem && !victimItem.dueBy && b.refId !== item.refId;
  });

  for (const victim of victims) {
    const without = placed.filter((b) => b !== victim);
    const freeWithoutVictim = subtractIntervals(baseFree, without.map(blockToBusy));
    const windowed = intersectWindow(freeWithoutVictim, ctx.horizonStart, item.dueBy);
    const candidate = trySingleBlock(item, windowed, ctx.profile, ctx.now, false);
    if (!candidate) continue;

    const victimItem = itemsByRefId.get(victim.refId)!;
    const freeForVictim = subtractIntervals(baseFree, without.map(blockToBusy).concat([blockToBusy(candidate)]));
    const victimWindowed = intersectWindow(freeForVictim, ctx.horizonStart, ctx.horizonEnd);
    const victimBlock = trySingleBlock(victimItem, victimWindowed, ctx.profile, ctx.now, false);
    if (!victimBlock) continue;

    return [...without, candidate, victimBlock];
  }
  return null;
}

/** The core placement loop: most-constrained-first, weighted scoring, backtracking, and a structured conflict for anything that still can't be placed. */
export function placeItems(items: ExpandedItem[], ctx: PlaceContext): PlaceResult {
  const ordered = orderMostConstrainedFirst(items);
  const itemsByRefId = new Map(ordered.map((i) => [i.refId, i] as const));
  const conflicts: ScheduleConflict[] = [];
  let placed: ScheduledBlock[] = [...ctx.fixedBlocks];

  const bufferMin = bufferOverrideMinutes(ctx.constraints, ctx.profile.defaultBufferMin);
  const protectedIntervals = protectedConstraintIntervals(ctx.constraints);
  const baseFree = computeWorkHourFreeIntervals(
    ctx.calendar,
    ctx.profile,
    ctx.horizonStart,
    ctx.horizonEnd,
    bufferMin,
    protectedIntervals
  );
  const focusIntervals = computeFocusIntervals(ctx.profile, ctx.horizonStart, ctx.horizonEnd);

  function currentFree(): FreeInterval[] {
    return subtractIntervals(baseFree, placed.map(blockToBusy));
  }

  for (const item of ordered) {
    const windowEnd = item.dueBy && item.dueBy.getTime() < ctx.horizonEnd.getTime() ? item.dueBy : ctx.horizonEnd;
    const free = intersectWindow(currentFree(), ctx.horizonStart, windowEnd);

    // Pass 1: focus windows are soft-protected — skip them unless this item actually wants focus time.
    const freeRespectingFocus = item.requiresFocus ? free : subtractIntervals(free, focusIntervals);

    let block = trySingleBlock(item, freeRespectingFocus, ctx.profile, ctx.now, false);

    if (!block && item.dueBy) {
      // Pass 2: a hard deadline may displace a soft focus window — but it must be recorded.
      const withFocus = trySingleBlock(item, free, ctx.profile, ctx.now, false);
      if (withFocus) {
        const overlapsFocus = focusIntervals.some(
          (f) =>
            new Date(withFocus.start).getTime() < f.end.getTime() &&
            new Date(withFocus.end).getTime() > f.start.getTime()
        );
        withFocus.displacedFocus = overlapsFocus;
        withFocus.rationale = overlapsFocus
          ? "Placed to meet a hard deadline; this displaces a protected focus window."
          : withFocus.rationale;
        block = withFocus;
      }
    }

    if (block) {
      placed.push(block);
      continue;
    }

    if (item.splittable) {
      const split = trySplitBlocks(item, freeRespectingFocus, ctx.profile, ctx.now);
      if (split) {
        placed.push(...split);
        continue;
      }
    }

    const backtracked = tryBacktrack(item, placed, ctx, itemsByRefId, baseFree);
    if (backtracked) {
      placed = backtracked;
      continue;
    }

    conflicts.push(
      buildConflict(
        item,
        item.dueBy
          ? "no free capacity before the deadline, even after considering focus-window overlap."
          : "no free capacity in the work-hours horizon without intruding on a protected focus window."
      )
    );
  }

  const fixedIds = new Set(ctx.fixedBlocks.map((b) => b.id));
  return { blocks: placed.filter((b) => !fixedIds.has(b.id)), conflicts };
}
