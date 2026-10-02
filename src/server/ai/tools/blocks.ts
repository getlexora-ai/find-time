import { STEP } from '@/lib/agent-tools';
import { IMPORTED_ORIGIN } from '@/lib/synced-fields';
import { createEvent, deleteEvent } from '@/server/events-repo';
import { dayWindowFor, durationOptions, missingInfo, questionFor, whenOptions } from '../clarify';
import { rankFreeSlots, selectSlots } from '../find-time';
import { ambiguousTime, checkPlaceAt, clashNote, freeNear, overlapList, overlapping } from '../place-at';
import { adjustDuration, effectiveBuffer } from '../preferences';
import { saveProposals } from '../repo';
import { ZERO_FEATURES } from '../scoring';
import { checkTimeOff, splitByDay } from '../time-off';
import { categoryOr, doneLabel, laterOf, plural, toChatProposal, type ToolHandler } from './context';
import { TOOL_DELETE, asISO, asString, clampInt } from './names';

/** Blocks on the calendar: find time, put it at a named time, take time off, delete. */

/** "2h of deep work Thursday": the scorer picks the slots inside the bounds read. */
export const propose: ToolHandler = async (args, ctx) => {
  const { busy, profile, now, nowISO, horizonISO, step, begin } = ctx;
  const category = asString(args.category, 'deep-work');
  const said = asString(args.reply);

  // A day or length that had to be guessed is asked for instead (clarify.ts).
  const missing = missingInfo(args);
  if (missing) {
    const options =
      missing === 'duration'
        ? durationOptions(category)
        : whenOptions({
            busy,
            profile,
            category,
            durationMin: clampInt(args.durationMin, 15, 480, 60),
            nowMs: now.getTime(),
            horizonMs: Date.parse(horizonISO),
          });
    const question = { text: questionFor(missing, asString(args.title, ''), options.length > 0), options };
    step({ tool: STEP.ask, label: missing === 'duration' ? 'Needs a length first' : 'Needs a day first', detail: 'I never guess a time' });
    return { kind: 'question', question, reply: question.text };
  }

  const title = asString(args.title, 'Focus block');
  const count = clampInt(args.count, 1, 5, 1);
  // The user's own estimate, corrected by how long this category actually takes them.
  const askedMin = clampInt(args.durationMin, 15, 480, 60);
  const durationMin = adjustDuration(profile, category, askedMin);

  const win = dayWindowFor(profile, category);
  // Personal time lives in evenings and weekends; work stays on weekdays unless invited.
  const skipWeekends = category === 'personal' ? args.weekdaysOnly === true : args.weekdaysOnly !== false;
  const earliestISO = laterOf(asISO(args.earliestISO) ?? nowISO, nowISO);
  const asked = asISO(args.latestISO) ?? horizonISO;
  let latestISO = Date.parse(asked) > Date.parse(horizonISO) ? horizonISO : asked;
  if (Date.parse(latestISO) <= Date.parse(earliestISO)) latestISO = horizonISO;

  begin(STEP.rank);
  const rankT0 = Date.now();
  // "Not Friday": days ruled out for this request only.
  const excluded = new Set(
    Array.isArray(args.excludeDates) ? args.excludeDates.filter((d): d is string => typeof d === 'string') : [],
  );
  const ranked = rankFreeSlots(
    busy,
    {
      durationMin,
      count,
      earliestISO,
      latestISO,
      dayStartHour: clampInt(args.dayStartHour, 0, 23, win.start),
      dayEndHour: clampInt(args.dayEndHour, 1, 24, win.end),
      bufferMin: effectiveBuffer(profile),
      skipWeekends,
      category,
    },
    profile,
  ).filter((r) => !excluded.has(r.startISO.slice(0, 10)));

  const { chosen, alternatives } = selectSlots(ranked, {
    count,
    maxPerDay: args.oneBlockPerDay !== false ? 1 : undefined,
    bufferMin: effectiveBuffer(profile),
    alternatives: 2,
    strategy: 'top',
  });
  step({
    tool: STEP.rank,
    label: doneLabel(STEP.rank, 'Scored free slots'),
    detail: `${plural(ranked.length, 'candidate')} · ${durationMin} min · picked ${chosen.length}`,
    ms: Date.now() - rankT0,
  });

  if (chosen.length === 0) {
    return {
      reply:
        said ||
        `I couldn't find a free ${durationMin}-minute slot that fits before ${latestISO.slice(0, 10)}. Want me to try a shorter block or a wider window?`,
    };
  }

  // Saved before replying: a proposal the client can't report an outcome against can't be learned from.
  let stored;
  try {
    stored = await saveProposals(
      ctx.userId,
      ctx.sessionId,
      { startISO: earliestISO, endISO: latestISO },
      chosen.map((c) => ({
        title,
        category,
        startISO: c.startISO,
        endISO: c.endISO,
        score: c.score,
        features: c.features,
        reason: c.reason,
        alternatives: alternatives.map((a) => ({ startISO: a.startISO, endISO: a.endISO, score: a.score, features: a.features })),
      })),
    );
  } catch (err) {
    console.error('ai/chat saveProposals', err);
    return { fail: 'Could not save that plan. Try again.' };
  }
  return {
    kind: 'plan',
    proposals: stored.map((p) => toChatProposal(p, true)),
    reply:
      said ||
      (durationMin !== askedMin
        ? `I've found room — I stretched these to ${durationMin} minutes because ${category.replace('-', ' ')} usually runs over for you.`
        : `Here's what I found.`),
  };
};

