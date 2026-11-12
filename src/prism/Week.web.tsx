import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { fromMin, iso, MO, nowMin, pad, WD, wdIndex } from '@/calendar/cal-date';
import { API_CAT_TO_CAT, createEventAsync, updateEvent } from '@/calendar/cal-store';
import { taskPlaced } from '@/calendar/tasks-store';
import { workFor, type Hours } from '@/calendar/hours';
import { allDayOn, planDay } from '@/calendar/layout';
import type { CalEvent, LaidBlock } from '@/calendar/types';

import { type CalLooks, lookOf } from './cal-look';
import { Popover, POP_H, type Pop, type Toast } from './Editor.web';

export type { Toast };

/** px per hour — matches `--hh` in prism.css. */
export const HH = 44;
const SNAP = 15;
/** side-by-side blocks before the rest fold into "+n more": two in a week, three in a single day */
const maxCols = (days: number) => (days === 1 ? 3 : 2);

type Kind = 'focus' | 'event' | 'task' | 'routine' | 'ai';
/** The five tile looks of the Prism grid. A break reads as a routine. */
export const cls = (ev: Pick<CalEvent, 'kind'>): Kind => (ev.kind === 'break' ? 'routine' : ev.kind);
export const LBL: Record<Kind, string> = { focus: 'Focus', event: 'Event', task: 'Task', routine: 'Routine', ai: 'Proposal' };
export const SW: Record<Kind, string> = {
  focus: 'var(--focus-sw)',
  event: 'var(--event-bd)',
  task: 'var(--task-bd)',
  routine: 'var(--routine-fg)',
  ai: 'var(--ai-bd)',
};

/** dataTransfer type a task row sets when it is dragged toward the grid */
export const TASK_DRAG = 'application/x-findtime-task';
/** A task on its way to the grid: dragged (desktop) or picked, then a tap on a time (touch, keyboard). */
export type TaskPick = { id: string; title: string; durationMin: number; category: string };
/** A placed task becomes one session this long; you can resize it after. */
const dropLen = (t: Pick<TaskPick, 'durationMin'>) => Math.min(t.durationMin || 60, 120);

/** Why a block can't be dragged here, or null. Same rules as the old grid. */
function lockOf(ev: CalEvent, cut: boolean): string | null {
  if (ev.imported && !ev.googleEditable) return 'From Google Calendar. Change it there.';
  if (cut) return 'Runs past your hours. Open it to change the time.';
  if (ev.endDate) return 'Spans midnight. Open it to change the time.';
  return null;
}

type Drag = {
  mode: 'move' | 'resize' | 'create';
  ev?: CalEvent;
  locked?: string | null;
  x0: number;
  y0: number;
  day0: number;
  s0: number;
  t0: number;
  day: number;
  s: number;
  t: number;
  moved: boolean;
};


const dayLabel = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number);
  const date = new Date(y, m - 1, dd);
  return `${WD[wdIndex(date)]} ${dd} ${MO[m - 1].slice(0, 3)}`;
};

