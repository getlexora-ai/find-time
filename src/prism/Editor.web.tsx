import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { fromMin, MO, toMin, WD, wdIndex } from '@/calendar/cal-date';
import { acceptEvent, createEventAsync, createMeetLink, deleteEvent, updateEvent } from '@/calendar/cal-store';
import type { CatKey } from '@/calendar/tokens';
import type { CalEvent } from '@/calendar/types';
import { apiFetch } from '@/lib/api';

import { DatePicker, Dropdown } from './Pickers.web';
import { paintScene } from './scene';

/**
 * The block editor: Popover + More, organised like Google Calendar's quick
 * event card — a big title, the kind, then one row per question with an icon
 * in the gutter: when, where (in person or online), details. Your own blocks
 * save as you change them (like a drag); a new block saves on Save.
 */

type Kind = 'focus' | 'event' | 'task' | 'routine' | 'ai';
const cls = (ev: Pick<CalEvent, 'kind'>): Kind => (ev.kind === 'break' ? 'routine' : ev.kind);
const LBL: Record<Kind, string> = { focus: 'Focus', event: 'Event', task: 'Task', routine: 'Routine', ai: 'Proposal' };
const SW: Record<Kind, string> = {
  focus: 'var(--focus)',
  event: 'var(--event-bd)',
  task: 'var(--task-bd)',
  routine: 'var(--routine-fg)',
  ai: 'var(--ai-bd)',
};
const CATS: [CatKey, string, string][] = [
  ['deep', 'Deep work', '#1d6bff'],
  ['sync', 'Meetings', '#e0246f'],
  ['design', 'Design', '#7c4deb'],
  ['research', 'Research', '#0a7a8f'],
  ['admin', 'Admin', '#a05f00'],
];
/** only http(s) links become a Join button */
const SAFE = /^https?:\/\/\S+$/i;
const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export type Toast = (msg: string, undo?: () => void) => void;

export type Pop = { wk?: string } & (
  | { type: 'event'; ev: CalEvent; x: number; y: number }
  | { type: 'draft'; date: string; s: number; t: number; x: number; y: number }
  | { type: 'list'; title: string; items: CalEvent[]; x: number; y: number }
);

/** tallest editor (More details open), for keeping it on screen */
export const POP_H = 470;

