import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { fromMin, iso, MO, nowMin, pad, WD, wdIndex } from '@/calendar/cal-date';
import { updateEvent } from '@/calendar/cal-store';
import { workFor, type Hours } from '@/calendar/hours';
import { allDayOn, planDay } from '@/calendar/layout';
import type { CalEvent, LaidBlock } from '@/calendar/types';

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
  focus: 'var(--focus)',
  event: 'var(--event-bd)',
  task: 'var(--task-bd)',
  routine: 'var(--routine-fg)',
  ai: 'var(--ai-bd)',
};

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
}: {
  days: Date[];
  events: CalEvent[];
  hours: Hours;
  loading: boolean;
  toast: Toast;
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
    const short = t - s <= 45;
    const past = isoDays[di] < todayIso || (isoDays[di] === todayIso && t <= now);
    const sel = pop?.type === 'event' && pop.ev.id === ev.id;
    const locked = lockOf(ev, b.cutTop || b.cutBottom);
    const times = `${fromMin(s)}–${fromMin(t)}`;
    return (
      <div
        key={`${ev.id}-${isoDays[di]}`}
        className={`ev ${k}${short ? ' short' : ''}${past && !live ? ' past' : ''}${sel ? ' sel' : ''}${live ? ' dragging' : ''}`}
        style={{
          top: y(s) + 1,
          height: Math.max(14, ((t - s) / 60) * HH - 3),
          left: `calc(${(b.col / b.cols) * 100}% + 3px)`,
          width: `calc(${100 / b.cols}% - 6px)`,
          cursor: locked ? 'pointer' : live ? 'grabbing' : 'grab',
        }}
        role="button"
        tabIndex={0}
        aria-label={`${LBL[k]}: ${ev.title}, ${dayLabel(isoDays[di])}, ${times}`}
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
    const work = workFor(hours, wd);
    const creating = drag?.mode === 'create' && drag.day === di;
    const draft = pop?.type === 'draft' && pop.date === d ? pop : null;
    return (
      <div
        key={d}
        className={`col${wd > 4 ? ' we' : ''}`}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget) return;
          setPop(null);
          const s = Math.min(we * 60 - SNAP, Math.max(ws * 60, Math.floor((toMinAt(e.clientY) - 7) / SNAP) * SNAP));
          begin(e, { mode: 'create', x0: e.clientX, y0: e.clientY, day0: di, s0: s, t0: s + 30, day: di, s, t: s + 30, moved: false });
        }}
        onPointerMove={onMove}
        onPointerUp={onUp}>
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
            className="ev event short"
            style={{ top: y(o.s) + 1, height: 18, left: `calc(${(o.col / o.cols) * 100}% + 3px)`, width: `calc(${100 / o.cols}% - 6px)` }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={`${o.items.length} more at ${fromMin(o.s)}`}
            onClick={listAt(`${dayLabel(d)} · ${fromMin(o.s)}`, o.items)}>
            <b>+{o.items.length}</b>
          </button>
        ))}
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
                {list.map((ev) => (
                  <button
                    type="button"
                    key={ev.id}
                    className="adv"
                    onClick={(e) => setPop({ type: 'event', ev, ...anchor((e.currentTarget as HTMLElement).getBoundingClientRect()) })}>
                    {ev.title}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="body" ref={body} style={{ height: (we - ws) * HH }}>
          <div className="hrs">{hrs}</div>
          {cols}
        </div>
        {loading && events.length === 0 && <div className="loading">Loading your week…</div>}
        {pop && <Popover key={pop.type === 'event' ? `e${pop.ev.id}` : `${pop.type}${pop.x},${pop.y}`} pop={pop} events={events} onClose={() => setPop(null)} onOpen={(ev) => setPop({ ...pop, type: 'event', ev } as Pop)} toast={toast} />}
      </div>
    </div>
  );
}
