import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCalEvents } from './cal-store';
import { syncNow, useAccounts } from './account-store';
import {
  addDays,
  fromIso,
  iso,
  MO,
  startOfWeek,
  today,
  toMin,
  WD,
  wdIndex,
  WD_LONG,
} from './cal-date';
import { AiPanel } from './components/AiPanel';
import { CommandBar } from './components/CommandBar';
import { ComposeSheet } from './components/ComposeSheet';
import { ConflictBanner } from './components/ConflictBanner';
import { DayView } from './components/DayView';
import { EventDetail } from './components/EventDetail';
import { FilterSheet } from './components/FilterSheet';
import { Frame } from './components/Frame';
import { KpiStrip } from './components/KpiStrip';
import { MobileNav, NAV_H } from './components/MobileNav';
import { PickerSheet } from './components/PickerSheet';
import { Sidebar } from './components/Sidebar';
import { Skeleton } from './components/Skeleton';
import { ThemeMenu } from './components/ThemeMenu';
import { useToast } from './components/Toast';
import { WeekView } from './components/WeekView';
import { computeKpis } from './kpi';
import type { CalActions, CalState, PointAnchor, ViewKind } from './state';
import type { CalEvent, EventKind } from './types';
import { useResponsive } from './useResponsive';

/**
 * Real conflicts: two non-break blocks on the same day whose times overlap.
 * This used to be a `conflict: true` flag that only the seed fixtures carried —
 * so a real calendar never showed a clash, while the toolbar printed a
 * hardcoded "1 conflict" for any month that had events in it at all.
 */
function overlapping(list: CalEvent[]): { a: CalEvent; b: CalEvent }[] {
  const out: { a: CalEvent; b: CalEvent }[] = [];
  const byDay = new Map<string, CalEvent[]>();
  for (const e of list) {
    if (e.kind === 'break') continue;
    const arr = byDay.get(e.date);
    if (arr) arr.push(e);
    else byDay.set(e.date, [e]);
  }
  for (const day of byDay.values()) {
    const sorted = [...day].sort((x, y) => toMin(x.start) - toMin(y.start));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (toMin(sorted[j].start) < toMin(sorted[i].end)) out.push({ a: sorted[i], b: sorted[j] });
      }
    }
  }
  return out;
}

