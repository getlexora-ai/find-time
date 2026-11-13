import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { connect, setCalRead, syncNow, useAccounts } from '@/calendar/account-store';
import { sendMessage } from '@/calendar/agent-store';
import { addDays, iso, MO, nowMin, startOfWeek, toMin, WD_LONG, wdIndex } from '@/calendar/cal-date';
import { refresh, useCalEvents, useCalLoad } from '@/calendar/cal-store';
import { AccountButton } from '@/calendar/components/AccountButton';
import { useHours, workFor, type Hours } from '@/calendar/hours';
import { addPreviewTask, finishTask, isPreviewTasks, refreshTasks, stopHabit, useTasks } from '@/calendar/tasks-store';
import type { CalEvent } from '@/calendar/types';
import { apiFetch } from '@/lib/api';
import type { ApiTask } from '@/lib/api-types';

import './prism.css';
// after prism.css: the chat's narrow-screen layout overrides the work row's
import { AiPanel, dayOf } from './Ai.web';
import { paintScene } from './scene';
import { calLooks, lookOf } from './cal-look';
import { cls, endTaskDrag, LBL, startTaskDrag, Week, type TaskPick, type Toast } from './Week.web';

type Page = 'planner' | 'tasks' | 'insights' | 'habits';
const DRAWER_KEY = 'ft.px.drawer';
const AI_KEY = 'ft.px.ai';

/* ───────────────────────── helpers ───────────────────────── */

const hm = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h && m ? `${h} h ${String(m).padStart(2, '0')}` : h ? `${h} h` : `${m} min`;
};
const lenOf = (min: number) => (min <= 0 ? '–' : min < 60 ? `${min}m` : `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}`);

/** Busy minutes inside [a,b) on `day`: union of timed events (proposals don't count). */
function busyIn(events: CalEvent[], day: string, a: number, b: number): number {
  const spans = events
    .filter((e) => e.date === day && !e.allDay && e.kind !== 'ai')
    .map((e) => [Math.max(a, toMin(e.start)), Math.min(b, toMin(e.end))] as const)
    .filter(([s, t]) => t > s)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let end = a;
  for (const [s, t] of spans) {
    if (t <= end) continue;
    total += t - Math.max(s, end);
    end = t;
  }
  return total;
}
/** Free working minutes on `d`. A public holiday (`off`) is a day off: no working time, as the planner sees it. */
const freeOn = (events: CalEvent[], hours: Hours, d: Date, off?: ReadonlySet<string>) => {
  if (off?.has(iso(d))) return 0;
  const w = workFor(hours, wdIndex(d));
  if (!w) return 0;
  return Math.max(0, (w.end - w.start) * 60 - busyIn(events, iso(d), w.start * 60, w.end * 60));
};

const dueDate = (t: ApiTask) => (t.dueBy ? new Date(t.dueBy) : null);
const shortDay = (d: Date) => `${WD_LONG[wdIndex(d)].slice(0, 3)} ${d.getDate()} ${MO[d.getMonth()].slice(0, 3)}`;
const isOpen = (t: ApiTask) => t.status !== 'done' && t.status !== 'archived';
const pickOf = (t: ApiTask): TaskPick => ({ id: t.id, title: t.title, durationMin: t.durationMin, category: t.category });

/* ───────────────────────── icons (from the artifact) ───────────────────────── */

