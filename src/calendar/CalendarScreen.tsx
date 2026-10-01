import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { syncNow, useAccounts } from './account-store';
import { useCalEvents } from './cal-store';
import { addDays, fromIso, fromMin, iso, MO, startOfWeek, today, WD_LONG, wdIndex } from './cal-date';
import { AiPanel } from './components/AiPanel';
import { CommandBar } from './components/CommandBar';
import { ComposeSheet, firstFree } from './components/ComposeSheet';
import { DayView } from './components/DayView';
import { EventDetail } from './components/EventDetail';
import { EventList } from './components/EventList';
import { FilterSheet } from './components/FilterSheet';
import { Insights } from './components/Insights';
import { MobileNav, NAV_H } from './components/MobileNav';
import { PickerSheet } from './components/PickerSheet';
import { QuickCreate } from './components/QuickCreate';
import { useToast } from './components/Toast';
import { WeekView } from './components/WeekView';
import { getHours, useHours, workFor } from './hours';
import { computeKpis, slicesIn } from './kpi';
import type { CalActions, CalState, ComposePreset, Page, PointAnchor, Slot, ViewKind } from './state';
import { N } from './tokens';
import type { CalEvent, EventKind } from './types';
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

/** The heading over the grid: "October 2026", "Sep – Oct 2026", "Thursday 1 October". */
function titleFor(view: ViewKind, cursor: Date, selected: Date) {
  if (view === 'day') return `${WD_LONG[wdIndex(selected)]} ${selected.getDate()} ${MO[selected.getMonth()]}`;
  const a = startOfWeek(cursor);
  const b = addDays(a, 6);
  if (a.getMonth() === b.getMonth()) return `${MO[a.getMonth()]} ${a.getFullYear()}`;
  const short = (d: Date) => MO[d.getMonth()].slice(0, 3);
  if (a.getFullYear() === b.getFullYear()) return `${short(a)} – ${short(b)} ${b.getFullYear()}`;
  return `${short(a)} ${a.getFullYear()} – ${short(b)} ${b.getFullYear()}`;
}

