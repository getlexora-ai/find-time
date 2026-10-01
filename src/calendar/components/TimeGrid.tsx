import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  PanResponder,
  type PanResponderCallbacks,
  type PanResponderGestureState,
  type PanResponderInstance,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import { allEvents, SAVE_FAILED, updateEvent } from '../cal-store';
import { fromMin, iso, nowMin, pad, sameDay, today, WD, wdIndex } from '../cal-date';
import { useHours, workFor } from '../hours';
import { paint } from '../kinds';
import {
  allDayOn,
  bodyH,
  gutterHours,
  minToY,
  planDay,
  snapMin,
} from '../layout';
import type { CalActions, PointAnchor } from '../state';
import {
  CLICK_DUR,
  DRAG_SLOP,
  GUTTER,
  GUTTER_PHONE,
  MAX_COLS,
  MIN_TILE_W,
  MIN_DUR,
  N,
  R,
  ROW,
  SANS,
  SHADOW,
  SNAP,
} from '../tokens';
import type { CalEvent, LaidBlock } from '../types';
import { Press, Txt } from '../ui';
import { useResponsive } from '../useResponsive';
import { EventBlock } from './EventBlock';

/**
 * The time grid (docs/calendar-spec.md §2, §5, §7, §8).
 *
 * It draws exactly your hours (e.g. 06–22) every week — the same height no
 * matter what is on it. Inside, working hours are white and everything else is
 * a faint wash. Events wholly outside your hours are a "+n" in that day's
 * header; events that run past an edge are clipped and say so.
 *
 * It owns every gesture on the calendar, so one place decides what a press, a
 * drag and a resize mean:
 *
 *   empty space   click → quick-create (30 min) · drag → draw a block
 *   tile body     click → detail · drag → move (time, and day in week view)
 *   tile edges    drag → resize start / end
 *   Esc           cancels any drag in progress
 *
 * Everything snaps to 15 minutes and stays inside your hours. On a phone a
 * drag starts with a long-press, so a plain swipe still scrolls.
 */

type Gesture =
  | {
      kind: 'create';
      col: number;
      /** minute the press landed on, and the minute under the pointer now */
      a: number;
      b: number;
      moved: boolean;
      anchor: PointAnchor;
    }
  | {
      kind: 'move' | 'start' | 'end';
      ev: CalEvent;
      col: number;
      s0: number;
      t0: number;
      dMin: number;
      dCol: number;
      moved: boolean;
      anchor: PointAnchor;
      /** why the drag is not doing what the pointer asks, shown on the tile */
      hint: string | null;
      /** the tile cannot be moved at all (imported, clipped, overnight) */
      locked: boolean;
    };

const isWeb = Platform.OS === 'web';

/**
 * Live gesture bookkeeping, read by the responders' handlers between renders.
 * Mutable on purpose and not React state: changing it must not re-render —
 * `setG` does that, once per snapped step, not once per pointer event.
 */
class GestureBox {
  g: Gesture | null = null;
  armed = false;
  timer: ReturnType<typeof setTimeout> | null = null;
  cancelled = false;
  set(patch: Partial<Pick<GestureBox, 'g' | 'armed' | 'timer' | 'cancelled'>>) {
    Object.assign(this, patch);
  }
}
const LONG_PRESS_MS = 320;

/**
 * PanResponders that survive re-renders. A PanResponder keeps its running
 * `dx/dy` inside the instance, so creating a fresh one on every render (each
 * snapped step re-renders) restarted the gesture at zero: a drag-to-draw never
 * grew past 15 minutes and a moved tile never left its slot. One instance per
 * key, its handlers forwarding to whatever config the latest render gave.
 */
class ResponderCache {
  private cfg = new Map<string, PanResponderCallbacks>();
  private made = new Map<string, PanResponderInstance>();
  get(key: string, config: PanResponderCallbacks): PanResponderInstance {
    this.cfg.set(key, config);
    let r = this.made.get(key);
    if (!r) {
      const fwd =
        <K extends keyof PanResponderCallbacks>(name: K) =>
        (e: GestureResponderEvent, gs: PanResponderGestureState) =>
          (this.cfg.get(key)?.[name] as any)?.(e, gs);
      r = PanResponder.create({
        onStartShouldSetPanResponder: fwd('onStartShouldSetPanResponder'),
        onMoveShouldSetPanResponder: fwd('onMoveShouldSetPanResponder'),
        onPanResponderTerminationRequest: fwd('onPanResponderTerminationRequest'),
        onPanResponderGrant: fwd('onPanResponderGrant'),
        onPanResponderMove: fwd('onPanResponderMove'),
        onPanResponderRelease: fwd('onPanResponderRelease'),
        onPanResponderTerminate: fwd('onPanResponderTerminate'),
      });
      this.made.set(key, r);
    }
    return r;
  }
}