export function Week({
  days,
  events,
  hours,
  loading,
  toast,
  looks,
  pick,
  onPick,
}: {
  days: Date[];
  events: CalEvent[];
  hours: Hours;
  loading: boolean;
  toast: Toast;
  /** calendar id → colour; Google events are drawn in their calendar's colour */
  looks?: CalLooks;
  /** a task picked in the list: the next tap on an empty time places it */
  pick?: TaskPick | null;
  onPick?: (t: TaskPick | null) => void;
}) {
  const ws = hours.start;
  const we = hours.end;
  const n = days.length;
  const isoDays = useMemo(() => days.map(iso), [days]);
  const wkKey = isoDays.join();
  const todayIso = iso(new Date());

  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** where a task dragged in from the list would land */
  const [over, setOver] = useState<{ di: number; s: number } | null>(null);
  /** the column a tap began in while a task is picked; it places on lift */
  const pickDown = useRef<number | null>(null);
  /** the ghost was moved with the keyboard: keep it in view */
  const kbd = useRef(false);
  const dragRef = useRef<Drag | null>(null);
  const [rawPop, setRawPop] = useState<Pop | null>(null);
  const wk = isoDays.join();
  // A popover belongs to the week it was opened on: changing week closes it.
  const pop = rawPop && rawPop.wk === wk ? rawPop : null;
  const setPop = (p: Pop | null) => setRawPop(p && { ...p, wk });
  const [now, setNow] = useState(nowMin());

  useEffect(() => {
    const t = setInterval(() => setNow(nowMin()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Open on the morning: an hour before now on this week, else the start of work.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = isoDays.includes(todayIso) ? Math.max(ws * 60, now - 90) : (hours.work[0]?.start ?? ws) * 60 - 30;
    // next frame: on first paint the grid may not have its full height yet
    const id = requestAnimationFrame(() => (el.scrollTop = Math.max(0, ((target - ws * 60) / 60) * HH)));
    return () => cancelAnimationFrame(id);
    // only when the week or window changes, not every minute
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wkKey, ws]);

  const plans = useMemo(() => isoDays.map((d) => planDay(events, d, ws, we, maxCols(n))), [events, isoDays, ws, we, n]);
  const allDay = useMemo(() => isoDays.map((d) => allDayOn(events, d)), [events, isoDays]);
  const anyAllDay = allDay.some((l) => l.length);
  /** a public holiday from a Google holiday calendar marks the whole day */
  const holidays = useMemo(() => allDay.map((l) => l.map((ev) => lookOf(ev, looks)).find((c) => c?.holiday) ?? null), [allDay, looks]);

  const y = (min: number) => ((min - ws * 60) / 60) * HH;

  /**
   * Where a popover opens, relative to `.grid` (where it lives): beside the
   * tile, and always inside the part of the grid you can see.
   */
  const anchor = (r: DOMRect) => {
    const g = grid.current!.getBoundingClientRect();
    const view = scroller.current!.getBoundingClientRect();
    let x = r.right - g.left + 6;
    if (x + 356 > g.width) x = Math.max(4, r.left - g.left - 356);
    const top = view.top - g.top + 56;
    const bottom = view.bottom - g.top - POP_H - 8;
    return { x, y: Math.max(top, Math.min(r.top - g.top, bottom)) };
  };

  /* ── pointer: move, resize, create ── */
  const colW = () => {
    const r = body.current!.getBoundingClientRect();
    return { left: r.left + 52, w: (r.width - 52) / n, top: r.top };
  };
  const toMinAt = (clientY: number) => {
    const { top } = colW();
    return Math.round(((clientY - top) / HH) * 60 / SNAP) * SNAP + ws * 60;
  };

  const isTask = (e: React.DragEvent) => e.dataTransfer.types.includes(TASK_DRAG);
  const slotAt = (clientY: number) => Math.min(we * 60 - SNAP, Math.max(ws * 60, Math.floor((toMinAt(clientY) - 7) / SNAP) * SNAP));
  const dropTask = (e: React.DragEvent, di: number) => {
    if (!isTask(e)) return;
    e.preventDefault();
    let t: TaskPick;
    try {
      t = JSON.parse(e.dataTransfer.getData(TASK_DRAG)) as TaskPick;
    } catch {
      setOver(null);
      return;
    }
    placeTask(t, di, slotAt(e.clientY));
  };

  /** One way onto the grid for a task, whether it was dropped or picked and tapped. */
  const placeTask = (t: TaskPick, di: number, s: number) => {
    setOver(null);
    onPick?.(null);
    const end = Math.min(we * 60, s + dropLen(t));
    createEventAsync({
      date: isoDays[di],
      start: fromMin(s),
      end: fromMin(end),
      title: t.title,
      cat: API_CAT_TO_CAT[t.category] ?? 'deep',
      kind: 'task',
      taskId: t.id,
    })
      .then(() => {
        taskPlaced(t.id);
        toast(`${t.title}: ${dayLabel(isoDays[di])}, ${fromMin(s)}–${fromMin(end)}`);
      })
      .catch(() => toast(`Couldn't put ${t.title} on the calendar. Try again.`));
  };

  // A picked task shows its ghost at once (touch has no hover): today at the next
  // quarter hour inside your hours, else the first working hour of the first day.
  const pickId = pick?.id;
  useEffect(() => {
    if (!pickId) {
      setOver(null);
      return;
    }
    const ti = isoDays.indexOf(todayIso);
    const di = ti >= 0 ? ti : 0;
    const w = workFor(hours, wdIndex(days[di]));
    const from = Math.max(ws * 60, (w?.start ?? ws) * 60, ti >= 0 ? Math.ceil(now / SNAP) * SNAP : 0);
    kbd.current = true;
    setOver({ di, s: Math.min(we * 60 - SNAP, from) });
    // only when a task is picked or the days on screen change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickId, wkKey]);

  // Keyboard: arrows move the ghost (15 min, a day), Enter places it. Esc is PrismApp's.
  useEffect(() => {
    if (!pick) return;
    const key = (e: KeyboardEvent) => {
      const el = e.target;
      if (el instanceof Element && el.closest('input, textarea, [contenteditable], [role="listbox"], [role="dialog"]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const o = over ?? { di: 0, s: ws * 60 };
      let next = o;
      if (e.key === 'ArrowUp') next = { ...o, s: Math.max(ws * 60, o.s - SNAP) };
      else if (e.key === 'ArrowDown') next = { ...o, s: Math.min(we * 60 - SNAP, o.s + SNAP) };
      else if (e.key === 'ArrowLeft') next = { ...o, di: Math.max(0, o.di - 1) };
      else if (e.key === 'ArrowRight') next = { ...o, di: Math.min(n - 1, o.di + 1) };
      else if (e.key === 'Enter') {
        // Enter on another control (Cancel, Today…) is that control's, not a placement
        if (el instanceof Element && el.closest('button, a') && !el.closest('.tk')) return;
        // also stops Enter from pressing the focused task row again (which would cancel the pick)
        e.preventDefault();
        placeTask(pick, o.di, o.s);
        return;
      } else return;
      e.preventDefault();
      kbd.current = true;
      setOver(next);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  });

  useEffect(() => {
    if (!kbd.current || !over) return;
    kbd.current = false;
    scroller.current?.querySelector('.ev.drop')?.scrollIntoView({ block: 'nearest' });
  }, [over]);

  const begin = (e: React.PointerEvent, d: Drag) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    // A mouse press must not focus the tile: focusing scrolls it fully into
    // view, which made the grid jump under the pointer. Keyboard focus still works.
    if (e.pointerType === 'mouse') e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // no live pointer (synthetic event): the drag still works inside the element
    }
    dragRef.current = d;
    setDrag(d);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = e.clientY - d.y0;
    const dx = e.clientX - d.x0;
    if (!d.moved && Math.abs(dy) < 4 && Math.abs(dx) < 4) return;
    const step = Math.round(((dy / HH) * 60) / SNAP) * SNAP;
    const next: Drag = { ...d, moved: true };
    if (d.mode === 'move') {
      if (d.locked) return;
      const { w } = colW();
      // a routine moves its time only: its date is the whole series
      const dd = d.ev?.rrule ? 0 : Math.round(dx / w);
      next.day = Math.min(n - 1, Math.max(0, d.day0 + dd));
      const len = d.t0 - d.s0;
      next.s = Math.min(we * 60 - len, Math.max(ws * 60, d.s0 + step));
      next.t = next.s + len;
    } else if (d.mode === 'resize') {
      if (d.locked) return;
      next.t = Math.min(we * 60, Math.max(d.s0 + SNAP, d.t0 + step));
    } else {
      const at = Math.min(we * 60, Math.max(ws * 60, toMinAt(e.clientY)));
      next.s = Math.min(d.s0, at);
      next.t = Math.max(d.s0 + SNAP, at === d.s0 ? d.s0 + 30 : Math.max(at, d.s0 + SNAP));
      if (at < d.s0) next.t = d.s0 + SNAP;
    }
    dragRef.current = next;
    setDrag(next);
  };

  const onUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    const target = e.target as HTMLElement;
    if (d.mode === 'create') {
      const s = d.s;
      const t = d.moved ? d.t : d.s + 30;
      const date = isoDays[d.day];
      const r = target.closest('.col')?.getBoundingClientRect();
      const g = grid.current!.getBoundingClientRect();
      const ry = colW().top + ((s - ws * 60) / 60) * HH;
      const fake = new DOMRect(r ? r.left : g.left, ry, r ? r.width : 0, HH);
      setPop({ type: 'draft', date, s, t, ...anchor(fake) });
      return;
    }
    const ev = d.ev!;
    if (!d.moved) {
      const el = target.closest('.ev') as HTMLElement | null;
      if (el) setPop({ type: 'event', ev, ...anchor(el.getBoundingClientRect()) });
      return;
    }
    if (d.locked) {
      toast(d.locked);
      return;
    }
    const before = { date: ev.date, start: ev.start, end: ev.end };
    const patch = { date: ev.rrule ? ev.date : isoDays[d.day], start: fromMin(d.s), end: fromMin(d.t) };
    if (patch.date === before.date && patch.start === before.start && patch.end === before.end) return;
    void updateEvent(ev.id, patch).then((ok) => {
      if (!ok) toast("Couldn't save that change. Check your connection and try again.");
      else toast(`${ev.title} moved to ${dayLabel(patch.date)} ${patch.start}`, () => void updateEvent(ev.id, before));
    });
  };

  /* ── drawing ── */
  const hrs = Array.from({ length: we - ws }, (_, i) => (
    <span key={i} style={{ top: i * HH }}>
      {i ? `${pad(ws + i)}:00` : ''}
    </span>
  ));

  const tile = (b: LaidBlock, di: number) => {
    const ev = b.ev;
    const live = drag && drag.ev?.id === ev.id && drag.moved && drag.mode !== 'create' && !drag.locked;
    if (live && drag.day !== di) return null;
    const s = live ? drag.s : b.s;
    const t = live ? drag.t : b.t;
    const k = cls(ev);
    const cal = k === 'event' ? lookOf(ev, looks) : null;
    const short = t - s <= 45;
    const past = isoDays[di] < todayIso || (isoDays[di] === todayIso && t <= now);
    const sel = pop?.type === 'event' && pop.ev.id === ev.id;
    const locked = lockOf(ev, b.cutTop || b.cutBottom);
    const times = `${fromMin(s)}–${fromMin(t)}`;
    return (
      <div
        key={`${ev.id}-${isoDays[di]}`}
        className={`ev ${cal ? 'gcal' : k}${short ? ' short' : ''}${past && !live ? ' past' : ''}${sel ? ' sel' : ''}${live ? ' dragging' : ''}`}
        style={{
          top: y(s) + 1,
          height: Math.max(14, ((t - s) / 60) * HH - 3),
          left: `calc(${(b.col / b.cols) * 100}% + 3px)`,
          width: `calc(${100 / b.cols}% - 6px)`,
          cursor: locked ? 'pointer' : live ? 'grabbing' : 'grab',
          ...(cal ? { ['--cc' as string]: cal.color } : {}),
        }}
        role="button"
        tabIndex={0}
        aria-label={`${cal ? cal.name : LBL[k]}: ${ev.title}, ${dayLabel(isoDays[di])}, ${times}`}
        title={locked ?? undefined}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setPop({ type: 'event', ev, ...anchor((e.currentTarget as HTMLElement).getBoundingClientRect()) });
          }
        }}
        onPointerDown={(e) =>
          begin(e, { mode: 'move', ev, locked, x0: e.clientX, y0: e.clientY, day0: di, s0: b.s, t0: b.t, day: di, s: b.s, t: b.t, moved: false })
        }
        onPointerMove={onMove}
        onPointerUp={onUp}>
        <b>{ev.title || '(no title)'}</b>
        <span>{short ? fromMin(s) : ev.kind === 'ai' ? `${times} · proposed` : times}</span>
        {!locked && !short && (
          <i
            className="rz"
            aria-hidden
            onPointerDown={(e) =>
              begin(e, { mode: 'resize', ev, locked, x0: e.clientX, y0: e.clientY, day0: di, s0: b.s, t0: b.t, day: di, s: b.s, t: b.t, moved: false })
            }
            onPointerMove={onMove}
            onPointerUp={onUp}
          />
        )}
      </div>
    );
  };

  // A block dragged into another day is drawn there.
  const ghostIn = (di: number) => {
    if (!drag || !drag.moved || drag.mode !== 'move' || drag.locked || drag.day === drag.day0 || drag.day !== di) return null;
    const plan = plans[drag.day0];
    const b = plan.blocks.find((x) => x.ev.id === drag.ev!.id);
    if (!b) return null;
    return tile({ ...b, col: 0, cols: 1 }, di);
  };

  const listAt = (title: string, items: CalEvent[]) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setPop({ type: 'list', title, items, ...anchor((e.currentTarget as HTMLElement).getBoundingClientRect()) });
  };

  const cols = isoDays.map((d, di) => {
    const plan = plans[di];
    const wd = wdIndex(days[di]);
    // a public holiday is a day off, like a day outside your working week
    const work = holidays[di] ? null : workFor(hours, wd);
    const creating = drag?.mode === 'create' && drag.day === di;
    const draft = pop?.type === 'draft' && pop.date === d ? pop : null;
    return (
      <div
        key={d}
        className={`col${!work ? ' we' : ''}${holidays[di] ? ' hol' : ''}`}
        style={holidays[di] ? { ['--cc' as string]: holidays[di]!.color } : undefined}
        onPointerDown={(e) => {
          // not on a tile, and never in the middle of another drag
          if (e.target !== e.currentTarget || dragRef.current) return;
          setPop(null);
          const s = slotAt(e.clientY);
          if (pick) {
            // a task is picked: this tap places it (on lift), it doesn't start a new block
            if (e.button !== 0) return;
            pickDown.current = di;
            setOver({ di, s });
            return;
          }
          begin(e, { mode: 'create', x0: e.clientX, y0: e.clientY, day0: di, s0: s, t0: s + 30, day: di, s, t: s + 30, moved: false });
        }}
        onPointerMove={(e) => {
          if (pick && !dragRef.current) {
            const s = slotAt(e.clientY);
            if (over?.di !== di || over.s !== s) setOver({ di, s });
          }
          onMove(e);
        }}
        onPointerUp={(e) => {
          if (pick && pickDown.current !== null) {
            const from = pickDown.current;
            pickDown.current = null;
            if (from === di) placeTask(pick, di, slotAt(e.clientY));
            return;
          }
          onUp(e);
        }}
        onPointerCancel={() => (pickDown.current = null)}
        onDragOver={(e) => {
          if (!isTask(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          const s = slotAt(e.clientY);
          if (over?.di !== di || over.s !== s) setOver({ di, s });
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
        }}
        onDrop={(e) => dropTask(e, di)}>
        {/* outside work hours: a faint tint. A day off stays plain — not a grey wall. */}
        {work && work.start > ws && <div className="off" style={{ top: 0, height: y(work.start * 60) }} />}
        {work && work.end < we && <div className="off" style={{ top: y(work.end * 60), bottom: 0 }} />}
        {d === todayIso && now >= ws * 60 && now < we * 60 && <div className="now" style={{ top: y(now) }} />}
        {plan.blocks.map((b) => tile(b, di))}
        {ghostIn(di)}
        {plan.overflow.map((o, i) => (
          <button
            key={`of${i}`}
            type="button"
            className="ev of short"
            style={{ top: y(o.s) + 1, height: 18, left: `calc(${(o.col / o.cols) * 100}% + 3px)`, width: `calc(${100 / o.cols}% - 6px)` }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={`${o.items.length} more at ${fromMin(o.s)}`}
            onClick={listAt(`${dayLabel(d)} · ${fromMin(o.s)}`, o.items)}>
            <b>+{o.items.length}</b>
          </button>
        ))}
        {over?.di === di && (
          <div
            className="ev task drop"
            style={{ top: y(over.s) + 1, height: ((pick ? Math.min(we * 60 - over.s, dropLen(pick)) : 60) / 60) * HH - 3, left: 3, right: 3, pointerEvents: 'none' }}>
            <b>{pick ? pick.title : 'Drop to put it here'}</b>
            <span>{pick ? `${fromMin(over.s)}–${fromMin(Math.min(we * 60, over.s + dropLen(pick)))}` : fromMin(over.s)}</span>
          </div>
        )}
        {(creating || draft) && (
          <div
            className="ev draft"
            style={{
              top: y(creating ? drag!.s : draft!.s) + 1,
              height: (((creating ? drag!.t : draft!.t) - (creating ? drag!.s : draft!.s)) / 60) * HH - 3,
              left: 3,
              right: 3,
              pointerEvents: 'none',
            }}>
            <b>New block</b>
            <span>
              {fromMin(creating ? drag!.s : draft!.s)}–{fromMin(creating ? (drag!.moved ? drag!.t : drag!.s + 30) : draft!.t)}
            </span>
          </div>
        )}
      </div>
    );
  });

  return (
    <div className="gw" ref={scroller} onKeyDown={(e) => e.key === 'Escape' && setPop(null)}>
      <div className="grid" ref={grid} style={{ ['--n' as string]: n }}>
        <div className="days">
          <div />
          {days.map((d, i) => {
            const outside = [...plans[i].before, ...plans[i].after];
            return (
              <div key={isoDays[i]} className={isoDays[i] === todayIso ? 'td' : undefined}>
                {WD[wdIndex(d)]} <b>{d.getDate()}</b>
                {holidays[i] && (
                  <span className="hol" style={{ ['--cc' as string]: holidays[i]!.color }}>
                    Holiday
                  </span>
                )}
                {outside.length > 0 && (
                  <button
                    type="button"
                    className="more"
                    title="Outside the hours shown"
                    onClick={listAt(`${dayLabel(isoDays[i])} · outside your hours`, outside)}>
                    +{outside.length}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {anyAllDay && (
          <div className="allday">
            <div className="lbl">all day</div>
            {allDay.map((list, i) => (
              <div key={isoDays[i]}>
                {list.map((ev) => {
                  const cal = lookOf(ev, looks);
                  return (
                  <button
                    type="button"
                    key={ev.id}
                    className={cal ? 'adv gcal' : 'adv'}
                    style={cal ? { ['--cc' as string]: cal.color } : undefined}
                    title={cal?.name}
                    onClick={(e) => setPop({ type: 'event', ev, ...anchor((e.currentTarget as HTMLElement).getBoundingClientRect()) })}>
                    {ev.title}
                  </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        <div className="body" ref={body} style={{ height: (we - ws) * HH }}>
          <div className="hrs">{hrs}</div>
          {cols}
        </div>
        {loading && events.length === 0 && <div className="loading">Loading your week…</div>}
        {pop && <Popover key={pop.type === 'event' ? `e${pop.ev.id}` : `${pop.type}${pop.x},${pop.y}`} pop={pop} events={events} looks={looks} onClose={() => setPop(null)} onOpen={(ev) => setPop({ ...pop, type: 'event', ev } as Pop)} toast={toast} />}
      </div>
    </div>
  );
}
