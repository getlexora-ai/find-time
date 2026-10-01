import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { syncNow, useAccounts } from './account-store';
import { useCalEvents } from './cal-store';
import { addDays, fromIso, fromMin, iso, MO, startOfWeek, today, WD, wdIndex } from './cal-date';
import { AgentPanel } from './agent/AgentPanel';
import { draftsOf, useAgent } from './agent/store';
import { hashId } from './api-adapter';
import { CommandBar } from './components/CommandBar';
import { ComposeSheet, firstFree } from './components/ComposeSheet';
import { DayView } from './components/DayView';
import { EventDetail } from './components/EventDetail';
import { EventList } from './components/EventList';
import { FilterSheet } from './components/FilterSheet';
import { Frame } from './components/Frame';
import { KpiStrip } from './components/KpiStrip';
import { MobileNav, NAV_H } from './components/MobileNav';
import { PickerSheet } from './components/PickerSheet';
import { QuickCreate } from './components/QuickCreate';
import { Sidebar } from './components/Sidebar';
import { useToast } from './components/Toast';
import { WeekView } from './components/WeekView';
import { getHours, useHours, workFor } from './hours';
import { computeKpis, slicesIn } from './kpi';
import type { CalActions, CalState, ComposePreset, PointAnchor, Slot, ViewKind } from './state';
import { N } from './tokens';
import type { CalEvent, EventKind } from './types';
import { Brackets } from './ui';
import { useResponsive } from './useResponsive';

/**
 * Real clashes on the days in view: two fixed commitments whose times overlap.
 * Built on the grid's own slices, so a weekly routine clashes in every week it
 * repeats in. Breaks, proposals and all-day events never clash — a proposal is
 * not booked, and an all-day event is context, not a time.
 */
function clashesIn(events: CalEvent[], days: string[]) {
  const pairs: { a: CalEvent; b: CalEvent }[] = [];
  const ids = new Set<number>();
  const slices = slicesIn(
    events.filter((e) => e.kind !== 'break' && e.kind !== 'ai'),
    days,
  );
  const byDay = new Map<string, typeof slices>();
  for (const sl of slices) {
    const list = byDay.get(sl.ev.date) ?? [];
    list.push(sl);
    byDay.set(sl.ev.date, list);
  }
  for (const list of byDay.values()) {
    list.sort((x, y) => x.s - y.s);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length && list[j].s < list[i].t; j++) {
        pairs.push({ a: list[i].ev, b: list[j].ev });
        ids.add(list[i].ev.id);
        ids.add(list[j].ev.id);
      }
    }
  }
  return { pairs, ids };
}