export function TimeGrid({
  days,
  events,
  actions,
  header,
  fill,
  colWidth,
  focusIndex = 0,
  onPickDay,
  selectedId,
  clashIds,
}: {
  days: Date[];
  events: CalEvent[];
  actions: CalActions;
  header?: boolean;
  fill?: boolean;
  /** fixed px per column (phone week: columns scroll sideways). Unset = share the width. */
  colWidth?: number;
  focusIndex?: number;
  onPickDay?: (d: Date) => void;
  /** the event whose detail is open */
  selectedId?: number | null;
  clashIds?: Set<number>;
}) {
  const hours = useHours();
  const { isPhone } = useResponsive();
  const ws = hours.start;
  const we = hours.end;
  const bh = bodyH(ws, we);
  const gutterW = isPhone ? GUTTER_PHONE : GUTTER;
  const pan = colWidth != null;
  const step = pan ? colWidth + 1 : 0;

  const scroller = useRef<ScrollView>(null);
  const headScroller = useRef<ScrollView>(null);
  const colScroller = useRef<ScrollView>(null);
  const footScroller = useRef<ScrollView>(null);

  /* ── per-day plans ── */
  const isoDays = useMemo(() => days.map(iso), [days]);
  const [colPx, setColPx] = useState(0);
  // How many overlapping tiles fit side by side in this column width.
  const maxCols = colPx ? Math.max(1, Math.min(MAX_COLS, Math.floor(colPx / MIN_TILE_W))) : MAX_COLS;
  const plans = useMemo(
    () => isoDays.map((d) => planDay(events, d, ws, we, maxCols)),
    [events, isoDays, ws, we, maxCols],
  );
  const allDay = useMemo(() => isoDays.map((d) => allDayOn(events, d)), [events, isoDays]);
  const hasAllDay = allDay.some((l) => l.length > 0);

  /* ── open on the right hour ── */
  const todayIdx = days.findIndex((d) => sameDay(d, today()));
  useEffect(() => {
    let target: number;
    if (todayIdx >= 0) target = nowMin() / 60 - 1;
    else {
      const firstWork = days.map((d) => workFor(hours, wdIndex(d))).find(Boolean);
      target = firstWork ? firstWork.start - 0.5 : 8;
    }
    const y = Math.max(0, (target - ws) * ROW);
    const t = setTimeout(() => scroller.current?.scrollTo({ y, animated: false }), 60);
    return () => clearTimeout(t);
    // Only on a new period or a new window — not on every event change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isoDays.join(), ws, we]);

  // Phone week: land on the selected day, not always Monday.
  useEffect(() => {
    if (!pan) return;
    const t = setTimeout(
      () => colScroller.current?.scrollTo({ x: Math.max(0, focusIndex - 1) * step, animated: false }),
      60,
    );
    return () => clearTimeout(t);
  }, [pan, focusIndex, step]);

  const syncHead = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    headScroller.current?.scrollTo({ x, animated: false });
    footScroller.current?.scrollTo({ x, animated: false });
  };

  /* ── the clock: re-render each minute so the now-line and "past" stay true ── */
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  /* ───────────────────────── gestures ───────────────────────── */

  const [g, setG] = useState<Gesture | null>(null);
  // Live gesture bookkeeping, read by the responders' handlers between renders.
  // A plain mutable box (not state: changing it must not re-render).
  const [box] = useState(() => new GestureBox());
  const [responders] = useState(() => new ResponderCache());

  const put = (v: Gesture | null) => {
    box.set({ g: v });
    setG(v);
  };

  // Esc puts a drag back where it started.
  useEffect(() => {
    if (!isWeb || !g) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      box.set({ cancelled: true });
      put(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // `put` and `box` are stable for the purpose here; re-binding on `g` is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g]);

  const winMin = ws * 60;
  const winMax = we * 60;
  const clampMin = (m: number) => Math.max(winMin, Math.min(winMax, m));
  const minAt = (y: number) => clampMin(Math.floor((winMin + (y / ROW) * 60) / SNAP) * SNAP);

  // Native: once the long-press lands, the scroll views must stop scrolling
  // right away. A native scroll that starts can end the touch whatever the
  // termination request answers, so waiting for the first move (`g.moved`)
  // left a window where a held finger that drifts scrolls instead of drags.
  const [held, setHeld] = useState(false);
  const arm = () => {
    box.set({ armed: false });
    box.set({ cancelled: false });
    if (box.timer) clearTimeout(box.timer);
    if (isWeb) box.set({ armed: true });
    else
      box.set({
        timer: setTimeout(() => {
          box.set({ armed: true });
          setHeld(true);
        }, LONG_PRESS_MS),
      });
  };
  const disarm = () => {
    if (box.timer) clearTimeout(box.timer);
    box.set({ armed: false });
    setHeld(false);
  };
  const anchorOf = (e: GestureResponderEvent): PointAnchor => ({
    x: e.nativeEvent.pageX,
    y: e.nativeEvent.pageY,
  });
  const travelled = (gs: PanResponderGestureState) =>
    Math.abs(gs.dx) > DRAG_SLOP || Math.abs(gs.dy) > DRAG_SLOP;

  /** Empty space in column `col`: click = quick-create, drag = draw. */
  const colResponder = (col: number) =>
    responders.get(`col-${col}`, {
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Before the long-press lands (native), a swipe belongs to the ScrollView.
      onPanResponderTerminationRequest: () => !box.armed,
      onPanResponderGrant: (e) => {
        arm();
        const m = minAt(e.nativeEvent.locationY);
        put({ kind: 'create', col, a: m, b: m, moved: false, anchor: anchorOf(e) });
      },
      onPanResponderMove: (_e, gs) => {
        const cur = box.g;
        if (!cur || cur.kind !== 'create' || !box.armed || box.cancelled) return;
        const moved = cur.moved || Math.abs(gs.dy) > DRAG_SLOP;
        const b = clampMin(cur.a + snapMin((gs.dy / ROW) * 60, SNAP));
        if (b !== cur.b || moved !== cur.moved) put({ ...cur, b, moved });
      },
      onPanResponderRelease: () => {
        const cur = box.g;
        disarm();
        put(null);
        if (!cur || cur.kind !== 'create' || box.cancelled) return;
        let s: number;
        let t: number;
        if (cur.moved && cur.b !== cur.a) {
          s = Math.min(cur.a, cur.b);
          t = Math.max(cur.a, cur.b);
          if (t - s < MIN_DUR) t = s + MIN_DUR;
        } else {
          s = cur.a;
          t = s + CLICK_DUR;
        }
        // Keep the new block inside your hours, at its length: a click at
        // 21:45 makes 21:30–22:00, not a 15-minute stub.
        if (t > winMax) {
          const len = t - s;
          t = winMax;
          s = Math.max(winMin, t - len);
        }
        actions.openQuick({ date: isoDays[cur.col], start: fromMin(s), end: fromMin(t), anchor: cur.anchor });
      },
      onPanResponderTerminate: () => {
        disarm();
        put(null);
      },
    });

  /** Why a tile cannot be dragged, or null if it can. */
  const lockOf = (it: LaidBlock): string | null => {
    if (it.ev.imported) return 'From Google Calendar — change it there';
    if (it.cutTop || it.cutBottom) return 'Runs past your hours — edit it to move it';
    if (it.ev.endDate) return 'Spans midnight — edit it to move it';
    return null;
  };

  /** A tile: body = move, top/bottom edge = resize. Click (no travel) = detail. */
  const tileResponder = (it: LaidBlock, col: number, mode: 'move' | 'start' | 'end') =>
    responders.get(`${it.ev.id}-${isoDays[col]}-${mode}`, {
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => !box.armed,
      onPanResponderGrant: (e) => {
        arm();
        put({
          kind: mode,
          ev: it.ev,
          col,
          s0: it.s,
          t0: it.t,
          dMin: 0,
          dCol: 0,
          moved: false,
          anchor: anchorOf(e),
          hint: null,
          locked: !!lockOf(it),
        });
      },
      onPanResponderMove: (_e, gs) => {
        const cur = box.g;
        if (!cur || cur.kind === 'create' || !box.armed || box.cancelled) return;
        const moved = cur.moved || travelled(gs);
        if (!moved) return;
        const lock = lockOf(it);
        if (lock) {
          if (cur.hint !== lock || !cur.moved) put({ ...cur, moved, hint: lock });
          return;
        }
        let dCol = mode === 'move' && colPx > 0 ? Math.round(gs.dx / colPx) : 0;
        let hint: string | null = null;
        if (dCol !== 0 && it.ev.rrule) {
          dCol = 0;
          hint = 'Repeats keep their day — change it in Edit';
        }
        dCol = Math.max(-col, Math.min(days.length - 1 - col, dCol));
        const dMin = snapMin((gs.dy / ROW) * 60, SNAP);
        const next = { ...cur, moved, dMin, dCol, hint };
        const p = preview(next);
        if (p.clamped) next.hint = p.clamped;
        if (next.dMin !== cur.dMin || next.dCol !== cur.dCol || next.hint !== cur.hint || !cur.moved)
          put(next);
      },
      onPanResponderRelease: () => {
        const cur = box.g;
        disarm();
        put(null);
        if (!cur || cur.kind === 'create' || box.cancelled) return;
        if (!cur.moved) {
          actions.openEvent(it.ev.id, cur.anchor);
          return;
        }
        if (lockOf(it)) {
          actions.toast(lockOf(it)!);
          return;
        }
        const p = preview(cur);
        commit(it.ev, isoDays[cur.col + cur.dCol], p.s, p.t, cur.kind === 'move' ? 'Moved' : 'Resized');
      },
      onPanResponderTerminate: () => {
        disarm();
        put(null);
      },
    });

  /** Where a drag would put the tile now, kept inside your hours. */
  function preview(cur: Extract<Gesture, { kind: 'move' | 'start' | 'end' }>) {
    const dur = cur.t0 - cur.s0;
    let s = cur.s0;
    let t = cur.t0;
    let clamped: string | null = null;
    if (cur.kind === 'move') {
      s = cur.s0 + cur.dMin;
      if (s < winMin) {
        s = winMin;
        clamped = `Your hours start at ${pad(ws)}:00`;
      }
      if (s + dur > winMax) {
        s = winMax - dur;
        clamped = `Your hours end at ${pad(we % 24)}:00`;
      }
      t = s + dur;
    } else if (cur.kind === 'start') {
      s = cur.s0 + cur.dMin;
      if (s < winMin) {
        s = winMin;
        clamped = `Your hours start at ${pad(ws)}:00`;
      }
      s = Math.min(s, cur.t0 - MIN_DUR);
    } else {
      t = cur.t0 + cur.dMin;
      if (t > winMax) {
        t = winMax;
        clamped = `Your hours end at ${pad(we % 24)}:00`;
      }
      t = Math.max(t, cur.s0 + MIN_DUR);
    }
    return { s, t, clamped };
  }

  /**
   * Save a new time for `ev` (optimistic), with Undo. A repeat keeps its days:
   * only its times change, and the change applies to every repeat — there is no
   * per-occurrence exception in the data model yet.
   */
  function commit(ev: CalEvent, date: string, s: number, t: number, verb: string) {
    const series = allEvents().find((e) => e.id === ev.id) ?? ev;
    const before = { date: series.date, start: series.start, end: series.end };
    const patch = series.rrule
      ? { start: fromMin(s), end: fromMin(t) }
      : { date, start: fromMin(s), end: fromMin(t) };
    if (
      patch.start === before.start &&
      patch.end === before.end &&
      (!('date' in patch) || patch.date === before.date)
    )
      return;
    const when = `${WD[wdIndex(new Date(`${date}T00:00:00`))]} ${patch.start}–${patch.end}`;
    void updateEvent(ev.id, patch).then((ok) =>
      ok
        ? actions.toast(`${verb}${series.rrule ? ' every repeat' : ''} · ${when}`, {
            label: 'Undo',
            run: () =>
              void updateEvent(ev.id, before).then((back) => {
                if (!back) actions.toast(SAVE_FAILED);
              }),
          })
        : actions.toast(SAVE_FAILED),
    );
  }

  /** Keyboard on a focused tile: ↑/↓ 15 min, Shift+←/→ a day, Alt+↑/↓ length. */
  const onTileKey =
    (it: LaidBlock, col: number) =>
    (e: { key: string; shiftKey: boolean; altKey: boolean; preventDefault: () => void }) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        actions.openEvent(it.ev.id);
        return;
      }
      const vertical = e.key === 'ArrowUp' || e.key === 'ArrowDown';
      const horizontal = e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');
      if (!vertical && !horizontal) return;
      e.preventDefault();
      const lock = lockOf(it);
      if (lock) return actions.toast(lock);
      const dir = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1;
      if (horizontal) {
        if (it.ev.rrule) return actions.toast('Repeats keep their day — change it in Edit');
        const to = col + dir;
        if (to < 0 || to >= days.length) return;
        return commit(it.ev, isoDays[to], it.s, it.t, 'Moved');
      }
      const cur = {
        kind: e.altKey ? ('end' as const) : ('move' as const),
        ev: it.ev,
        col,
        s0: it.s,
        t0: it.t,
        dMin: dir * SNAP,
        dCol: 0,
        moved: true,
        anchor: { x: 0, y: 0 },
        hint: null,
        locked: false,
      };
      const p = preview(cur);
      if (p.clamped) actions.toast(p.clamped);
      commit(it.ev, isoDays[col], p.s, p.t, e.altKey ? 'Resized' : 'Moved');
    };

  /* ───────────────────────── render ───────────────────────── */

  const colStyle = pan ? { width: colWidth } : styles.colFlex;
  const now = nowMin();
  const todayIso = iso(today());

  const heads = days.map((d, i) => {
    const isToday = i === todayIdx;
    const off = !workFor(hours, wdIndex(d));
    const cellStyle = [colStyle, styles.dayHead];
    // Events wholly outside your hours: a quiet count in the day's own header,
    // not a row of chips across the grid.
    const outside = [...plans[i].before, ...plans[i].after];
    const content = (
      <>
        <Txt style={[styles.dayHeadWd, isToday && styles.dayHeadWdToday, off && !isToday && styles.offTxt]}>
          {WD[wdIndex(d)]}
        </Txt>
        <View style={[styles.dayNum, isToday && styles.dayNumToday]}>
          <Txt style={[styles.dayHeadNum, isToday && styles.onInk, off && !isToday && styles.offTxt]}>
            {d.getDate()}
          </Txt>
        </View>
      </>
    );
    const more =
      outside.length > 0 ? (
        <Press
          onPress={(e) =>
            outside.length === 1
              ? actions.openEvent(outside[0].id, anchorOf(e))
              : actions.openList(`Outside your hours · ${WD[wdIndex(d)]} ${d.getDate()}`, outside, anchorOf(e))
          }
          hoverBg={N.hover}
          hitSlop={6}
          accessibilityRole="button"
          aria-label={`${outside.length} outside your hours`}
          style={styles.outside}>
          <Txt style={styles.outsideTxt}>+{outside.length}</Txt>
        </Press>
      ) : null;
    // Day view has nothing to open: a plain cell, not a disabled (greyed) button.
    if (!onPickDay)
      return (
        <View key={isoDays[i]} style={cellStyle}>
          {content}
          {more}
        </View>
      );
    return (
      <View key={isoDays[i]} style={cellStyle}>
        <Press
          onPress={() => onPickDay(d)}
          hoverBg={N.hover}
          accessibilityRole="button"
          aria-label={`Open ${WD[wdIndex(d)]} ${d.getDate()} in day view`}
          style={styles.dayHeadBtn}>
          {content}
        </Press>
        {more}
      </View>
    );
  });

  const lanes = days.map((d, i) => (
    <View key={isoDays[i]} style={[colStyle, styles.lane]}>
      {allDay[i].map((ev) => (
        <Press
          key={`${ev.id}-${isoDays[i]}`}
          onPress={(e) => actions.openEvent(ev.id, anchorOf(e))}
          hoverBg={N.sunken}
          accessibilityRole="button"
          aria-label={`${ev.title}, all day`}
          style={[styles.laneChip, ...paint(ev).box]}>
          <Txt numberOfLines={1} style={[styles.laneTxt, paint(ev).title]}>
            {ev.title}
          </Txt>
        </Press>
      ))}
    </View>
  ));

  const columns = days.map((d, i) => {
    const plan = plans[i];
    const dayIso = isoDays[i];
    const isToday = i === todayIdx;
    const work = workFor(hours, wdIndex(d));
    const create = g?.kind === 'create' && g.col === i && g.moved ? g : null;
    const drag = g && g.kind !== 'create' && g.moved && !g.locked ? g : null;
    const responder = colResponder(i);

    return (
      <View
        key={dayIso}
        onLayout={i === 0 ? (e) => setColPx(e.nativeEvent.layout.width + 1) : undefined}
        style={[colStyle, styles.col, { height: bh }, isWeb && styles.colCursor]}
        {...responder.panHandlers}>
        <OffHours work={work} ws={ws} we={we} />
        <HourLines start={ws} end={we} />

        {plan.blocks.map((it) => {
          const dragging = drag && drag.ev.id === it.ev.id && drag.col === i && isSameInstance(drag, it);
          const lock = lockOf(it);
          const past = dayIso < todayIso || (dayIso === todayIso && it.t <= now);
          return (
            <EventBlock
              key={`${it.ev.id}-${dayIso}`}
              it={it}
              winStart={ws}
              state={{
                ghost: !!dragging,
                selected: selectedId === it.ev.id,
                past,
                clash: clashIds?.has(it.ev.id),
              }}
              body={tileResponder(it, i, 'move').panHandlers}
              top={tileResponder(it, i, 'start').panHandlers}
              bottom={tileResponder(it, i, 'end').panHandlers}
              canResize={!lock}
              locked={!!lock}
              onKeyDown={onTileKey(it, i)}
              label={`${it.ev.title}, ${fromMin(it.s)} to ${fromMin(it.t)}, ${paint(it.ev).spec.label}${lock ? `. ${lock}` : '. Drag to move, arrow keys to nudge'}`}
            />
          );
        })}

        {/* The tile being dragged, drawn where it would land. */}
        {drag && drag.col + drag.dCol === i && (
          <DragPreview g={drag} p={preview(drag)} ws={ws} day={d} />
        )}

        {plan.overflow.map((o) => (
          <Press
            key={`of-${o.s}`}
            onPress={(e) => actions.openList(`${o.items.length} more at ${fromMin(o.s)}`, o.items, anchorOf(e))}
            hoverBg={N.sunken}
            accessibilityRole="button"
            aria-label={`${o.items.length} more events`}
            style={[
              styles.more,
              SHADOW.sm,
              {
                top: minToY(o.s, ws) + 2,
                left: `${(o.col / o.cols) * 100}%` as const,
                width: `${100 / o.cols}%` as const,
              },
            ]}>
            <Txt style={styles.moreTxt}>+{o.items.length}</Txt>
          </Press>
        ))}

        {create && <CreateGhost a={create.a} b={create.b} ws={ws} day={d} />}

        {isToday && now >= winMin && now < winMax && (
          <View pointerEvents="none" style={[styles.nowLine, { top: minToY(now, ws) }]}>
            <View style={styles.nowDot} />
          </View>
        )}
      </View>
    );
  });

  return (
    <View style={fill ? styles.fill : undefined}>
      {header && (
        <View style={styles.headBlock}>
          <View style={[styles.gutterCol, { width: gutterW }]}>
            <View style={styles.gutterHead} />
            {hasAllDay && <View style={styles.gutterLane} />}
          </View>
          {pan ? (
            <ScrollView
              ref={headScroller}
              style={styles.flexW}
              horizontal
              scrollEnabled={false}
              showsHorizontalScrollIndicator={false}>
              <View>
                <View style={styles.row}>{heads}</View>
                {hasAllDay && <View style={[styles.row, styles.laneRow]}>{lanes}</View>}
              </View>
            </ScrollView>
          ) : (
            <View style={styles.flexW}>
              <View style={styles.row}>{heads}</View>
              {hasAllDay && <View style={[styles.row, styles.laneRow]}>{lanes}</View>}
            </View>
          )}
        </View>
      )}

      {!header && hasAllDay && (
        <View style={styles.headBlock}>
          <View style={[styles.gutterLane, { width: gutterW }]} />
          <View style={[styles.row, styles.flexW]}>{lanes}</View>
        </View>
      )}

      <ScrollView
        ref={scroller}
        style={fill ? styles.fill : undefined}
        showsVerticalScrollIndicator={false}
        // A drag owns the pointer; the page must not scroll under it.
        scrollEnabled={!g?.moved && !held}
        contentContainerStyle={{ minHeight: bh }}>
        <View style={[styles.row, { height: bh }]}>
          <View style={[styles.gutter, { width: gutterW, height: bh }]}>
            {gutterHours(ws, we).map((h, i) => (
              <View key={h} style={styles.gutterHour}>
                {i > 0 && <Txt style={styles.gutterTxt}>{pad(h)}:00</Txt>}
              </View>
            ))}
          </View>
          {pan ? (
            <ScrollView
              ref={colScroller}
              style={styles.flexW}
              horizontal
              showsHorizontalScrollIndicator={false}
              onScroll={syncHead}
              scrollEventThrottle={16}
              scrollEnabled={!g?.moved && !held}
              snapToInterval={step}
              decelerationRate="fast">
              <View style={[styles.row, { height: bh }]}>{columns}</View>
            </ScrollView>
          ) : (
            <View style={[styles.row, styles.flexW, { height: bh }]}>{columns}</View>
          )}
        </View>
      </ScrollView>

    </View>
  );
}

/** A repeat is one event drawn on many days; only the dragged day's copy is "it". */
function isSameInstance(g: Extract<Gesture, { ev: CalEvent }>, it: LaidBlock) {
  return g.ev.date === it.ev.date;
}

/* ───────────────────────── parts ───────────────────────── */

/** A faint wash over the parts of a day outside working hours (all of it on a day off). */
function OffHours({ work, ws, we }: { work: ReturnType<typeof workFor>; ws: number; we: number }) {
  if (!work) return <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.off]} />;
  return (
    <>
      {work.start > ws && (
        <View
          pointerEvents="none"
          style={[styles.offBand, styles.off, { top: 0, height: (work.start - ws) * ROW }]}
        />
      )}
      {work.end < we && (
        <View
          pointerEvents="none"
          style={[styles.offBand, styles.off, { top: (work.end - ws) * ROW, bottom: 0 }]}
        />
      )}
    </>
  );
}

