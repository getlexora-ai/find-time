import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { byDate, useCalEvents } from './cal-store';
import { syncNow, useAccounts } from './account-store';
import {
  addDays,
  addMonths,
  fromIso,
  iso,
  isoWeek,
  MO,
  sameDay,
  startOfWeek,
  today,
  toMin,
  WD,
  wdIndex,
  WD_LONG,
} from './cal-date';
import { AiPanel } from './components/AiPanel';
import { ComposeSheet } from './components/ComposeSheet';
import { ConflictBanner } from './components/ConflictBanner';
import { DayView } from './components/DayView';
import { EventDetail } from './components/EventDetail';
import { Frame } from './components/Frame';
import { Header } from './components/Header';
import { MobileNav } from './components/MobileNav';
import { MonthView } from './components/MonthView';
import { PickerSheet } from './components/PickerSheet';
import { Sidebar } from './components/Sidebar';
import { Skeleton } from './components/Skeleton';
import { ThemeMenu } from './components/ThemeMenu';
import { useToast } from './components/Toast';
import { Toolbar } from './components/Toolbar';
import { WeekView } from './components/WeekView';
import type { CalActions, CalState, PointAnchor, ViewKind } from './state';
import type { CalEvent } from './types';
import { DESKTOP_BP } from './tokens';
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
  const events = useCalEvents();
  const toast = useToast();
  const { width, isDesktop, isPhone } = useResponsive();
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

  const [state, setState] = useState<CalState>(() => ({
    view: width < DESKTOP_BP ? 'week' : 'month',
    cursor: today(),
    selected: today(),
    loading: false,
  }));

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
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (loadTimer.current != null) clearTimeout(loadTimer.current);
    },
    [],
  );

  const step = useCallback(
    (dir: -1 | 1) => {
      setState((s) => ({ ...s, loading: true }));
      if (loadTimer.current) clearTimeout(loadTimer.current);
      loadTimer.current = setTimeout(() => {
        setState((s) => {
          if (s.view === 'month') return { ...s, loading: false, cursor: addMonths(s.cursor, dir) };
          if (s.view === 'week')
            return { ...s, loading: false, cursor: addDays(s.cursor, dir * 7), selected: addDays(s.selected, dir * 7) };
          return { ...s, loading: false, cursor: addDays(s.cursor, dir), selected: addDays(s.selected, dir) };
        });
      }, 280);
    },
    [],
  );

  const actions = useMemo<CalActions>(
    () => ({
      setView: (v: ViewKind) => setState((s) => ({ ...s, view: v })),
      step,
      goToday: () => {
        const t = today();
        setState((s) => ({ ...s, cursor: t, selected: new Date(t) }));
        toast(`Back to today, ${WD[wdIndex(t)]} ${t.getDate()} ${MO[t.getMonth()].slice(0, 3)}`);
      },
      pick: (dateIso, fromMonthTile) =>
        setState((s) => {
          const d = fromIso(dateIso);
          if (s.view === 'month' && width >= DESKTOP_BP && fromMonthTile)
            return { ...s, selected: d, cursor: new Date(d), view: 'day' };
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
    [step, toast, width],
  );

  /* ── real clashes, scoped to whatever the toolbar is showing ── */
  const conflicts = useMemo(() => overlapping(events), [events]);
  const scopedConflicts = useMemo(() => {
    const c = state.cursor;
    const wkStart = startOfWeek(c);
    const wkEnd = addDays(wkStart, 6);
    return conflicts.filter(({ a }) => {
      const d = fromIso(a.date);
      if (state.view === 'day') return a.date === iso(state.selected);
      if (state.view === 'week') return d >= wkStart && d <= wkEnd;
      return d.getMonth() === c.getMonth() && d.getFullYear() === c.getFullYear();
    });
  }, [conflicts, state.view, state.cursor, state.selected]);

  const clashTxt = (n: number) => (n ? `${n} clash${n > 1 ? 'es' : ''}` : 'no conflicts');

  /* ── derived toolbar copy ── */
  const { eyebrow, title, sub } = useMemo(() => {
    const c = state.cursor;
    const s = state.selected;
    const wkStart = startOfWeek(c);
    const nClash = scopedConflicts.length;
    if (state.view === 'month') {
      const n = events.filter(
        (e) => fromIso(e.date).getMonth() === c.getMonth() && fromIso(e.date).getFullYear() === c.getFullYear(),
      ).length;
      return {
        title: `${MO[c.getMonth()]} ${c.getFullYear()}`,
        eyebrow: `${MO[c.getMonth()].slice(0, 3).toUpperCase()} ${c.getFullYear()} · ${n} events · ${clashTxt(nClash)}`,
        sub: n
          ? `${n} block${n > 1 ? 's' : ''} this month${nClash ? `, ${clashTxt(nClash)} to resolve` : ', nothing double-booked'}.`
          : 'Nothing scheduled yet. A clean month is a planning opportunity, not a problem.',
      };
    }
    if (state.view === 'week') {
      const e2 = addDays(wkStart, 6);
      const n = events.filter((e) => {
        const d = fromIso(e.date);
        return d >= wkStart && d <= e2;
      }).length;
      return {
        title: `${MO[wkStart.getMonth()].slice(0, 3)} ${wkStart.getDate()} – ${MO[e2.getMonth()].slice(0, 3)} ${e2.getDate()}`,
        eyebrow: `Week ${isoWeek(wkStart)} · ${n} events · ${clashTxt(nClash)}`,
        sub: n
          ? `${n} block${n > 1 ? 's' : ''} this week${nClash ? `, ${clashTxt(nClash)} to resolve` : ', none overlapping'}.`
          : 'This week is empty. Tell Find time what it needs to make room for.',
      };
    }
    const doy = Math.round((s.getTime() - new Date(s.getFullYear(), 0, 0).getTime()) / 86400000);
    const n = byDate(events, iso(s)).length;
    return {
      title: `${WD_LONG[wdIndex(s)]} ${s.getDate()} ${MO[s.getMonth()]}`,
      eyebrow: `Day ${doy} · ${n} block${n === 1 ? '' : 's'} · ${clashTxt(nClash)}`,
      sub: sameDay(s, today())
        ? n
          ? 'Today as it stands. Anything flexible can still be moved.'
          : 'Nothing booked today. That is space, not a gap.'
        : n
          ? 'Planned around what was already on this day.'
          : 'Nothing booked on this day yet.',
    };
  }, [state.view, state.cursor, state.selected, events, scopedConflicts]);

  const hasConflict = scopedConflicts.length > 0;

  /* ── web keyboard shortcuts (spec §5) ── */
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCompose(null);
        setAi(null);
        setDetail(null);
        setThemeMenu(false);
        setPicker(false);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toast('Search is not built yet');
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'm') actions.setView('month');
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
  }, [actions, toast]);

  const pad = isPhone ? 16 : isDesktop ? 32 : 24;
  const detailEvent = detail ? events.find((e) => e.id === detail.id) ?? null : null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Frame />
      <View style={styles.rowWrap}>
        <View style={styles.row}>
          {isDesktop && (
            <Sidebar selected={state.selected} events={events} onPick={(d) => actions.pick(d)} />
          )}
          <View style={styles.main}>
            <Header
              onOpenTheme={() => setThemeMenu(true)}
              onOpenAI={() => actions.openAI()}
            />
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: pad, paddingBottom: isDesktop ? 32 : 112 }}>
              <Toolbar state={state} actions={actions} eyebrow={eyebrow} title={title} sub={sub} />
              {hasConflict && (
                <ConflictBanner
                  a={scopedConflicts[0].a}
                  b={scopedConflicts[0].b}
                  onResolve={() => actions.openCompose(scopedConflicts[0].b.id, undefined, undefined, true)}
                />
              )}
              {state.loading ? (
                <Skeleton />
              ) : state.view === 'month' ? (
                <MonthView state={state} actions={actions} events={events} />
              ) : state.view === 'week' ? (
                <WeekView state={state} actions={actions} events={events} />
              ) : (
                <DayView state={state} actions={actions} events={events} />
              )}
            </ScrollView>
          </View>
        </View>
      </View>

      {/* calendar.html shows this fixed 5-item nav at every width below lg */}
      {!isDesktop && (
        <MobileNav onCompose={() => actions.openCompose(null)} onOpenAI={() => actions.openAI()} />
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
  rowWrap: { flex: 1, alignItems: 'center' },
  row: { flex: 1, flexDirection: 'row', width: '100%', maxWidth: 1720 },
  main: { flex: 1, minWidth: 0 },
});