const dayLabel = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number);
  return `${WD[wdIndex(new Date(y, m - 1, dd))]} ${dd} ${MO[m - 1].slice(0, 3)}`;
};
const span = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ''}`);

function repeatOptions(date: string): [string, string][] {
  const [y, m, d] = date.split('-').map(Number);
  const wd = wdIndex(new Date(y, m - 1, d));
  return [
    ['', 'Does not repeat'],
    ['FREQ=DAILY', 'Every day'],
    ['FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'Every weekday (Mon–Fri)'],
    [`FREQ=WEEKLY;BYDAY=${BYDAY[wd]}`, `Weekly on ${WD[wd]}`],
  ];
}

const I = {
  clock: (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6.5V10l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  repeat: (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M4 9a5 5 0 0 1 8.5-3.5L14 7M16 11a5 5 0 0 1-8.5 3.5L6 13M14 4v3h-3M6 16v-3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  pin: (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M10 17s5-4.6 5-8.5a5 5 0 1 0-10 0C5 12.4 10 17 10 17Z" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="8.5" r="1.8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  video: (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="2.5" y="5.5" width="10.5" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="m13 9 4.5-2.5v7L13 11" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  lines: (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M4 6h12M4 10h12M4 14h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 10.5V4a1 1 0 0 1 1-1h6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
};

function Strip() {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    if (ref.current) paintScene(ref.current, 0.7, 0.8);
  }, []);
  return (
    <div className="strip">
      <canvas ref={ref} className="scene" aria-hidden />
    </div>
  );
}

/** The fields an editor works on, for a new block and an existing one alike. */
type Draft = {
  title: string;
  /** the four kinds the grid and its legend show; a routine is the one that repeats */
  kind: EditKind;
  date: string;
  s: number;
  t: number;
  rrule: string;
  where: 'person' | 'online';
  location: string;
  videoUrl: string;
  cat: CatKey;
  project: string;
  notes: string;
};

type EditKind = 'event' | 'focus' | 'task' | 'routine';
const KINDS: EditKind[] = ['event', 'focus', 'task', 'routine'];
/** One line under the kind tabs: what this kind means, in the user's words. */
const KIND_HINT: Record<EditKind, string> = {
  event: 'Something at a set time: a meeting, a call, an appointment.',
  focus: 'Protected time for deep work. Plan with AI won’t move it; you still can.',
  task: 'Time set aside to work on a task.',
  routine: 'Repeats: lunch, gym, standup. Drawn pale so the rest of your week reads first.',
};
/** A repeat rule we didn't write ourselves, in words: "Weekly on Mon, Wed, Fri". */
function describeRule(r: string): string {
  const by = /BYDAY=([A-Z,]+)/.exec(r)?.[1]?.split(',').map((x) => WD[BYDAY.indexOf(x)]).filter(Boolean);
  const every = /INTERVAL=(\d+)/.exec(r)?.[1];
  if (r.includes('FREQ=DAILY')) return every ? `Every ${every} days` : 'Every day';
  if (r.includes('FREQ=MONTHLY')) return every ? `Every ${every} months` : 'Every month';
  if (r.includes('FREQ=WEEKLY')) return `${every ? `Every ${every} weeks` : 'Weekly'}${by?.length ? ` on ${by.join(', ')}` : ''}`;
  return 'Repeats';
}

/** A routine always repeats; it starts weekly on its own day. */
const weeklyOn = (date: string) => {
  const [y, m, dd] = date.split('-').map(Number);
  return `FREQ=WEEKLY;BYDAY=${BYDAY[wdIndex(new Date(y, m - 1, dd))]}`;
};

const fromEvent = (ev: CalEvent): Draft => ({
  title: ev.title,
  kind: ev.kind === 'break' ? 'routine' : ev.kind === 'ai' ? 'event' : ev.kind,
  date: ev.date,
  s: toMin(ev.start),
  t: toMin(ev.end),
  rrule: ev.rrule ?? '',
  where: ev.videoUrl && !ev.location ? 'online' : 'person',
  location: ev.location ?? '',
  videoUrl: ev.videoUrl ?? '',
  cat: ev.cat,
  project: ev.project ?? '',
  notes: ev.notes ?? '',
});

/* ───────────────────────── the popover ───────────────────────── */

export function Popover({
  pop,
  events,
  onClose,
  onOpen,
  toast,
}: {
  pop: Pop;
  events: CalEvent[];
  onClose: () => void;
  onOpen: (ev: CalEvent) => void;
  toast: Toast;
}) {
  const box = useRef<HTMLDivElement>(null);

  // Click outside closes (a half-typed field is saved first); Escape closes.
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('.ev, .adv')) {
        (document.activeElement as HTMLElement | null)?.blur();
        onClose();
      }
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [onClose]);

  const style = { left: pop.x, top: pop.y };
  const close = (
    <button type="button" className="x" onClick={onClose} aria-label="Close">
      ×
    </button>
  );

  if (pop.type === 'list') {
    return (
      <div className="pop" role="dialog" aria-label={pop.title} style={style} ref={box}>
        <Strip />
        {close}
        <div className="in">
          <span className="k">{pop.title}</span>
          {pop.items.map((ev) => (
            <button key={ev.id} type="button" className={`ev ${cls(ev)} short`} style={{ position: 'relative', padding: '5px 8px' }} onClick={() => onOpen(ev)}>
              <b>{ev.title}</b>
              <span>{ev.allDay ? 'all day' : ev.start}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Always the store's current copy: an edit made here shows here.
  const live = pop.type === 'event' ? (events.find((e) => e.id === pop.ev.id) ?? pop.ev) : null;
  return (
    <div className="pop ed" role="dialog" aria-label={live ? `Edit ${live.title}` : 'New block'} style={style} ref={box}>
      <Strip />
      {close}
      <Editor
        ev={live}
        fresh={pop.type === 'draft' ? { date: pop.date, s: pop.s, t: pop.t } : null}
        onClose={onClose}
        toast={toast}
      />
    </div>
  );
}

function Editor({
  ev,
  fresh,
  onClose,
  toast,
}: {
  ev: CalEvent | null;
  fresh: { date: string; s: number; t: number } | null;
  onClose: () => void;
  toast: Toast;
}) {
  const isNew = !ev;
  const own = !ev || !ev.imported;
  const proposal = ev?.kind === 'ai';
  const timeEditable = isNew || own || !!ev?.googleEditable;
  const contentEditable = isNew || (own && !proposal);

  const [d, setD] = useState<Draft>(() =>
    ev
      ? fromEvent(ev)
      : {
          title: '',
          kind: 'event',
          date: fresh!.date,
          s: fresh!.s,
          t: fresh!.t,
          rrule: '',
          where: 'person',
          location: '',
          videoUrl: '',
          cat: 'admin',
          project: '',
          notes: '',
        },
  );
  const [more, setMore] = useState(() => !!(ev && (ev.notes || ev.project)));
  const [busy, setBusy] = useState<string | null>(null);
  const [meetErr, setMeetErr] = useState<{ msg: string; code?: string } | null>(null);
  const [wantMeet, setWantMeet] = useState(false);
  const [pasting, setPasting] = useState(false);

  /** Change fields; on an existing block, save them right away. */
  const change = (patch: Partial<Draft>, save = true) => {
    // Only a routine repeats (that is what makes it one): becoming a routine
    // starts a weekly repeat, becoming anything else stops it.
    if ('kind' in patch) patch = { ...patch, rrule: patch.kind === 'routine' ? d.rrule || weeklyOn(d.date) : '' };
    const next = { ...d, ...patch };
    setD(next);
    if (isNew || !ev || !save) return;
    const p: Partial<CalEvent> = {};
    if ('title' in patch) {
      if (!next.title.trim() || next.title === ev.title) return;
      p.title = next.title.trim();
    }
    if ('date' in patch || 's' in patch || 't' in patch) Object.assign(p, { date: next.date, start: fromMin(next.s), end: fromMin(next.t) });
    if ('rrule' in patch) p.rrule = next.rrule; // '' stops it repeating
    if ('kind' in patch) p.kind = next.kind;
    if ('cat' in patch) p.cat = next.cat;
    if ('location' in patch) p.location = next.location.trim();
    if ('videoUrl' in patch) p.videoUrl = next.videoUrl.trim();
    if ('project' in patch) p.project = next.project.trim();
    if ('notes' in patch) p.notes = next.notes;
    void updateEvent(ev.id, p).then((ok) => !ok && toast("Couldn't save that change. Check your connection and try again."));
  };
  /** Text fields: keep typing local, save when you leave the field. */
  const typing = (patch: Partial<Draft>) => change(patch, false);
  const commit = (key: keyof Draft) => () => change({ [key]: d[key] } as Partial<Draft>);

  const meet = async (id: number) => {
    setBusy('meet');
    setMeetErr(null);
    const out = await createMeetLink(id);
    setBusy(null);
    if (out.ok) {
      setD((x) => ({ ...x, videoUrl: out.url, where: 'online' }));
      toast('Google Meet link added');
    } else setMeetErr({ msg: out.error, code: out.code });
    return out.ok;
  };

  const turnOnWriteBack = async () => {
    setBusy('meet');
    try {
      const res = await apiFetch('/api/calendar/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pushFocus: true }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setBusy(null);
        setMeetErr({ msg: b.error ?? "Couldn't turn it on. Try again." });
        return;
      }
    } catch {
      setBusy(null);
      setMeetErr({ msg: "Couldn't reach Find Time. Try again." });
      return;
    }
    setBusy(null);
    if (ev) void meet(ev.id);
  };

  const save = async () => {
    if (busy) return;
    setBusy('save');
    try {
      const created = await createEventAsync({
        date: d.date,
        start: fromMin(d.s),
        end: fromMin(d.t),
        title: d.title.trim() || 'New block',
        cat: d.kind === 'focus' ? 'deep' : d.cat,
        kind: d.kind,
        rrule: d.kind === 'routine' ? d.rrule || weeklyOn(d.date) : undefined,
        // where only belongs to events
        location: (d.kind === 'event' && d.location.trim()) || undefined,
        videoUrl: (d.kind === 'event' && d.videoUrl.trim()) || undefined,
        project: d.project.trim(),
        notes: d.notes,
      });
      toast(`${d.title.trim() || 'New block'} added ${dayLabel(d.date)} ${fromMin(d.s)}`);
      if (d.kind === 'event' && wantMeet && d.where === 'online' && !d.videoUrl) {
        const out = await createMeetLink(created.id);
        if (!out.ok) toast(`Saved, but no Meet link: ${out.error}`);
      }
      onClose();
    } catch {
      toast("Couldn't save that block. Check your connection and try again.");
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!ev) return onClose();
    setBusy('del');
    const ok = await deleteEvent(ev.id);
    setBusy(null);
    if (!ok) return toast("Couldn't delete it. Try again.");
    onClose();
    toast(
      `${proposal ? 'Discarded' : 'Deleted'} ${ev.title}`,
      own && !ev.rrule
        ? () =>
            void createEventAsync({
              date: ev.date, start: ev.start, end: ev.end, title: ev.title, cat: ev.cat, kind: ev.kind,
              notes: ev.notes, project: ev.project, location: ev.location, videoUrl: ev.videoUrl,
            })
        : undefined,
    );
  };

  /* ── time row: start list in 15 min steps, end list shows each length ── */
  const starts = Array.from({ length: 96 }, (_, i) => i * 15);
  const ends = Array.from({ length: 96 }, (_, i) => d.s + (i + 1) * 15).filter((m) => m <= 23 * 60 + 45);
  const k: Kind = isNew ? d.kind : cls(ev!);
  const repeats = repeatOptions(d.date);
  const repeatKnown = repeats.some(([v]) => v === d.rrule);

  const detailSummary = [CATS.find((c) => c[0] === d.cat)?.[1], d.project, d.notes ? 'notes' : ''].filter(Boolean).join(' · ');

  return (
    <form
      className="in"
      onSubmit={(e) => {
        e.preventDefault();
        if (isNew) void save();
      }}>
      {/* 1 · title */}
      {contentEditable || (proposal && own) ? (
        <input
          className="title-in"
          autoFocus={isNew}
          placeholder="Add title"
          value={d.title}
          aria-label="Title"
          onChange={(e) => typing({ title: e.target.value })}
          onBlur={commit('title')}
          onKeyDown={(e) => !isNew && e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
      ) : (
        <h4>{ev!.title}</h4>
      )}

      {/* 2 · kind */}
      {contentEditable && !ev?.allDay ? (
        <div className="kinds tabs" role="tablist" aria-label="Kind">
          {KINDS.map((kk) => (
            <button key={kk} type="button" role="tab" aria-selected={d.kind === kk} onClick={() => change({ kind: kk })}>
              <i style={{ background: SW[kk] }} />
              {LBL[kk]}
            </button>
          ))}
        </div>
      ) : (
        <span className="k">
          <i style={{ background: SW[k] }} />
          {ev?.imported ? 'Event · Google Calendar' : LBL[k]}
        </span>
      )}

      {/* 3 · when */}
      <div className="row">
        <span className="ri">{I.clock}</span>
        {ev?.allDay ? (
          <div className="rc">{dayLabel(d.date)} · all day</div>
        ) : timeEditable ? (
          <div className="rc when-edit">
            <DatePicker
              value={d.date}
              disabled={!!d.rrule && !isNew}
              title={d.rrule && !isNew ? 'A repeating block keeps its day. Change the time, or stop it repeating.' : undefined}
              onChange={(v) => change({ date: v })}
            />
            <span className="times">
              <Dropdown
                label="Starts"
                value={d.s}
                options={starts.map((m) => ({ value: m, label: fromMin(m) }))}
                onChange={(v) => change({ s: v, t: Math.min(23 * 60 + 45, v + (d.t - d.s)) })}
              />
              <span className="to">–</span>
              <Dropdown
                label="Ends"
                value={d.t}
                options={ends.map((m) => ({ value: m, label: fromMin(m), hint: span(m - d.s) }))}
                onChange={(v) => change({ t: v })}
              />
            </span>
          </div>
        ) : (
          <div className="rc">
            {dayLabel(d.date)} · {fromMin(d.s)} – {fromMin(d.t)} <span className="muted">({span(d.t - d.s)})</span>
          </div>
        )}
      </div>
      {contentEditable && !ev?.allDay && <p className="hint">{KIND_HINT[d.kind]}</p>}
      {contentEditable && !ev?.allDay && d.kind === 'routine' && (
        <div className="row">
          <span className="ri">{I.repeat}</span>
          <div className="rc">
            <Dropdown
              label="Repeats"
              className="wide"
              value={d.rrule}
              options={[
                ...(repeatKnown ? [] : [{ value: d.rrule, label: describeRule(d.rrule) }]),
                // a routine always repeats: to stop, make it an Event
                ...repeats.filter(([v]) => v).map(([v, l]) => ({ value: v, label: l })),
              ]}
              onChange={(v) => change({ rrule: v })}
            />
          </div>
        </div>
      )}

      {/* 4 · where: in person or online — events only; a task or focus block is just you */}
      {contentEditable && d.kind !== 'event' ? null : contentEditable ? (
        <div className="row">
          <span className="ri">{d.where === 'online' ? I.video : I.pin}</span>
          <div className="rc where">
            <div className="seg" role="group" aria-label="Where">
              <button type="button" aria-pressed={d.where === 'person'} onClick={() => setD({ ...d, where: 'person' })}>
                In person
              </button>
              <button type="button" aria-pressed={d.where === 'online'} onClick={() => setD({ ...d, where: 'online' })}>
                Online
              </button>
            </div>
            {d.where === 'person' ? (
              <input
                className="field"
                placeholder="Add a place"
                value={d.location}
                aria-label="Place"
                onChange={(e) => typing({ location: e.target.value })}
                onBlur={commit('location')}
              />
            ) : d.videoUrl && SAFE.test(d.videoUrl) ? (
              <div className="link">
                <a href={d.videoUrl} target="_blank" rel="noreferrer" className="btn ink sm">
                  {I.video}
                  Join
                </a>
                <span className="url" title={d.videoUrl}>
                  {d.videoUrl.replace(/^https?:\/\//, '')}
                </span>
                <button
                  type="button"
                  className="ib"
                  aria-label="Copy link"
                  onClick={() => void navigator.clipboard?.writeText(d.videoUrl).then(() => toast('Link copied'), () => toast(d.videoUrl))}>
                  {I.copy}
                </button>
                <button type="button" className="ib" aria-label="Remove link" onClick={() => change({ videoUrl: '' })}>
                  ×
                </button>
              </div>
            ) : pasting ? (
              <input
                className="field"
                autoFocus
                placeholder="Paste a Zoom, Teams or Meet link"
                aria-label="Video call link"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  setPasting(false);
                  if (/^https?:\/\/\S+$/.test(v)) change({ videoUrl: v });
                  else if (v) toast('That doesn’t look like a link. It should start with https://');
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), (e.currentTarget as HTMLInputElement).blur())}
              />
            ) : (
              <div className="meet">
                {isNew ? (
                  <button type="button" className={`btn sm ${wantMeet ? 'ink' : 'line'}`} aria-pressed={wantMeet} onClick={() => setWantMeet(!wantMeet)}>
                    {I.video}
                    {wantMeet ? 'Meet link on save' : 'Add Google Meet link'}
                  </button>
                ) : (
                  <button type="button" className="btn line sm" disabled={busy === 'meet'} onClick={() => void meet(ev!.id)}>
                    {I.video}
                    {busy === 'meet' ? 'Creating link…' : 'Create Google Meet link'}
                  </button>
                )}
                <button type="button" className="btn ghost sm" onClick={() => setPasting(true)}>
                  Paste a link
                </button>
              </div>
            )}
            {meetErr && (
              <p className="err">
                {meetErr.msg}{' '}
                {meetErr.code === 'needs-write-back' && (
                  <button type="button" className="btn line sm" disabled={busy === 'meet'} onClick={() => void turnOnWriteBack()}>
                    Turn it on
                  </button>
                )}
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          {d.location && (
            <div className="row">
              <span className="ri">{I.pin}</span>
              <div className="rc">{d.location}</div>
            </div>
          )}
          {d.videoUrl && SAFE.test(d.videoUrl) && (
            <div className="row">
              <span className="ri">{I.video}</span>
              <div className="rc link">
                <a href={d.videoUrl} target="_blank" rel="noreferrer" className="btn ink sm">
                  Join
                </a>
                <span className="url">{d.videoUrl.replace(/^https?:\/\//, '')}</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* 5 · more details */}
      {contentEditable && (
        <div className="row">
          <span className="ri">{I.lines}</span>
          <div className="rc">
            <button type="button" className="more" aria-expanded={more} onClick={() => setMore(!more)}>
              {more ? 'Fewer details' : 'More details'}
              {!more && detailSummary && <span className="muted"> · {detailSummary}</span>}
            </button>
            {more && (
              <div className="details">
                <div className="chips" role="group" aria-label="Category">
                  {CATS.map(([key, l, c]) => (
                    <button key={key} type="button" className="chip" aria-pressed={d.cat === key} onClick={() => change({ cat: key })}>
                      <i style={{ background: c }} />
                      {l}
                    </button>
                  ))}
                </div>
                <input
                  className="field"
                  placeholder="Project"
                  value={d.project}
                  aria-label="Project"
                  onChange={(e) => typing({ project: e.target.value })}
                  onBlur={commit('project')}
                />
                <textarea
                  className="field"
                  placeholder="Notes: agenda, links, what done looks like"
                  value={d.notes}
                  aria-label="Notes"
                  onChange={(e) => typing({ notes: e.target.value })}
                  onBlur={commit('notes')}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* note + actions */}
      {ev?.imported && (
        <div className="meta">
          {ev.googleEditable ? 'From Google Calendar. Time changes go to Google.' : 'From Google Calendar. Change it in Google.'}
        </div>
      )}
      {proposal && <div className="meta">Proposed by Plan with AI. Not on your calendar until you add it.</div>}
      <div className="acts">
        {isNew ? (
          <>
            <button type="submit" className="btn ink sm" disabled={!!busy}>
              {busy === 'save' ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn line sm" onClick={onClose}>
              Cancel
            </button>
          </>
        ) : proposal ? (
          <>
            <button
              type="button"
              className="btn grad sm"
              disabled={!!busy}
              onClick={() =>
                void acceptEvent(ev!.id).then((ok) => {
                  onClose();
                  toast(ok ? `${ev!.title} added to your calendar` : "Couldn't add it. Try again.");
                })
              }>
              Add to calendar
            </button>
            <button type="button" className="btn line sm" disabled={!!busy} onClick={() => void remove()}>
              Discard
            </button>
          </>
        ) : (own || ev!.googleEditable) && !ev!.allDay ? (
          <>
            <button type="button" className="btn danger sm" disabled={!!busy} onClick={() => void remove()}>
              Delete
            </button>
            {own && <span className="saved">Changes save as you go</span>}
          </>
        ) : null}
      </div>
    </form>
  );
}