export function CalendarScreen() {
  const all = useCalEvents();
  const toast = useToast();
  const { isDesktop, isPhone } = useResponsive();
  const insets = useSafeAreaInsets();
  const { signedIn } = useAccounts();

  // Pull Google Calendar on mount (throttled in the store) and once we're signed in.
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

  /**
   * Week is the only sensible landing view now that month is gone. Month was a
   * density map you could not act on: it showed which days were busy and hid
   * every time, so the first thing you did on opening the app was leave it.
   */
  const [state, setState] = useState<CalState>(() => ({
    view: 'week',
    cursor: today(),
    selected: today(),
    loading: false,
  }));

  /**
   * Kinds hidden from every surface. The sidebar legend doubles as the filter,
   * which is what makes the taxonomy worth having: "show me only what I
   * committed to" and "hide the routines" are one click each.
   */
  const [hidden, setHidden] = useState<Set<EventKind>>(() => new Set());
  const events = useMemo(
    () => (hidden.size ? all.filter((e) => !hidden.has(e.kind)) : all),
    [all, hidden],
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

  const [themeMenu, setThemeMenu] = useState(false);
  const [compose, setCompose] = useState<{
    id: number | null;
    date: string;
    at: string;
    autoPlace?: boolean;
  } | null>(null);
  const [detail, setDetail] = useState<{ id: number; anchor: PointAnchor | null } | null>(null);
  const [ai, setAi] = useState<{ prefill?: string } | null>(null);
  const [picker, setPicker] = useState(false);
  const [filters, setFilters] = useState(false);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (loadTimer.current != null) clearTimeout(loadTimer.current);
    },
    [],
  );

  const step = useCallback((dir: -1 | 1) => {
    setState((s) => ({ ...s, loading: true }));
    if (loadTimer.current) clearTimeout(loadTimer.current);
    loadTimer.current = setTimeout(() => {
      setState((s) => {
        const n = s.view === 'week' ? dir * 7 : dir;
        return {
          ...s,
          loading: false,
          cursor: addDays(s.cursor, n),
          selected: addDays(s.selected, n),
        };
      });
    }, 200);
  }, []);

  const actions = useMemo<CalActions>(
    () => ({
      setView: (v: ViewKind) => setState((s) => ({ ...s, view: v })),
      step,
      goToday: () => {
        const t = today();
        setState((s) => ({ ...s, cursor: t, selected: new Date(t) }));
        toast(`Back to today, ${WD[wdIndex(t)]} ${t.getDate()} ${MO[t.getMonth()].slice(0, 3)}`);
      },
      pick: (dateIso) =>
        setState((s) => {
          const d = fromIso(dateIso);
          return { ...s, selected: d, cursor: new Date(d) };
        }),
      openCompose: (id, date, at, autoPlace) =>
        setState((s) => {
          setCompose({ id, date: date ?? iso(s.selected), at: at ?? '09:00', autoPlace });
          return s;
        }),
      openEvent: (id, anchor) => setDetail({ id, anchor: anchor ?? null }),
      openAI: (prefill) => setAi({ prefill }),
      openPicker: () => setPicker(true),
      toast,
    }),
    [step, toast],
  );

  /**
   * The exact days on screen. One list drives the conflict scope, the KPI panel
   * and nothing else — which is what keeps the panel honest: it can only ever
   * describe the same days the grid is drawing.
   */
  const days = useMemo(() => {
    if (state.view === 'day') return [iso(state.selected)];
    const s = startOfWeek(state.cursor);
    return Array.from({ length: 7 }, (_, i) => iso(addDays(s, i)));
  }, [state.view, state.cursor, state.selected]);

  /* ── real clashes, scoped to whatever the bar is showing ── */
  const conflicts = useMemo(() => overlapping(events), [events]);
  const scopedConflicts = useMemo(
    () => conflicts.filter(({ a }) => days.includes(a.date)),
    [conflicts, days],
  );

  const kpis = useMemo(
    () => computeKpis(events, days, scopedConflicts.length),
    [events, days, scopedConflicts.length],
  );

  /**
   * The bar's title. The eyebrow ("SEP 2026 · 14 events · no conflicts") and
   * the sentence of prose under it are gone — both restated counts the grid
   * already shows, and between them they pushed the calendar ~120px down.
   */
  const title = useMemo(() => {
    const s = state.selected;
    if (state.view === 'week') {
      const wkStart = startOfWeek(state.cursor);
      const e2 = addDays(wkStart, 6);
      return `${MO[wkStart.getMonth()].slice(0, 3)} ${wkStart.getDate()} – ${MO[e2.getMonth()].slice(0, 3)} ${e2.getDate()}`;
    }
    // "Monday 14 September" elides to "Monday 14 Septemb…" in a phone bar, which
    // loses the month — the one part of it you cannot infer from the grid.
    if (isPhone) return `${WD[wdIndex(s)]} ${s.getDate()} ${MO[s.getMonth()].slice(0, 3)}`;
    return `${WD_LONG[wdIndex(s)]} ${s.getDate()} ${MO[s.getMonth()]}`;
  }, [state.view, state.cursor, state.selected, isPhone]);

  const hasConflict = scopedConflicts.length > 0;

  /* ── web keyboard shortcuts ── */
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCompose(null);
        setAi(null);
        setDetail(null);
        setThemeMenu(false);
        setPicker(false);
        setFilters(false);
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'w') actions.setView('week');
      if (k === 'd') actions.setView('day');
      if (k === 't') actions.goToday();
      if (k === 'n') {
        e.preventDefault();
        actions.openCompose(null);
      }
      if (e.key === 'ArrowLeft') actions.step(-1);
      if (e.key === 'ArrowRight') actions.step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions]);

  const detailEvent = detail ? all.find((e) => e.id === detail.id) ?? null : null;

  const grid = state.loading ? (
    <Skeleton />
  ) : state.view === 'week' ? (
    <WeekView state={state} actions={actions} events={events} />
  ) : (
    <DayView state={state} actions={actions} events={events} />
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Frame />
      <View style={styles.row}>
        {isDesktop && (
          <Sidebar
            selected={state.selected}
            events={all}
            hidden={hidden}
            onToggleKind={toggleKind}
            onPick={(d) => actions.pick(d)}
          />
        )}
        <View style={styles.main}>
          <CommandBar
            state={state}
            actions={actions}
            title={title}
            onOpenTheme={() => setThemeMenu(true)}
          />

          {/*
            The instrument panel. It sits between the bar and the grid because
            it is a reading of the period the bar names and the grid draws —
            the one place the whole week answers "where am I" before you start
            parsing blocks.
          */}
          <KpiStrip
            k={kpis}
            onResolve={
              hasConflict
                ? () => actions.openCompose(scopedConflicts[0].b.id, undefined, undefined, true)
                : undefined
            }
          />

          {hasConflict && (
            <View style={styles.bannerWrap}>
              <ConflictBanner
                a={scopedConflicts[0].a}
                b={scopedConflicts[0].b}
                onResolve={() => actions.openCompose(scopedConflicts[0].b.id, undefined, undefined, true)}
              />
            </View>
          )}

          {/*
            The grid IS the page, at every width. It fills whatever is left
            below the bar rather than living inside a padded scroll view sized
            to 58% of the window, which is what kept the week grid at roughly
            half the screen no matter how tall the display was.

            The phone used to put the whole surface — KPI panel included —
            inside a page ScrollView, so the instrument panel scrolled away and
            the calendar was a short window in the middle of a long page. Now
            only the hours scroll, exactly as on desktop, and the panel above
            them stays put. The bottom padding is the nav's own height, so the
            last hour of the day is never parked underneath it.
          */}
          <View
            style={[
              styles.gridFill,
              isPhone && styles.gridFillPhone,
              hasConflict && styles.gridFillTight,
              !isDesktop && { paddingBottom: NAV_H + Math.max(12, insets.bottom) },
            ]}>
            {grid}
          </View>
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

      <ThemeMenu visible={themeMenu} onClose={() => setThemeMenu(false)} />
      {compose && (
        <ComposeSheet
          key={`${compose.id ?? 'new'}-${compose.date}-${compose.at}-${compose.autoPlace ? 'ai' : ''}`}
          composeId={compose.id}
          defaultDate={compose.date}
          defaultStart={compose.at}
          autoPlace={compose.autoPlace}
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
          isDesktop={isDesktop}
          onClose={() => setDetail(null)}
          actions={actions}
        />
      )}
      {ai && (
        <AiPanel
          key={ai.prefill ?? 'blank'}
          prefill={ai.prefill}
          onClose={() => setAi(null)}
          onApplied={(firstISO, count, asked) => {
            if (firstISO && count) {
              const d = new Date(firstISO);
              const day = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
              setState((s) => ({ ...s, view: 'week', cursor: day, selected: new Date(day) }));
            }
            if (!count) toast(asked ? 'Could not save those blocks — check your connection.' : 'Nothing to add');
            else if (asked && count < asked) toast(`Only ${count} of ${asked} blocks saved — check your connection.`);
            else toast(`${count} block${count > 1 ? 's' : ''} added to your calendar`);
          }}
          toast={toast}
        />
      )}
      {filters && (
        <FilterSheet
          events={all}
          hidden={hidden}
          onToggleKind={toggleKind}
          onOpenTheme={() => {
            setFilters(false);
            setThemeMenu(true);
          }}
          onClose={() => setFilters(false)}
        />
      )}
      {picker && (
        <PickerSheet
          cursor={state.cursor}
          selected={state.selected}
          events={events}
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
  root: { flex: 1 },
  row: { flex: 1, flexDirection: 'row', width: '100%' },
  main: { flex: 1, minWidth: 0 },
  gridFill: { flex: 1, minHeight: 0, padding: 14 },
  gridFillPhone: { padding: 8 },
  // The banner already carries its own bottom margin; don't pay for it twice.
  gridFillTight: { paddingTop: 0 },
  bannerWrap: { paddingHorizontal: 14, paddingTop: 14 },
});