/** "21 – 27 SEP 2026", "28 SEP – 4 OCT 2026", "THU 24 SEP 2026". */
function rangeLabel(view: ViewKind, cursor: Date, selected: Date) {
  const mo = (d: Date) => MO[d.getMonth()].slice(0, 3).toUpperCase();
  if (view === 'day') return `${WD[wdIndex(selected)].toUpperCase()} ${selected.getDate()} ${mo(selected)} ${selected.getFullYear()}`;
  const a = startOfWeek(cursor);
  const b = addDays(a, 6);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${b.getDate()} ${mo(b)} ${b.getFullYear()}`;
  if (a.getFullYear() === b.getFullYear()) return `${a.getDate()} ${mo(a)} – ${b.getDate()} ${mo(b)} ${b.getFullYear()}`;
  return `${a.getDate()} ${mo(a)} ${a.getFullYear()} – ${b.getDate()} ${mo(b)} ${b.getFullYear()}`;
}

/** Where "+ New" should start: the next free 30 min in working hours, today or after. */
function nextFreeSlot(): { date: string; at: string } {
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const d = addDays(today(), i);
    const from = i === 0 ? now.getHours() * 60 + now.getMinutes() : 0;
    const m = firstFree(iso(d), 30, from);
    if (m != null) return { date: iso(d), at: fromMin(m) };
  }
  const w = workFor(getHours(), wdIndex(today()));
  return { date: iso(today()), at: `${String(w?.start ?? 9).padStart(2, '0')}:00` };
}

export function CalendarScreen() {
  const all = useCalEvents();
  const toast = useToast();
  const hours = useHours();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const { signedIn, accounts } = useAccounts();

  useEffect(() => {
    if (signedIn) void syncNow();
  }, [signedIn]);

  // Toast the outcome of the OAuth round-trip (?connect=ok|error on /app).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search).get('connect');
    if (!p) return;
    toast(p === 'ok' ? 'Google Calendar connected' : 'Could not connect Google Calendar');
    window.history.replaceState(null, '', window.location.pathname);
  }, [toast]);

  const [state, setState] = useState<CalState>(() => ({
    view: 'week',
    cursor: today(),
    selected: today(),
    loading: false,
  }));

  /* ── what is shown: kinds you hid, calendars you switched off ── */
  const [hidden, setHidden] = useState<Set<EventKind>>(() => new Set());
  const offCals = useMemo(
    () => new Set(accounts.flatMap((a) => a.calendars.filter((c) => !c.readEnabled).map((c) => c.id))),
    [accounts],
  );
  const shown = useMemo(
    () => all.filter((e) => !(e.calendarId && offCals.has(e.calendarId))),
    [all, offCals],
  );
  /*
   * Plan with AI drafts: while changes wait for Approve, their blocks are drawn
   * on the grid as proposals, and a block being moved is drawn faded at its
   * old time. Nothing here is saved — it is the card in the panel, in place.
   */
  const agent = useAgent();
  const drafts = useMemo(() => draftsOf(agent), [agent]);
  const withDrafts = useMemo(() => {
    if (!drafts.length) return shown;
    const moving = new Set(drafts.flatMap((d) => (d.replaces ? [hashId(d.replaces)] : [])));
    const ghosts: CalEvent[] = drafts.map((d, i) => ({
      id: -1_000_000 - i,
      date: d.date,
      start: d.start,
      end: d.end,
      title: d.title,
      cat: d.category,
      kind: 'ai',
      project: '',
      notes: '',
      draft: true,
    }));
    return [...shown.map((e) => (moving.has(e.id) ? { ...e, faded: true } : e)), ...ghosts];
  }, [shown, drafts]);
  // When a plan appears, go to it: its week, and its first hour in view.
  const firstDraft = useMemo(
    () => [...drafts].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0] ?? null,
    [drafts],
  );
  const reveal = useMemo(
    () => (firstDraft ? { date: firstDraft.date, min: Number(firstDraft.start.slice(0, 2)) * 60 + Number(firstDraft.start.slice(3)) } : null),
    [firstDraft],
  );
  // A new plan moves the grid to its week (state adjusted during render, the
  // React pattern for "reset when an input changes" — no effect, no flicker).
  const draftKey = drafts.map((d) => d.date + d.start).join();
  const [seenDraftKey, setSeenDraftKey] = useState('');
  if (draftKey !== seenDraftKey) {
    setSeenDraftKey(draftKey);
    if (firstDraft) {
      const d = fromIso(firstDraft.date);
      const inView =
        state.view === 'week'
          ? iso(startOfWeek(state.cursor)) === iso(startOfWeek(d))
          : iso(state.selected) === firstDraft.date;
      if (!inView) setState((st) => ({ ...st, cursor: d, selected: new Date(d) }));
    }
  }
  const events = useMemo(
    () => (hidden.size ? withDrafts.filter((e) => e.draft || !hidden.has(e.kind)) : withDrafts),
    [withDrafts, hidden],
  );
  const toggleKind = useCallback(
    (k: EventKind) =>
      setHidden((prev) => {
        const next = new Set(prev);
        if (next.has(k)) next.delete(k);
        else next.add(k);
        return next;
      }),
    [],
  );

  /* ── surfaces ── */
  const [compose, setCompose] = useState<{
    id: number | null;
    date: string;
    at: string;
    autoPlace?: boolean;
    preset?: ComposePreset;
  } | null>(null);
  const [detail, setDetail] = useState<{ id: number; anchor: PointAnchor | null } | null>(null);
  const [quick, setQuick] = useState<Slot | null>(null);
  const [list, setList] = useState<{ title: string; events: CalEvent[]; anchor: PointAnchor | null } | null>(null);
  const [ai, setAi] = useState<{ prefill?: string } | null>(null);
  const [picker, setPicker] = useState(false);
  const [filters, setFilters] = useState(false);

  const step = useCallback((dir: -1 | 1) => {
    setState((s) => {
      const n = s.view === 'week' ? dir * 7 : dir;
      return { ...s, cursor: addDays(s.cursor, n), selected: addDays(s.selected, n) };
    });
  }, []);

  const actions = useMemo<CalActions>(
    () => ({
      setView: (v) => setState((s) => ({ ...s, view: v, cursor: new Date(s.selected) })),
      step,
      goToday: () => {
        const t = today();
        setState((s) => ({ ...s, cursor: t, selected: new Date(t) }));
      },
      pick: (dateIso) =>
        setState((s) => {
          const d = fromIso(dateIso);
          return { ...s, selected: d, cursor: new Date(d) };
        }),
      openCompose: (id, date, at, autoPlace, preset) => {
        if (id == null && !date) {
          const slot = nextFreeSlot();
          setCompose({ id, date: slot.date, at: slot.at, autoPlace, preset });
          return;
        }
        setCompose({ id, date: date ?? iso(today()), at: at ?? '09:00', autoPlace, preset });
      },
      openQuick: (slot) => setQuick(slot),
      openEvent: (id, anchor) => {
        setList(null);
        setDetail({ id, anchor: anchor ?? null });
      },
      openList: (title, evs, anchor) => setList({ title, events: evs, anchor: anchor ?? null }),
      openAI: (prefill) => setAi({ prefill }),
      openPicker: () => setPicker(true),
      toast,
    }),
    [step, toast],
  );

  /** The exact days on screen — scopes the KPIs and the clash check. */
  const days = useMemo(() => {
    if (state.view === 'day') return [iso(state.selected)];
    const s = startOfWeek(state.cursor);
    return Array.from({ length: 7 }, (_, i) => iso(addDays(s, i)));
  }, [state.view, state.cursor, state.selected]);

  const clashes = useMemo(() => clashesIn(events, days), [events, days]);
  const kpis = useMemo(
    () => computeKpis(events, days, clashes.pairs.length, hours),
    [events, days, clashes.pairs.length, hours],
  );
  const range = rangeLabel(state.view, state.cursor, state.selected);

  /* ── web keyboard ── */
  const anyOpen = !!(compose || detail || quick || list || ai || picker || filters);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') {
        setCompose(null);
        setAi(null);
        setDetail(null);
        setQuick(null);
        setList(null);
        setPicker(false);
        setFilters(false);
        return;
      }
      if (anyOpen) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'w') actions.setView('week');
      if (k === 'd') actions.setView('day');
      if (k === 't') actions.goToday();
      if (k === 'n') {
        e.preventDefault();
        actions.openCompose(null);
      }
      if (e.key === 'ArrowLeft' && !e.shiftKey) actions.step(-1);
      if (e.key === 'ArrowRight' && !e.shiftKey) actions.step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions, anyOpen]);

  const detailEvent = detail ? all.find((e) => e.id === detail.id) ?? null : null;
  const selectedId = detail?.id ?? null;

  const resolve =
    clashes.pairs.length > 0
      ? () => {
          // Move one that can move — not imported, not protected — from the
          // first clash that has one. It used to take the first clash only and
          // fall back to its second event, so a Google meeting over a focus
          // block opened the edit sheet on a read-only Google event.
          const all = clashes.pairs.flatMap(({ a, b }) => [b, a]);
          const movable = all.find((e) => !e.imported && e.kind !== 'focus');
          if (movable) return actions.openCompose(movable.id, undefined, undefined, true);
          // Nothing the AI may move: show the clash so you can decide.
          const own = all.find((e) => !e.imported) ?? all[0];
          actions.openEvent(own.id);
        }
      : undefined;

  const grid =
    state.view === 'week' ? (
      <WeekView state={state} actions={actions} events={events} selectedId={selectedId} clashIds={clashes.ids} reveal={reveal} />
    ) : (
      <DayView state={state} actions={actions} events={events} selectedId={selectedId} clashIds={clashes.ids} reveal={reveal} />
    );

  return (
    <SafeAreaView style={styles.root} edges={['top']} nativeID="ft-calendar">
      <Frame />
      <View style={[styles.frame, isDesktop && styles.frameDesktop]}>
        {isDesktop && <Brackets />}
        <CommandBar state={state} actions={actions} range={range} />
        <View style={styles.row}>
          {isDesktop && (
            <Sidebar
              selected={state.selected}
              weekOf={state.view === 'week' ? state.cursor : undefined}
              events={shown}
              hidden={hidden}
              onToggleKind={toggleKind}
              onPick={(d) => actions.pick(d)}
            />
          )}
          <View style={[styles.main, !isDesktop && { paddingBottom: NAV_H + Math.max(10, insets.bottom) }]}>
            <KpiStrip k={kpis} onResolve={resolve} />
            <View style={styles.grid}>{grid}</View>
          </View>
          {/* Desktop: the conversation docks beside the grid, so the drafts it
              makes are visible on the week while you talk. */}
          {ai && isDesktop && <AgentPanel docked onClose={() => setAi(null)} />}
        </View>
      </View>

      {!isDesktop && (
        <MobileNav
          view={state.view}
          onSetView={actions.setView}
          onCompose={() => actions.openCompose(null)}
          onOpenAI={() => actions.openAI()}
          onOpenFilters={() => setFilters(true)}
        />
      )}

      {quick && (
        <QuickCreate
          slot={quick}
          onClose={() => setQuick(null)}
          onMore={(preset) => actions.openCompose(null, quick.date, quick.start, false, preset)}
          toast={toast}
        />
      )}
      {compose && (
        <ComposeSheet
          key={`${compose.id ?? 'new'}-${compose.date}-${compose.at}-${compose.autoPlace ? 'ai' : ''}`}
          composeId={compose.id}
          defaultDate={compose.date}
          defaultStart={compose.at}
          autoPlace={compose.autoPlace}
          preset={compose.preset}
          onClose={() => setCompose(null)}
          onSaved={(d) => {
            setCompose(null);
            setState((s) => ({ ...s, selected: fromIso(d), cursor: fromIso(d) }));
          }}
          toast={toast}
        />
      )}
      {detail && detailEvent && (
        <EventDetail
          event={detailEvent}
          anchor={detail.anchor}
          clash={clashes.ids.has(detailEvent.id)}
          onClose={() => setDetail(null)}
          actions={actions}
        />
      )}
      {list && (
        <EventList
          title={list.title}
          events={list.events}
          anchor={list.anchor}
          onClose={() => setList(null)}
          onOpen={(id) => actions.openEvent(id, list.anchor ?? undefined)}
        />
      )}
      {ai && !isDesktop && <AgentPanel docked={false} onClose={() => setAi(null)} />}
      {filters && (
        <FilterSheet events={shown} hidden={hidden} onToggleKind={toggleKind} onClose={() => setFilters(false)} />
      )}
      {picker && (
        <PickerSheet
          selected={state.selected}
          events={shown}
          onPick={(d) => {
            setState((s) => ({ ...s, selected: fromIso(d), cursor: fromIso(d) }));
            setPicker(false);
          }}
          onToday={() => {
            const t = today();
            setState((s) => ({ ...s, cursor: t, selected: new Date(t) }));
            setPicker(false);
          }}
          onClose={() => setPicker(false)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: N.ground },
  frame: { flex: 1, minHeight: 0, backgroundColor: N.frame },
  // B artboard: the app sits in a column inset 24px, ruled left and right.
  frameDesktop: { marginHorizontal: 24, borderLeftWidth: 1, borderRightWidth: 1, borderColor: N.line },
  row: { flex: 1, minHeight: 0, flexDirection: 'row' },
  main: { flex: 1, minWidth: 0, minHeight: 0 },
  grid: { flex: 1, minHeight: 0 },
});