function HourLines({ start, end }: { start: number; end: number }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {gutterHours(start, end).map((_, i) => (
        <View key={`h${i}`}>
          {i > 0 && <View style={[styles.hourLine, { top: i * ROW }]} />}
        </View>
      ))}
    </View>
  );
}

/** The block being drawn by a drag on empty space. */
function CreateGhost({ a, b, ws, day }: { a: number; b: number; ws: number; day: Date }) {
  const s = Math.min(a, b);
  const t = Math.max(a, b, s + MIN_DUR);
  return (
    <View pointerEvents="none" style={[styles.ghostWrap, { top: minToY(s, ws), height: ((t - s) / 60) * ROW - 2 }]}>
      <View style={[styles.createGhost, SHADOW.md]}>
        <Txt style={styles.dragLabelTxtInk}>
          {WD[wdIndex(day)]} {fromMin(s)} – {fromMin(t)}
        </Txt>
      </View>
    </View>
  );
}

/** The dragged tile at its would-be position, with the time riding on it. */
function DragPreview({
  g,
  p,
  ws,
  day,
}: {
  g: Extract<Gesture, { ev: CalEvent }>;
  p: { s: number; t: number; clamped: string | null };
  ws: number;
  day: Date;
}) {
  const it: LaidBlock = {
    ev: g.ev,
    s: p.s,
    t: p.t,
    col: 0,
    cols: 1,
    cutTop: false,
    cutBottom: false,
    trueStart: p.s,
    trueEnd: p.t,
  };
  const top = minToY(p.s, ws);
  return (
    <>
      <EventBlock it={it} winStart={ws} state={{ dragging: true }} canResize={false} label="" />
      <View pointerEvents="none" style={[styles.dragLabel, { top: Math.max(0, top - 24) }]}>
        <View style={[styles.dragLabelPill, SHADOW.md]}>
          <Txt style={styles.dragLabelTxt}>
            {WD[wdIndex(day)]} {fromMin(p.s)} – {fromMin(p.t)}
          </Txt>
        </View>
        {!!g.hint && (
          <View style={[styles.dragHint, SHADOW.sm]}>
            <Txt style={styles.dragHintTxt}>{g.hint}</Txt>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minHeight: 0 },
  flexW: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row' },

  headBlock: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: N.line, backgroundColor: N.surface },
  gutterCol: {},
  gutterHead: { height: 52 },
  gutterLane: { minHeight: 34, borderTopWidth: 1, borderTopColor: N.line },

  dayHead: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderLeftWidth: 1,
    borderLeftColor: N.line,
  },
  dayHeadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 6, borderRadius: R.md },
  dayHeadWd: { fontFamily: SANS, fontSize: 14, lineHeight: 20, fontWeight: '400', color: N.muted },
  dayHeadWdToday: { color: N.ink, fontWeight: '600' },
  dayNum: { minWidth: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  dayNumToday: { backgroundColor: N.ink },
  dayHeadNum: { fontFamily: SANS, fontSize: 14, lineHeight: 20, fontWeight: '600', color: N.ink },
  onInk: { color: N.onInk },
  offTxt: { color: N.faint },
  outside: { marginLeft: 'auto', height: 22, minWidth: 26, borderRadius: R.full, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: N.sunken },
  outsideTxt: { fontFamily: SANS, fontSize: 11, lineHeight: 14, color: N.ink2, fontWeight: '500' },

  laneRow: { borderTopWidth: 1, borderTopColor: N.line },
  lane: { minHeight: 34, padding: 4, gap: 3, borderLeftWidth: 1, borderLeftColor: N.line },
  laneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 24,
    borderRadius: R.md,
    paddingHorizontal: 8,
  },
  laneTxt: { flex: 1, fontFamily: SANS, fontSize: 12, lineHeight: 16, fontWeight: '600' },

  gutter: { position: 'relative', backgroundColor: N.surface },
  gutterHour: { height: ROW },
  gutterTxt: { position: 'absolute', right: 10, top: -8, color: N.faint, fontSize: 11, lineHeight: 16, fontVariant: ['tabular-nums'] },
  colFlex: { flex: 1, minWidth: 0 },
  col: { position: 'relative', backgroundColor: N.surface, borderLeftWidth: 1, borderLeftColor: N.line },
  colCursor: { cursor: 'cell' } as unknown as ViewStyle,
  off: { backgroundColor: N.offHours },
  offBand: { position: 'absolute', left: 0, right: 0 },
  hourLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: N.line },

  nowLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: N.accent, zIndex: 20 },
  nowDot: {
    position: 'absolute',
    left: -3,
    top: -3,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: N.accent,
  },

  more: {
    position: 'absolute',
    height: 22,
    marginHorizontal: 2,
    borderRadius: R.sm,
    backgroundColor: N.surface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  moreTxt: { fontFamily: SANS, color: N.ink, fontSize: 11, fontWeight: '500' },

  ghostWrap: { position: 'absolute', left: 2, right: 2, zIndex: 40 },
  createGhost: {
    flex: 1,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: N.ink,
    backgroundColor: N.glass,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  dragLabel: { position: 'absolute', left: 2, right: 2, alignItems: 'flex-start', gap: 4, zIndex: 60 },
  dragLabelPill: { borderRadius: R.sm, backgroundColor: N.ink, paddingHorizontal: 6, paddingVertical: 3 },
  dragLabelTxt: { color: N.onInk, fontSize: 11, lineHeight: 14, fontVariant: ['tabular-nums'] },
  dragLabelTxtInk: { color: N.ink, fontSize: 11, lineHeight: 14, fontVariant: ['tabular-nums'] },
  dragHint: { borderRadius: R.sm, backgroundColor: N.surface, paddingHorizontal: 6, paddingVertical: 3, maxWidth: 220 },
  dragHintTxt: { fontFamily: SANS, fontSize: 11, lineHeight: 14, color: N.ink2 },
});