/** Insights is about a span, not a month: "Week of 28 Sep", "Thursday 1 October". */
function insightsTitle(view: ViewKind, cursor: Date, selected: Date) {
  if (view === 'day') return titleFor(view, cursor, selected);
  const a = startOfWeek(cursor);
  return `Week of ${a.getDate()} ${MO[a.getMonth()].slice(0, 3)}`;
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
  const events = useMemo(
    () => (hidden.size ? shown.filter((e) => !hidden.has(e.kind)) : shown),
    [shown, hidden],
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
  const [picker, setPicker] = useState<{ anchor: PointAnchor | null } | null>(null);
  const [filters, setFilters] = useState<{ anchor: PointAnchor | null } | null>(null);

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
      closeAI: () => setAi(null),
      openPicker: (anchor) => setPicker({ anchor: anchor ?? null }),
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
  const title = titleFor(state.view, state.cursor, state.selected);
  const proposals = useMemo(
    () => events.filter((e) => e.kind === 'ai' && days.includes(e.date)),
    [events, days],
  );
  const [page, setPage] = useState<Page>('planner');

  /* ── web keyboard ── */
  // The docked AI panel is part of the page on desktop: arrows and T still work beside it.
  const anyOpen = !!(compose || detail || quick || list || (ai && !isDesktop) || picker || filters);
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
        setPicker(null);
        setFilters(null);
        return;
      }
      if (anyOpen) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'w') {
        setPage('planner');
        actions.setView('week');
      }
      if (k === 'd') {
        setPage('planner');
        actions.setView('day');
      }
      if (k === 'i') setPage((p) => (p === 'insights' ? 'planner' : 'insights'));
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

  /**
   * Move one that can move — not imported, not protected — out of a clash.
   * Nothing the AI may move: show the clash so you can decide.
   */
  const resolvePair = (pair: { a: CalEvent; b: CalEvent }) => {
    const both = [pair.b, pair.a];
    const movable = both.find((e) => !e.imported && e.kind !== 'focus');
    if (movable) return actions.openCompose(movable.id, undefined, undefined, true);
    actions.openEvent((both.find((e) => !e.imported) ?? both[0]).id);
  };

  const aiPanel = ai ? (
    <AiPanel
      key={ai.prefill ?? 'blank'}
      prefill={ai.prefill}
      onClose={() => setAi(null)}
      onApplied={(firstISO, count, asked) => {
        if (firstISO && count) {
          const d = new Date(firstISO);
          const day = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
          setPage('planner');
          setState((s) => ({ ...s, view: 'week', cursor: day, selected: new Date(day) }));
        }
        if (!count) toast(asked ? 'Could not save those blocks — check your connection.' : 'Nothing to add');
        else if (asked && count < asked) toast(`Only ${count} of ${asked} blocks saved — check your connection.`);
        else toast(`${count} block${count > 1 ? 's' : ''} added to your calendar`);
      }}
      toast={toast}
    />
  ) : null;

  const grid =
    state.view === 'week' ? (
      <WeekView state={state} actions={actions} events={events} selectedId={selectedId} clashIds={clashes.ids} />
    ) : (
      <DayView state={state} actions={actions} events={events} selectedId={selectedId} clashIds={clashes.ids} />
    );

  return (
    <SafeAreaView style={styles.root} edges={['top']} nativeID="ft-calendar">
      {(() => {
        const bar = (part?: 'app' | 'tools') => (
          <CommandBar
            state={state}
            actions={actions}
            page={page}
            onPage={setPage}
            title={page === 'insights' ? insightsTitle(state.view, state.cursor, state.selected) : title}
            needsYou={clashes.pairs.length + proposals.length}
            onShow={(anchor) => setFilters({ anchor: anchor ?? null })}
            part={part}
            aiOpen={!!ai}
          />
        );
        const body = (
          <View style={[styles.main, !isDesktop && { paddingBottom: NAV_H + Math.max(10, insets.bottom) }]}>
            {page === 'insights' ? (
              <Insights
                k={kpis}
                clashes={clashes.pairs}
                proposals={proposals}
                scope={state.view === 'day' ? 'today' : 'this week'}
                actions={actions}
                onResolve={resolvePair}
              />
            ) : (
              <View style={[styles.grid, isDesktop && styles.gridDesktop]}>{grid}</View>
            )}
          </View>
        );
        if (!isDesktop) return (
          <>
            {bar()}
            {body}
          </>
        );
        // Desktop: the app bar spans the page; the AI panel docks beside the toolbar and the grid.
        return (
          <>
            {bar('app')}
            <View style={styles.row}>
              <View style={styles.main}>
                {bar('tools')}
                {body}
              </View>
              {ai && aiPanel}
            </View>
          </>
        );
      })()}

      {!isDesktop && (
        <MobileNav
          view={state.view}
          page={page}
          onSetView={(v) => {
            setPage('planner');
            actions.setView(v);
          }}
          onCompose={() => actions.openCompose(null)}
          onOpenAI={() => actions.openAI()}
          onInsights={() => setPage('insights')}
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
      {ai && !isDesktop && aiPanel}
      {filters && (
        <FilterSheet
          events={shown}
          hidden={hidden}
          onToggleKind={toggleKind}
          anchor={filters.anchor}
          onClose={() => setFilters(null)}
        />
      )}
      {picker && (
        <PickerSheet
          anchor={picker.anchor}
          selected={state.selected}
          events={shown}
          onPick={(d) => {
            setState((s) => ({ ...s, selected: fromIso(d), cursor: fromIso(d) }));
            setPicker(null);
          }}
          onToday={() => {
            const t = today();
            setState((s) => ({ ...s, cursor: t, selected: new Date(t) }));
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: N.surface },
  main: { flex: 1, minWidth: 0, minHeight: 0 },
  row: { flex: 1, minHeight: 0, flexDirection: 'row' },
  grid: { flex: 1, minHeight: 0 },
  // The grid sits on the page as one card, ruled once — no frame, no brackets.
  gridDesktop: { marginHorizontal: 20, marginBottom: 20, borderWidth: 1, borderColor: N.line, borderRadius: 12, overflow: 'hidden' },
});