/** "Gym Friday 18:00 for 1h": the user's own time, checked, never moved. */
export const placeAt: ToolHandler = async (args, ctx) => {
  const { busy, shown, profile, nowISO, horizonISO, step } = ctx;
  const title = asString(args.title, 'Block').slice(0, 120);
  const category = categoryOr(asString(args.category, 'personal'), 'personal');
  const checked = checkPlaceAt(args.startISO, args.endISO, nowISO, horizonISO);

  // "gym at 6" — never placed on a guess between 06:00 and 18:00.
  const ampm = ambiguousTime(ctx.text);
  if (ampm) {
    const question = { text: `Did you mean ${ampm.pm} or ${ampm.am}?`, options: [ampm.pm, ampm.am] };
    return { kind: 'question', question, reply: question.text };
  }
  if (!checked.ok) return { reply: checked.reason };

  // Anything you can see at that time — free, flexible or ours, not only what
  // blocks time — is asked about before the block goes on top of it.
  const hits = args.overlapOk === true ? [] : overlapping(shown, checked.span);
  if (hits.length) {
    const win = dayWindowFor(profile, category);
    const question = {
      text: `${checked.span.startISO.slice(11, 16)} overlaps ${overlapList(hits)}. Put ${title} there anyway?`,
      options: ['Yes, put it there', ...freeNear(shown, checked.span, nowISO, win.start, win.end)],
    };
    step({ tool: STEP.check, label: doneLabel(STEP.check, 'Checked that time'), detail: `it overlaps ${hits.length === 1 ? 'something' : `${hits.length} things`} · asked first` });
    return { kind: 'question', question, reply: question.text, clashAsked: true };
  }

  // Not a scorer pick: no features, no runners-up. The card and feedback path are the same.
  const clash = clashNote(busy, checked.span);
  step({ tool: STEP.check, label: doneLabel(STEP.check, 'Checked that time'), detail: clash ? 'it overlaps something' : 'it is free' });
  try {
    const stored = await saveProposals(ctx.userId, ctx.sessionId, checked.span, [
      { title, category, ...checked.span, score: 0, features: ZERO_FEATURES, reason: clash ?? "it's the time you asked for", alternatives: [] },
    ]);
    return { kind: 'plan', proposals: stored.map((p) => toChatProposal(p)), reply: asString(args.reply) || 'Here it is.' };
  } catch (err) {
    console.error('ai/chat placeAt', err);
    return { fail: 'Could not save that plan. Try again.' };
  }
};

