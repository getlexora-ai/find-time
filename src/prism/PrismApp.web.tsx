import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { connect, setCalRead, syncNow, useAccounts } from '@/calendar/account-store';
import { sendMessage } from '@/calendar/agent-store';
import { addDays, iso, MO, nowMin, startOfWeek, toMin, WD_LONG, wdIndex } from '@/calendar/cal-date';
import { refresh, useCalEvents, useCalLoad } from '@/calendar/cal-store';
import { AccountButton } from '@/calendar/components/AccountButton';
import { useHours, workFor, type Hours } from '@/calendar/hours';
import { finishTask, refreshTasks, stopHabit, useTasks } from '@/calendar/tasks-store';
import type { CalEvent } from '@/calendar/types';
import type { ApiTask } from '@/lib/api-types';

import './prism.css';
import { paintScene } from './scene';
import { cls, LBL, Week, type Toast } from './Week.web';

type Page = 'planner' | 'tasks' | 'insights' | 'habits';
const DRAWER_KEY = 'ft.px.drawer';

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
const freeOn = (events: CalEvent[], hours: Hours, d: Date) => {
  const w = workFor(hours, wdIndex(d));
  if (!w) return 0;
  return Math.max(0, (w.end - w.start) * 60 - busyIn(events, iso(d), w.start * 60, w.end * 60));
};

const dueDate = (t: ApiTask) => (t.dueBy ? new Date(t.dueBy) : null);
const shortDay = (d: Date) => `${WD_LONG[wdIndex(d)].slice(0, 3)} ${d.getDate()} ${MO[d.getMonth()].slice(0, 3)}`;
const isOpen = (t: ApiTask) => t.status !== 'done' && t.status !== 'archived';

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

  // [ ] drawer · ← → week · T today. Never while typing.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target;
      const typing = t instanceof Element && !!t.closest('input, textarea, [contenteditable], [role="listbox"], [role="dialog"]');
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '[') setDrawer(false);
      else if (e.key === ']') setDrawer(true);
      else if (page === 'planner' && e.key === 'ArrowLeft') go(-1);
      else if (page === 'planner' && e.key === 'ArrowRight') go(1);
      else if (page === 'planner' && (e.key === 't' || e.key === 'T')) setCursor(new Date());
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [go, page]);

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

  const nav = (p: Page, label: string, icon: React.ReactNode, extra?: React.ReactNode) => (
    <button type="button" className="d-item" aria-current={page === p ? 'page' : undefined} title={label} onClick={() => setPage(p)}>
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
            {calendars.slice(0, 4).map((c) => (
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
          <Band events={events} hours={hours} />
          {page === 'planner' ? (
            <div className="work">
              <TaskColumn tasks={open} events={events} hours={hours} days={days} toast={toast} />
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
                      <span key={k}>
                        <i className={`ev ${k}`} style={{ position: 'static', padding: 0, width: 12, height: 9, borderRadius: 3 }} />
                        {LBL[k]}
                      </span>
                    ))}
                  </div>
                </div>
                {load.status === 'error' && events.length === 0 ? (
                  <div className="loading">
                    Couldn&apos;t load your calendar.{' '}
                    <button type="button" className="btn line sm" onClick={() => void refresh()}>
                      Try again
                    </button>
                  </div>
                ) : (
                  <Week days={days} events={events} hours={hours} loading={load.status === 'loading'} toast={toast} />
                )}
              </section>
            </div>
          ) : page === 'tasks' ? (
            <TasksBoard tasks={tasks} toast={toast} />
          ) : page === 'insights' ? (
            <Insights events={events} hours={hours} tasks={open} />
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

function Band({ events, hours }: { events: CalEvent[]; hours: Hours }) {
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
  const free = freeOn(events, hours, d);
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
      </div>
    </header>
  );
}

/* ───────────────────────── tasks column ───────────────────────── */

function TaskColumn({
  tasks,
  events,
  hours,
  days,
  toast,
}: {
  tasks: ApiTask[];
  events: CalEvent[];
  hours: Hours;
  days: Date[];
  toast: Toast;
}) {
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const today = new Date(new Date().toDateString());
  const weekEnd = addDays(startOfWeek(today), 7);

  const overdue = tasks.filter((t) => t.durationMin > 0 && dueDate(t) && dueDate(t)! < today);
  const thisWeek = tasks.filter((t) => t.durationMin > 0 && dueDate(t) && dueDate(t)! >= today && dueDate(t)! < weekEnd);
  const later = tasks.filter((t) => t.durationMin > 0 && (!dueDate(t) || dueDate(t)! >= weekEnd));
  const needLen = tasks.filter((t) => !t.durationMin);

  // Does this week's work fit? Task time due this week vs free time left this week.
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(days[0]), i)).filter((d) => d >= today);
  const freeWeek = weekDays.reduce((s, d) => s + freeOn(events, hours, d), 0);
  const need = [...overdue, ...thisWeek].reduce((s, t) => s + t.durationMin, 0);
  const proposed = events.filter((e) => e.kind === 'ai' && weekDays.some((d) => iso(d) === e.date)).reduce((s, e) => s + toMin(e.end) - toMin(e.start), 0);
  const fits = need <= freeWeek;

  const add = async () => {
    const t = text.trim();
    if (!t || adding) return;
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

  const row = (t: ApiTask) => {
    const due = dueDate(t);
    const hold = t.notBefore && new Date(t.notBefore) > today ? new Date(t.notBefore) : null;
    return (
      <div className="tk" key={t.id}>
        <button
          type="button"
          className="cb"
          aria-label={`Mark ${t.title} done`}
          onClick={() => void finishTask(t.id).then(() => toast(`Done: ${t.title}`))}
        />
        <span className="ti">{t.title}</span>
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
          placeholder={adding ? 'Adding…' : 'Write the memo 2h fri'}
          disabled={adding}
          aria-label="Add a task in your own words"
          autoComplete="off"
        />
      </form>
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

/* ───────────────────────── other pages ───────────────────────── */

function TasksBoard({ tasks, toast }: { tasks: ApiTask[]; toast: Toast }) {
  const [twoWeeks] = useState(() => Date.now() - 14 * 86400_000);
  const lanes: [string, ApiTask[]][] = [
    ['Needs a length', tasks.filter((t) => isOpen(t) && !t.durationMin)],
    ['To plan', tasks.filter((t) => t.status === 'backlog' && t.durationMin > 0)],
    ['On the calendar', tasks.filter((t) => t.status === 'scheduled' || t.status === 'in-progress')],
    ['Done', tasks.filter((t) => t.status === 'done' && (!t.completedAt || new Date(t.completedAt).getTime() > twoWeeks))],
  ];
  return (
    <div className="page">
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

function Insights({ events, hours, tasks }: { events: CalEvent[]; hours: Hours; tasks: ApiTask[] }) {
  const today = new Date(new Date().toDateString());
  const week = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(today), i));
  const rest = week.filter((d) => d >= today);
  const free = rest.reduce((s, d) => s + freeOn(events, hours, d), 0);
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
  const tight = rest.filter((d) => workFor(hours, wdIndex(d))).sort((a, b) => freeOn(events, hours, a) - freeOn(events, hours, b))[0];
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
            {tight ? ` ${WD_LONG[wdIndex(tight)]} is the tightest day: ${hm(freeOn(events, hours, tight))} free.` : ''}
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
        <p>Habits repeat and keep a weekly minimum. On the calendar they show as routines, so they read as backdrop, not work.</p>
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