const I = {
  mark: (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  planner: (
    <svg viewBox="0 0 24 24" fill="none">
      <rect x="3.5" y="5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  tasks: (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="m4 7 2 2 3.5-4M4 16l2 2 3.5-4M13 7.5h7M13 16.5h7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  insights: (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M5 20V11M12 20V5M19 20v-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  ),
  habits: (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M19 12a7 7 0 1 1-2.05-4.95M19 4.5V8h-3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  left: (
    <svg viewBox="0 0 16 16" fill="none">
      <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  right: (
    <svg viewBox="0 0 16 16" fill="none">
      <path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

/* ───────────────────────── the app ───────────────────────── */

export function PrismApp() {
  const events = useCalEvents();
  const load = useCalLoad();
  const hours = useHours();
  const { tasks, habits } = useTasks();
  const { signedIn, accounts } = useAccounts();

  const [page, setPage] = useState<Page>(() => {
    const p = new URLSearchParams(window.location.search).get('page');
    return p === 'tasks' || p === 'insights' || p === 'habits' ? p : 'planner';
  });
  const [drawer, setDrawer] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DRAWER_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [cursor, setCursor] = useState(() => new Date());
  // Plan with AI: open or closed is remembered; `aiFocus` bumps to put the cursor in its composer.
  const [aiOpen, setAiOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AI_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [aiFocus, setAiFocus] = useState(0);
  const [narrow, setNarrow] = useState(() => window.innerWidth < 760);
  const [toastMsg, setToastMsg] = useState<{ msg: string; undo?: () => void } | null>(() => {
    const p = new URLSearchParams(window.location.search).get('connect');
    return p ? { msg: p === 'ok' ? 'Google Calendar connected' : 'Could not connect Google Calendar' } : null;
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast: Toast = useCallback((msg, undo) => {
    if (timer.current) clearTimeout(timer.current);
    setToastMsg({ msg, undo });
    timer.current = setTimeout(() => setToastMsg(null), undo ? 6000 : 4200);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DRAWER_KEY, drawer ? '1' : '0');
    } catch {
      // private window: the drawer just opens next time
    }
  }, [drawer]);
  useEffect(() => {
    try {
      localStorage.setItem(AI_KEY, aiOpen ? '1' : '0');
    } catch {
      // private window: it just starts closed next time
    }
  }, [aiOpen]);

  useEffect(() => {
    if (signedIn) void syncNow();
  }, [signedIn]);
  useEffect(() => {
    void refreshTasks();
  }, []);

  // The outcome of the Google OAuth round-trip (?connect=ok|error): shown as the first toast.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('connect')) return;
    window.history.replaceState(null, '', window.location.pathname);
    timer.current = setTimeout(() => setToastMsg(null), 4200);
  }, []);

  useEffect(() => {
    const r = () => setNarrow(window.innerWidth < 760);
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);

  const step = narrow ? 1 : 7;
  const days = useMemo(() => {
    if (narrow) return [new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())];
    const s = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [cursor, narrow]);

  const go = useCallback((dir: number) => setCursor((c) => addDays(c, dir * step)), [step]);

  // A task picked to place by tap (touch) or keyboard; the grid's next tap on a time places it.
  const [rawPick, setPicked] = useState<TaskPick | null>(null);
  // a picked task that was finished elsewhere can't be placed
  const picked = rawPick && tasks.some((t) => t.id === rawPick.id && isOpen(t)) ? rawPick : null;
  const pickTask = (t: ApiTask) => setPicked(picked?.id === t.id ? null : pickOf(t));
  // A pick lives on the planner: leaving it drops the pick (the Tasks page's
  // "Place on calendar" picks and then comes here).
  const goPage = (p: Page) => {
    if (p !== 'planner') setPicked(null);
    setPage(p);
  };
  // The chat lives beside the week: opening it from another page comes back to the planner.
  const openAI = useCallback(() => {
    setPage('planner');
    setAiOpen(true);
    setAiFocus((n) => n + 1);
  }, []);

  // [ ] drawer · ← → week · T today. Never while typing. Esc drops a picked task
  // (unless it is closing an editor first); while one is picked the arrows move it on the grid (Week).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && picked) {
        if (!document.querySelector('.px [role="dialog"]')) setPicked(null);
        return;
      }
      if (picked && e.key.startsWith('Arrow')) return;
      const t = e.target;
      const typing = t instanceof Element && !!t.closest('input, textarea, [contenteditable], [role="listbox"], [role="dialog"]');
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        openAI();
      } else if (e.key === '[') setDrawer(false);
      else if (e.key === ']') setDrawer(true);
      else if (page === 'planner' && e.key === 'ArrowLeft') go(-1);
      else if (page === 'planner' && e.key === 'ArrowRight') go(1);
      else if (page === 'planner' && (e.key === 't' || e.key === 'T')) setCursor(new Date());
    };
    // capture: runs before an editor's own Esc closes it, so "is a dialog open" is still true
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [go, openAI, page, picked]);

  const open = tasks.filter(isOpen);
  const rangeTitle = (() => {
    const a = days[0];
    const b = days[days.length - 1];
    if (days.length === 1) return `${WD_LONG[wdIndex(a)]} ${a.getDate()} ${MO[a.getMonth()]}`;
    return a.getMonth() === b.getMonth()
      ? `${a.getDate()} – ${b.getDate()} ${MO[b.getMonth()]}`
      : `${a.getDate()} ${MO[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MO[b.getMonth()].slice(0, 3)}`;
  })();

  const calendars = accounts.flatMap((a) => a.calendars.map((c) => ({ ...c, account: a.email })));
  const looks = useMemo(() => calLooks(accounts.flatMap((a) => a.calendars)), [accounts]);
  // A calendar switched off in the drawer drops off the grid at once, before the server catches up.
  const shown = useMemo(() => {
    const off = new Set(accounts.flatMap((a) => a.calendars.filter((c) => !c.readEnabled).map((c) => c.id)));
    return off.size ? events.filter((e) => !(e.calendarId && off.has(e.calendarId))) : events;
  }, [accounts, events]);

  // Find Time is a calendar too: its own blocks (focus, routines, tasks, proposals,
  // events made here). Hiding it is a view: the planner still plans around them.
  const [ftShown, setFtShown] = useState(() => {
    try {
      return typeof window === 'undefined' || window.localStorage.getItem('ft.showFindTime') !== '0';
    } catch {
      return true;
    }
  });
  const showFindTime = (v: boolean) => {
    setFtShown(v);
    try {
      window.localStorage.setItem('ft.showFindTime', v ? '1' : '0');
    } catch {
      /* private window: remembered for this visit only */
    }
  };
  // Days covered by an all-day event from a Google holiday calendar.
  const holidayDays = useMemo(() => {
    const set = new Set<string>();
    for (const e of shown) {
      if (!e.allDay || !lookOf(e, looks)?.holiday) continue;
      const [y, m, dd] = e.date.split('-').map(Number);
      const end = e.endDate ?? iso(new Date(y, m - 1, dd + 1));
      for (let d = new Date(y, m - 1, dd); iso(d) < end; d = addDays(d, 1)) set.add(iso(d));
    }
    return set;
  }, [shown, looks]);
  const onGrid = useMemo(() => (ftShown ? shown : shown.filter((e) => e.imported)), [ftShown, shown]);

  // Write-back (scheduler_profiles.push_focus): the default for NEW blocks only — a
  // private copy on your primary Google calendar, so people booking you see it.
  // Toggling never touches existing blocks; each keeps its own choice (its editor).
  const primary = calendars.find((c) => c.isPrimary);
  const [copyOn, setCopyOn] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  useEffect(() => {
    if (!signedIn || isPreviewTasks()) return;
    apiFetch('/api/calendar/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { settings?: { pushFocus?: boolean } } | null) => b?.settings && setCopyOn(!!b.settings.pushFocus))
      .catch(() => {});
  }, [signedIn]);
  const setCopy = async (on: boolean) => {
    if (copyBusy) return;
    if (isPreviewTasks()) {
      setCopyOn(on);
      return;
    }
    setCopyBusy(true);
    try {
      const res = await apiFetch('/api/calendar/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pushFocus: on }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        toast(b.error ?? "Couldn't change that. Try again.");
        return;
      }
      setCopyOn(on);
      toast(
        on
          ? `New blocks will be copied to ${primary?.name ?? 'your Google calendar'}. Blocks you already have keep their own setting. Planned sessions the planner can still move show as free until the day before; blocks you place yourself are busy.`
          : 'New blocks stay in Find Time only. Blocks you already have keep their own setting.',
      );
      void refresh();
    } catch {
      toast("Couldn't reach Find Time. Try again.");
    } finally {
      setCopyBusy(false);
    }
  };

  const nav = (p: Page, label: string, icon: React.ReactNode, extra?: React.ReactNode) => (
    <button type="button" className="d-item" aria-current={page === p ? 'page' : undefined} title={label} onClick={() => goPage(p)}>
      {icon}
      <span className="lb">{label}</span>
      {extra}
    </button>
  );

  return (
    <div className="px">
      <div className="frame">
        <nav className={`drawer${drawer && !narrow ? ' open' : ''}`} aria-label="Find Time">
          <div className="d-top">
            <span className="d-logo">{I.mark}</span>
            <span className="d-name">Find Time</span>
            <button type="button" className="d-tog" onClick={() => setDrawer(false)} aria-label="Collapse drawer" title="Collapse  [">
              {I.left}
            </button>
          </div>
          {!narrow && (
            <button type="button" className="d-exp" onClick={() => setDrawer(true)} aria-label="Expand drawer" title="Expand  ]">
              {I.right}
            </button>
          )}
          {nav('planner', 'Planner', I.planner)}
          {nav('tasks', 'Tasks', I.tasks, open.length ? <><span className="ct">{open.length}</span><span className="bdg" /></> : null)}
          {nav('insights', 'Insights', I.insights)}
          {nav('habits', 'Habits', I.habits, habits.length ? <span className="ct">{habits.length}</span> : null)}
          <div className="d-sec">
            <h5>Calendars</h5>
            <label className="d-cal" style={{ ['--c' as string]: 'var(--focus-sw)' }} title="What Find Time made: focus, routines, tasks, proposals and events you added here">
              <input type="checkbox" checked={ftShown} onChange={() => showFindTime(!ftShown)} />
              <span>Find Time</span>
              <small>This app</small>
            </label>
            {calendars.length > 0 && (
              <label
                className="d-sub"
                title={`For new blocks only: copy them to ${primary?.name ?? 'your primary Google calendar'}, private (repeating ones stay here). Switching it never changes blocks you already have; change one block in its editor. Planned sessions the planner can still move show as free until the day before; blocks you place yourself are busy.`}>
                <input type="checkbox" role="switch" checked={copyOn} disabled={copyBusy} onChange={() => void setCopy(!copyOn)} />
                <span>Copy to Google{primary ? ` · ${primary.name}` : ''}</span>
              </label>
            )}
            {calendars.length ? (
              calendars.map((c) => (
                <label key={c.id} className="d-cal" style={{ ['--c' as string]: c.color || 'var(--event-bd)' }} title={c.account}>
                  <input
                    type="checkbox"
                    checked={c.readEnabled}
                    onChange={() => void setCalRead(c.id, !c.readEnabled).then(() => refresh())}
                  />
                  <span>{c.name}</span>
                  <small>Google</small>
                </label>
              ))
            ) : (
              <button type="button" className="d-cal" style={{ border: 0, background: 'transparent', color: 'inherit' }} onClick={() => void connect()}>
                <span className="plus" />
                Connect Google Calendar
              </button>
            )}
          </div>
          <div className="d-mini" aria-hidden>
            <i style={{ background: 'var(--focus-sw)' }} />
            {calendars.slice(0, 3).map((c) => (
              <i key={c.id} style={{ background: c.color }} />
            ))}
          </div>
          <div className="d-foot">
            <div className="d-me">
              <AccountButton showName={drawer && !narrow} />
            </div>
          </div>
        </nav>

        <div className="main">
          <Band events={shown} hours={hours} off={holidayDays} aiOpen={aiOpen && page === 'planner'} onAI={() => (aiOpen && page === 'planner' ? setAiOpen(false) : openAI())} />
          {page === 'planner' ? (
            <div className={`work${aiOpen ? ' with-ai' : ''}`}>
              <TaskColumn
                tasks={open}
                events={shown}
                hours={hours}
                off={holidayDays}
                days={days}
                toast={toast}
                picked={picked?.id ?? null}
                onPick={pickTask}
                onDragStart={() => setPicked(null)}
              />
              <section className="cal" aria-label="Week">
                <div className="cal-top">
                  <span className="m">{rangeTitle}</span>
                  <button type="button" className="ib" aria-label={narrow ? 'Previous day' : 'Previous week'} onClick={() => go(-1)}>
                    {I.left}
                  </button>
                  <button type="button" className="ib" aria-label={narrow ? 'Next day' : 'Next week'} onClick={() => go(1)}>
                    {I.right}
                  </button>
                  <button type="button" className="today-btn" onClick={() => setCursor(new Date())}>
                    Today
                  </button>
                  <div className="legend">
                    {(['focus', 'event', 'task', 'routine', 'ai'] as const).map((k) => (
                      <span key={k} title={k === 'event' ? 'An event you made in Find Time' : undefined}>
                        <i className={`ev ${k}`} style={{ position: 'static', padding: 0, width: 12, height: 9, borderRadius: 3 }} />
                        {LBL[k]}
                      </span>
                    ))}
                    {calendars.length > 0 && (
                      <span title="Events from Google take their calendar's colour">
                        <i
                          className="ev gcal"
                          style={{ position: 'static', padding: 0, width: 12, height: 9, borderLeftWidth: 2, ['--cc' as string]: primary?.color || 'var(--blue)' }}
                        />
                        Google · calendar colour
                      </span>
                    )}
                  </div>
                </div>
                {picked && (
                  <div className="pick" role="status">
                    <span>
                      Tap a time to place <b>{picked.title}</b>
                      <span className="keys"> · or arrow keys and Enter</span> · Esc to cancel
                    </span>
                    <button type="button" className="chip" onClick={() => setPicked(null)}>
                      Cancel
                    </button>
                  </div>
                )}
                {load.status === 'error' && events.length === 0 ? (
                  <div className="loading">
                    Couldn&apos;t load your calendar.{' '}
                    <button type="button" className="btn line sm" onClick={() => void refresh()}>
                      Try again
                    </button>
                  </div>
                ) : (
                  <Week
                    days={days}
                    events={onGrid}
                    hours={hours}
                    loading={load.status === 'loading'}
                    toast={toast}
                    looks={looks}
                    pick={picked}
                    onPick={setPicked}
                    // a new block on a hidden Find Time calendar would vanish at once
                    onCreated={() => !ftShown && showFindTime(true)}
                  />
                )}
              </section>
              {aiOpen && (
                <AiPanel
                  tasks={open}
                  toast={toast}
                  focusKey={aiFocus}
                  onClose={() => setAiOpen(false)}
                  // a block landed: show its day, and the Find Time calendar if it was hidden
                  onApplied={(startISO) => {
                    setCursor(dayOf(startISO));
                    if (!ftShown) showFindTime(true);
                  }}
                />
              )}
            </div>
          ) : page === 'tasks' ? (
            <TasksBoard
              tasks={tasks}
              toast={toast}
              onPlace={(t) => {
                // the phone's way onto the calendar: no tasks column there, so pick here and go
                setPicked(pickOf(t));
                setPage('planner');
              }}
            />
          ) : page === 'insights' ? (
            <Insights events={shown} hours={hours} off={holidayDays} tasks={open} />
          ) : (
            <Habits habits={habits} toast={toast} />
          )}
        </div>
      </div>
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg.msg}
          {toastMsg.undo && (
            <button
              type="button"
              onClick={() => {
                toastMsg.undo!();
                setToastMsg(null);
              }}>
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── header band ───────────────────────── */

function Band({
  events,
  hours,
  off,
  aiOpen,
  onAI,
}: {
  events: CalEvent[];
  hours: Hours;
  off: ReadonlySet<string>;
  aiOpen: boolean;
  onAI: () => void;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [now, setNow] = useState(nowMin());
  useEffect(() => {
    const t = setInterval(() => setNow(nowMin()), 60_000);
    return () => clearInterval(t);
  }, []);
  useLayoutEffect(() => {
    const el = cv.current;
    if (!el) return;
    paintScene(el, 0.6, 0.84);
    const ro = new ResizeObserver(() => paintScene(el, 0.6, 0.84));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const d = new Date();
  const day = iso(d);
  const H0 = 6;
  const H1 = 22;
  const pct = (m: number) => `${(((Math.min(H1 * 60, Math.max(H0 * 60, m)) - H0 * 60) / ((H1 - H0) * 60)) * 100).toFixed(2)}%`;
  const todays = events.filter((e) => e.date === day && !e.allDay);
  const free = freeOn(events, hours, d, off);
  const waiting = events.filter((e) => e.kind === 'ai' && e.date >= day).length;
  const hhmm = `${String(Math.floor(now / 60)).padStart(2, '0')}:${String(now % 60).padStart(2, '0')}`;

  return (
    <header className="band">
      <canvas ref={cv} className="scene" aria-hidden />
      <h2>
        <small>Today</small>
        {WD_LONG[wdIndex(d)]} <em>{`${d.getDate()} ${MO[d.getMonth()].slice(0, 3)}`}</em>
      </h2>
      <div className="horizon" aria-hidden>
        <div className="ln" />
        {todays.map((e) => (
          <i
            key={e.id}
            className={`seg${e.kind === 'ai' ? ' ai' : ''}`}
            style={{ left: pct(toMin(e.start)), width: `calc(${pct(toMin(e.end))} - ${pct(toMin(e.start))})` }}
          />
        ))}
        {[6, 9, 12, 15, 18, 21].map((t) => (
          <span key={t} className="tk" style={{ left: pct(t * 60) }}>
            {String(t).padStart(2, '0')}:00
          </span>
        ))}
        <span className="sun" style={{ left: pct(now) }} />
        <span className="sunlbl" style={{ left: pct(Math.min(21.2 * 60, Math.max(6.8 * 60, now))) }}>
          now {hhmm}
        </span>
      </div>
      <div className="band-r">
        <div className="stats">
          <div>
            <b>{hm(free)}</b>
            <span>free today</span>
          </div>
          <div>
            <b>{waiting}</b>
            <span>proposals waiting</span>
          </div>
        </div>
        <button type="button" className="btn grad" aria-pressed={aiOpen} onClick={onAI} title={aiOpen ? 'Close Plan with AI' : 'Plan with AI  /'}>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M8 1.8c.4 2.9 1.4 4 4.2 4.4-2.8.5-3.8 1.5-4.2 4.4-.4-2.9-1.4-3.9-4.2-4.4C6.6 5.8 7.6 4.7 8 1.8ZM12.6 10.4c.2 1.3.7 1.8 1.9 2-1.2.2-1.7.7-1.9 2-.2-1.3-.7-1.8-1.9-2 1.2-.2 1.7-.7 1.9-2Z" fill="currentColor" />
          </svg>
          Plan with AI
        </button>
      </div>
    </header>
  );
}

/* ───────────────────────── tasks column ───────────────────────── */

function TaskColumn({
  tasks,
  events,
  hours,
  off,
  days,
  toast,
  picked,
  onPick,
  onDragStart,
}: {
  tasks: ApiTask[];
  events: CalEvent[];
  hours: Hours;
  /** public holidays: no working time */
  off: ReadonlySet<string>;
  days: Date[];
  toast: Toast;
  /** id of the task picked to place by tap, if any */
  picked: string | null;
  onPick: (t: ApiTask) => void;
  onDragStart: () => void;
}) {
  const today = new Date(new Date().toDateString());
  const weekEnd = addDays(startOfWeek(today), 7);

  const overdue = tasks.filter((t) => t.durationMin > 0 && dueDate(t) && dueDate(t)! < today);
  const thisWeek = tasks.filter((t) => t.durationMin > 0 && dueDate(t) && dueDate(t)! >= today && dueDate(t)! < weekEnd);
  const later = tasks.filter((t) => t.durationMin > 0 && (!dueDate(t) || dueDate(t)! >= weekEnd));
  const needLen = tasks.filter((t) => !t.durationMin);

  // Does this week's work fit? Task time due this week vs free time left this week.
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(days[0]), i)).filter((d) => d >= today);
  const freeWeek = weekDays.reduce((s, d) => s + freeOn(events, hours, d, off), 0);
  const need = [...overdue, ...thisWeek].reduce((s, t) => s + t.durationMin, 0);
  const proposed = events.filter((e) => e.kind === 'ai' && weekDays.some((d) => iso(d) === e.date)).reduce((s, e) => s + toMin(e.end) - toMin(e.start), 0);
  const fits = need <= freeWeek;

  const row = (t: ApiTask) => {
    const due = dueDate(t);
    const hold = t.notBefore && new Date(t.notBefore) > today ? new Date(t.notBefore) : null;
    return (
      <div
        className={`tk${picked === t.id ? ' picked' : ''}`}
        key={t.id}
        draggable
        title="Drag onto the calendar, or click it and then a time"
        onDragStart={(e) => {
          // dragging one task drops the pick of another, so the grid's ghost is this one
          onDragStart();
          startTaskDrag(e, pickOf(t));
        }}
        onDragEnd={endTaskDrag}
        onClick={(e) => {
          // the checkbox finishes the task; anywhere else on the row picks it to place
          if (!(e.target as Element).closest('.cb')) onPick(t);
        }}>
        <button
          type="button"
          className="cb"
          aria-label={`Mark ${t.title} done`}
          onClick={() => void finishTask(t.id).then(() => toast(`Done: ${t.title}`))}
        />
        <button type="button" className="ti" aria-pressed={picked === t.id} aria-label={`Place ${t.title} on the calendar`}>
          {t.title}
        </button>
        <span className="len">{lenOf(t.durationMin)}</span>
        <span className="sub">
          {!t.durationMin && <span className="pill need">Add a length to plan it</span>}
          {t.status === 'scheduled' || t.status === 'in-progress' ? <span className="pill cal">On your calendar</span> : null}
          {hold && <span>On hold until {shortDay(hold)}</span>}
          {due && <span>{due < today ? 'Overdue' : `due ${shortDay(due)}`}</span>}
        </span>
      </div>
    );
  };

  const group = (title: string, list: ApiTask[], warn?: boolean) =>
    list.length ? (
      <div className="grp" key={title}>
        <h4>
          {warn && <span className="warn">●</span>}
          {title}
        </h4>
        {list.map(row)}
      </div>
    ) : null;

  return (
    <aside className="tasks" aria-label="Tasks">
      <header>
        <h3>Tasks</h3>
        <span>{tasks.length} open</span>
      </header>
      <AddTask toast={toast} />
      {tasks.length > 0 && <small className="hint">Drag a task onto the calendar, or click it and then a time.</small>}
      {group('Overdue', overdue, true)}
      {group('Due this week', thisWeek)}
      {group('Needs a length', needLen)}
      {group('Later', later)}
      {!tasks.length && <p className="muted">Nothing open. Type a task above, like “Write the memo 2h fri”.</p>}
      <div className="fit">
        <b>{need === 0 ? 'Nothing due this week' : fits ? 'The work fits this week' : 'Not everything fits'}</b>
        <div className="bar">
          <i style={{ width: `${Math.min(100, (need / Math.max(1, freeWeek)) * 100)}%`, background: fits ? 'var(--focus)' : 'var(--warn)' }} />
          <i style={{ width: `${Math.min(100, (proposed / Math.max(1, freeWeek)) * 100)}%`, background: 'var(--ai)' }} />
        </div>
        <small>
          {hm(need)} of tasks due, {hm(freeWeek)} free after meetings.{proposed ? ` ${hm(proposed)} proposed and waiting for you.` : ''}
        </small>
      </div>
    </aside>
  );
}

/** Add a task in your own words ("Write the memo 2h fri"); Plan with AI reads the length and the day. */
function AddTask({ toast }: { toast: Toast }) {
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const add = async () => {
    const t = text.trim();
    if (!t || adding) return;
    if (isPreviewTasks()) {
      addPreviewTask(t);
      setText('');
      toast(`Added "${t}"`);
      return;
    }
    setAdding(true);
    try {
      const reply = await sendMessage(`Add task: ${t}`);
      setText('');
      toast(reply.text.split('\n')[0].slice(0, 140));
      void refreshTasks();
    } catch {
      toast("Couldn't add that task. Try again.");
    } finally {
      setAdding(false);
    }
  };
  return (
    <form
      className="add"
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}>
      +
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={adding ? 'Adding…' : 'Add a task: Write the memo 2h fri'}
        disabled={adding}
        aria-label="Add a task in your own words"
        autoComplete="off"
      />
    </form>
  );
}

/* ───────────────────────── other pages ───────────────────────── */

function TasksBoard({ tasks, toast, onPlace }: { tasks: ApiTask[]; toast: Toast; onPlace: (t: ApiTask) => void }) {
  const [twoWeeks] = useState(() => Date.now() - 14 * 86400_000);
  const lanes: [string, ApiTask[]][] = [
    ['Needs a length', tasks.filter((t) => isOpen(t) && !t.durationMin)],
    ['To plan', tasks.filter((t) => t.status === 'backlog' && t.durationMin > 0)],
    ['On the calendar', tasks.filter((t) => t.status === 'scheduled' || t.status === 'in-progress')],
    ['Done', tasks.filter((t) => t.status === 'done' && (!t.completedAt || new Date(t.completedAt).getTime() > twoWeeks))],
  ];
  return (
    <div className="page">
      <div className="board-add">
        <AddTask toast={toast} />
      </div>
      <div className="board">
        {lanes.map(([name, list]) => (
          <div className="lane" key={name}>
            <h4>
              <span>{name}</span>
              <span>{list.length}</span>
            </h4>
            {list.map((t) => (
              <div className="card" key={t.id}>
                <b>{t.title}</b>
                <small>
                  {lenOf(t.durationMin)}
                  {t.dueBy ? ` · due ${shortDay(new Date(t.dueBy))}` : ''}
                </small>
                {isOpen(t) && (
                  <div className="acts">
                    <button type="button" className="chip" onClick={() => onPlace(t)}>
                      Place on calendar
                    </button>
                    <button type="button" className="chip" onClick={() => void finishTask(t.id).then(() => toast(`Done: ${t.title}`))}>
                      Mark done
                    </button>
                  </div>
                )}
              </div>
            ))}
            {!list.length && <small className="muted">Nothing here.</small>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Insights({ events, hours, off, tasks }: { events: CalEvent[]; hours: Hours; off: ReadonlySet<string>; tasks: ApiTask[] }) {
  const today = new Date(new Date().toDateString());
  const week = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(today), i));
  const rest = week.filter((d) => d >= today);
  const free = rest.reduce((s, d) => s + freeOn(events, hours, d, off), 0);
  const weekEnd = addDays(week[0], 7);
  const need = tasks.filter((t) => t.dueBy && new Date(t.dueBy) < weekEnd).reduce((s, t) => s + t.durationMin, 0);
  const per = week.map((d) => {
    const list = events.filter((e) => e.date === iso(d) && !e.allDay);
    const sum = (f: (e: CalEvent) => boolean) => list.filter(f).reduce((s, e) => s + toMin(e.end) - toMin(e.start), 0) / 60;
    return { d, m: sum((e) => cls(e) === 'event'), f: sum((e) => cls(e) === 'focus' || cls(e) === 'task'), a: sum((e) => cls(e) === 'ai') };
  });
  const max = Math.max(8, ...per.map((p) => p.m + p.f + p.a));
  const sc = (v: number) => `${((v / max) * 100).toFixed(1)}%`;
  // only days you work can be "tight"; a free weekend isn't
  const tight = rest.filter((d) => workFor(hours, wdIndex(d)) && !off.has(iso(d))).sort((a, b) => freeOn(events, hours, a, off) - freeOn(events, hours, b, off))[0];
  return (
    <div className="page">
      <div className="ins">
        <div className="ans">
          <span className="eyebrow">Will this week&apos;s work fit?</span>
          <h3>
            {need === 0 ? (
              <>
                Nothing due, <em>{hm(free)}</em> free.
              </>
            ) : need <= free ? (
              <>
                Yes, with <em>{hm(free - need)}</em> to spare.
              </>
            ) : (
              <>
                Short by <em>{hm(need - free)}</em>.
              </>
            )}
          </h3>
          <p>
            {hm(need)} of tasks due and {hm(free)} free between meetings for the rest of the week.
            {tight ? ` ${WD_LONG[wdIndex(tight)]} is the tightest day: ${hm(freeOn(events, hours, tight, off))} free.` : ''}
          </p>
        </div>
        <div className="ans">
          <span className="eyebrow">Hours per day · meetings, focus, proposals</span>
          <div className="bars">
            {per.map((p) => (
              <div key={iso(p.d)}>
                <i style={{ height: sc(p.a), background: 'var(--ai-bg)', border: p.a ? '1.5px dashed var(--ai-bd)' : 0 }} />
                <i style={{ height: sc(p.f), background: 'var(--focus)' }} />
                <i style={{ height: sc(p.m), background: 'var(--event-bd)' }} />
                <span>{WD_LONG[wdIndex(p.d)].slice(0, 3)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Habits({ habits, toast }: { habits: ReturnType<typeof useTasks>['habits']; toast: Toast }) {
  return (
    <div className="page">
      <div className="ans" style={{ maxWidth: 640 }}>
        <span className="eyebrow">Habits</span>
        <h3>
          {habits.length ? (
            <>
              {habits.length} {habits.length === 1 ? 'habit' : 'habits'}, <em>kept every week</em>
            </>
          ) : (
            <>
              No habits <em>yet</em>
            </>
          )}
        </h3>
        <p>A habit is time you want every week, like a run three times a week. When you plan your week, Find Time puts its sessions where they fit, as events you can move.</p>
        {habits.map((h) => (
          <div className="card" key={h.id}>
            <b>{h.title}</b>
            <small>
              {h.perWeek}× a week · {hm(h.durationMin)}
            </small>
            <div className="acts">
              <button type="button" className="chip" onClick={() => void stopHabit(h.id).then(() => toast(`Stopped ${h.title}`))}>
                Stop
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