/** "Vacation next week": fixed, manual away blocks, one per day — all or nothing. */
export const timeOff: ToolHandler = async (args, ctx) => {
  const title = asString(args.title, 'Away').slice(0, 120) || 'Away';
  const checked = checkTimeOff(args.startISO, args.endISO, ctx.nowISO);
  // Asked back rather than guessed around: a wrong stretch blocked quietly is worse.
  if (!checked.ok) return { reply: checked.reason };

  const created: string[] = [];
  try {
    for (const day of splitByDay(checked.span)) {
      const ev = await createEvent(ctx.userId, {
        title,
        start: day.startISO,
        end: day.endISO,
        category: 'other',
        // Its own kind (db/020), so planning can say "you're away" rather than "something is booked".
        itemType: 'away',
        flexibility: 'fixed',
        origin: 'manual',
      });
      created.push(ev.id);
    }
  } catch (err) {
    console.error('ai/chat timeOff', err);
    // Half a vacation on the calendar would read as the whole one saved.
    await Promise.all(created.map((id) => deleteEvent(ctx.userId, id).catch(() => false)));
    return { reply: "I couldn't block that time just now, so nothing was added. Try telling me again in a moment." };
  }
  ctx.step({ tool: STEP.block, label: doneLabel(STEP.block, 'Blocked the time'), detail: plural(created.length, 'day') });
  return {
    timeOff: { title, startISO: checked.span.startISO, endISO: checked.span.endISO, days: created.length },
    reply: asString(args.reply) || `Blocked — ${title}.`,
  };
};

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * "Delete the gym blocks": lists Find Time's own matches and asks; deletes only
 * on the yes (`confirm`), with ids from this conversation's stored draft —
 * never from the client.
 */
export const deleteBlocks: ToolHandler = async (args, ctx) => {
  const { userId, events, now, horizonISO, step } = ctx;

  if (args.confirm === true) {
    const ids = Array.isArray(args.ids) ? args.ids.filter((x): x is string => typeof x === 'string') : [];
    let n = 0;
    for (const id of ids) if (await deleteEvent(userId, id).catch(() => false)) n++;
    step({ tool: TOOL_DELETE, label: 'Deleted blocks', detail: `${n} of ${ids.length}` });
    return {
      deleted: { count: n },
      reply:
        n === ids.length
          ? `Deleted ${plural(n, 'block')}.`
          : n > 0
            ? `Deleted ${n} of ${ids.length} — the rest were already gone.`
            : 'Those blocks were already gone, so nothing was deleted.',
    };
  }

  const lo = typeof args.earliestISO === 'string' ? Date.parse(args.earliestISO) : now.getTime();
  const hi = typeof args.latestISO === 'string' ? Date.parse(args.latestISO) : Date.parse(horizonISO);
  const match = asString(args.match).toLowerCase();
  // Filler words are already gone ("travel to work" → "travel work"), so match word by word.
  const words = match.split(' ').filter(Boolean);
  const hits = events.filter(
    (e) =>
      Date.parse(e.start) < hi &&
      Date.parse(e.end) > Math.max(lo, now.getTime()) &&
      words.every((w) => e.title.toLowerCase().includes(w)),
  );
  // Google's events come back on the next sync, so only Find Time's own blocks are offered.
  const own = hits.filter((e) => e.origin !== IMPORTED_ORIGIN);
  const fromGoogle = hits.length - own.length;
  const what = match ? `"${match}"` : 'blocks';
  const one = fromGoogle === 1;
  const googleNote = fromGoogle
    ? ` ${fromGoogle} more ${one ? 'is' : 'are'} from Google Calendar — delete ${one ? 'it' : 'them'} there, or the next sync brings ${one ? 'it' : 'them'} back.`
    : '';
  step({ tool: TOOL_DELETE, label: 'Found matching blocks', detail: `${own.length} yours · ${fromGoogle} from Google` });
  if (own.length === 0) {
    return { reply: fromGoogle ? `Nothing of Find Time's to delete for ${what}.${googleNote}` : `I couldn't find any ${what} to delete in that time.` };
  }

  const when = (at: string) => {
    const d = new Date(at);
    return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${at.slice(11, 16)}`;
  };
  const list = own
    .slice(0, 6)
    .map((e) => `${e.title} (${when(e.start)}${e.rrule ? ', repeating' : ''})`)
    .join(', ');
  const more = own.length > 6 ? ` and ${own.length - 6} more` : '';
  const question = { text: `Delete ${plural(own.length, 'block')}: ${list}${more}?${googleNote}`, options: ['Delete them', 'Keep them'] };
  return { kind: 'question', question, reply: question.text, pendingDeleteIds: own.map((e) => e.id) };
};
