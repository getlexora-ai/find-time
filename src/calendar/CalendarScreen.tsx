import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { byDate, useCalEvents } from './cal-store';
import { addDays, addMonths, fromIso, iso, isoWeek, MO, sameDay, startOfWeek, wdIndex, WD_LONG } from './cal-date';
import { AiPanel } from './components/AiPanel';
import { ComposeSheet } from './components/ComposeSheet';
import { ConflictBanner } from './components/ConflictBanner';
import { DayView } from './components/DayView';
import { EventDetail } from './components/EventDetail';
import { Frame } from './components/Frame';
import { Header } from './components/Header';
import { Marquee } from './components/Marquee';
import { MobileNav } from './components/MobileNav';
import { MonthView } from './components/MonthView';
import { PickerSheet } from './components/PickerSheet';
import { Sidebar } from './components/Sidebar';
import { Skeleton } from './components/Skeleton';
import { TelemetryColumn } from './components/TelemetryColumn';
import { ThemeMenu } from './components/ThemeMenu';
import { useToast } from './components/Toast';
import { Toolbar } from './components/Toolbar';
import { WeekView } from './components/WeekView';
import { TODAY } from './seed';
import type { CalActions, CalState, PointAnchor, ViewKind } from './state';
import { DESKTOP_BP } from './tokens';
import { useResponsive } from './useResponsive';

export function CalendarScreen() {
  const events = useCalEvents();
  const toast = useToast();
  const { width, isDesktop, isWide, isPhone } = useResponsive();

  const [state, setState] = useState<CalState>(() => ({
    view: width < DESKTOP_BP ? 'week' : 'month',
    cursor: new Date(TODAY),
    selected: new Date(TODAY),
    loading: false,
  }));

  const [themeMenu, setThemeMenu] = useState(false);
  const [compose, setCompose] = useState<{ id: number | null; date: string; at: string } | null>(null);
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
        setState((s) => ({ ...s, cursor: new Date(TODAY), selected: new Date(TODAY) }));
        toast('Back to today, Wed 9 Sep');
      },
      pick: (dateIso, fromMonthTile) =>
        setState((s) => {
          const d = fromIso(dateIso);
          if (s.view === 'month' && width >= DESKTOP_BP && fromMonthTile)
            return { ...s, selected: d, cursor: new Date(d), view: 'day' };
          return { ...s, selected: d, cursor: new Date(d) };
        }),
      openCompose: (id, date, at) =>
        setState((s) => {
          setCompose({ id, date: date ?? iso(s.selected), at: at ?? '09:00' });
          return s;
        }),
      openEvent: (id, anchor) => setDetail({ id, anchor: anchor ?? null }),
      openAI: (prefill) => setAi({ prefill }),
      openPicker: () => setPicker(true),
      toast,
    }),
    [step, toast, width],
  );

  /* ── derived toolbar copy (calendar.html render()) ── */
  const { eyebrow, title, sub } = useMemo(() => {
    const c = state.cursor;
    const s = state.selected;
    const wkStart = startOfWeek(c);
    if (state.view === 'month') {
      const n = events.filter(
        (e) => fromIso(e.date).getMonth() === c.getMonth() && fromIso(e.date).getFullYear() === c.getFullYear(),
      ).length;
      return {
        title: `${MO[c.getMonth()]} ${c.getFullYear()}`,
        eyebrow: `${MO[c.getMonth()].slice(0, 3).toUpperCase()} ${c.getFullYear()} · ${n} events · ${n ? '1 conflict' : 'no conflicts'}`,
        sub: n
          ? 'Sep 7 – 13 is your densest week. Three focus blocks are protected and one clash needs a decision.'
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
        eyebrow: `Week ${isoWeek(wkStart)} · ${n} events · ${n ? '1 conflict' : 'no conflicts'}`,
        sub: 'Wednesday is over capacity. Thursday morning is the only clean two-hour run left.',
      };
    }
    const doy = Math.round((s.getTime() - new Date(s.getFullYear(), 0, 0).getTime()) / 86400000);
    const n = byDate(events, iso(s)).length;
    return {
      title: `${WD_LONG[wdIndex(s)]} ${s.getDate()} ${MO[s.getMonth()]}`,
      eyebrow: `Day ${doy} · ${n} blocks · energy 78`,
      sub: sameDay(s, TODAY)
        ? 'Three focused hours are still available before the afternoon dip.'
        : 'Planned around your energy curve and the deadlines behind each project.',
    };
  }, [state.view, state.cursor, state.selected, events]);

  const hasConflict = useMemo(() => {
    const c = state.cursor;
    const wkStart = startOfWeek(c);
    if (state.view === 'day') return byDate(events, iso(state.selected)).some((e) => e.conflict);
    if (state.view === 'week')
      return events.some((e) => e.conflict && fromIso(e.date) >= wkStart && fromIso(e.date) <= addDays(wkStart, 6));
    return events.some((e) => e.conflict && fromIso(e.date).getMonth() === c.getMonth());
  }, [state.view, state.cursor, state.selected, events]);

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
        toast('Search events, projects, and free windows');
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
      <Marquee />
      <View style={styles.rowWrap}>
        <View style={styles.row}>
          {isDesktop && (
            <Sidebar selected={state.selected} events={events} onPick={(d) => actions.pick(d)} />
          )}
          {isWide && <TelemetryColumn />}
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
                  onResolve={() => actions.openAI("Fix the clash on Wednesday at 11:00")}
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
          key={compose.id ?? `new-${compose.date}-${compose.at}`}
          composeId={compose.id}
          defaultDate={compose.date}
          defaultStart={compose.at}
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
          onApplied={() => {
            setState((s) => ({
              ...s,
              view: 'week',
              cursor: new Date(2026, 8, 10),
              selected: new Date(2026, 8, 10),
            }));
            toast('3 changes applied · 0 conflicts');
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
            setState((s) => ({ ...s, cursor: new Date(TODAY), selected: new Date(TODAY) }));
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
