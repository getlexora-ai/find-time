import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { connect, disconnect, setCalRead, syncNow, useAccounts } from '@/calendar/account-store';
import { confirmPreference, forgetPreference, loadPreferences } from '@/calendar/agent-store';
import { refresh } from '@/calendar/cal-store';
import { AccountModal, type AccountPage } from '@/calendar/components/AccountModal.web';
import { loadWorkHours, MIN_WINDOW_H, setWindow, useHours } from '@/calendar/hours';
import { isPreviewTasks } from '@/calendar/tasks-store';
import { openCookieSettings } from '@/consent/store';
import { apiFetch } from '@/lib/api';
import type { CalendarSettings, PreferenceItem } from '@/lib/api-types';
import { useAuthState } from '@/lib/session';

import './settings.css';

import { Dropdown, type Option } from './Pickers.web';
import type { Toast } from './Week.web';

/**
 * Settings (Prism): one page for everything the planner and Plan with AI go by.
 *
 *   About you   instructions you write, what it remembers from chats, and the
 *               rules and preferences it follows (/api/ai/memory, /api/ai/preferences).
 *               You type them here, or say them in a chat and they land here.
 *   Planning    time zone, working hours, the hours the week shows, and how work
 *               is laid out (/api/calendar/settings → scheduler_profiles, the row
 *               the planner reads).
 *   Calendars   connected Google accounts, which calendars are read, copy to Google.
 *   Account     name, email, password (the existing account dialog), cookies.
 *
 * Every control saves as it changes; only the instructions have a Save button.
 * Only settings the app acts on are here.
 */

type Fact = { id: string; text: string; source: 'user' | 'ai'; updatedAt: string };
type Memory = { instructions: string; facts: Fact[] };

const MAX_INSTRUCTIONS = 2000;
const DAYS = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
] as const;

const SECTIONS = [
  ['about', 'About you'],
  ['planning', 'Planning'],
  ['calendars', 'Calendars'],
  ['account', 'Account'],
] as const;

/** What `/preview` shows: no account, nothing saved. */
const PREVIEW: CalendarSettings = {
  timezone: 'Europe/Berlin',
  window: { start: 6, end: 22 },
  workHours: { mon: { start: 9, end: 18 }, tue: { start: 9, end: 18 }, wed: { start: 9, end: 18 }, thu: { start: 9, end: 18 }, fri: { start: 9, end: 18 }, sat: null, sun: null },
  weekStart: 1,
  clock24: true,
  weekTargetH: null,
  focusGoalH: null,
  pushFocus: false,
  canWriteGoogle: false,
  bufferMin: 10,
  minFocusMin: 45,
  dailyFocusMin: 240,
  travelMin: 0,
  hardWork: 'spread',
};

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
const hourOptions = (from: number, to: number): Option<number>[] => Array.from({ length: to - from + 1 }, (_, i) => ({ value: from + i, label: hh(from + i) }));
const lengthLabel = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${m / 60} h`);
/** The listed lengths, plus the saved one if it isn't among them (set in a chat, say). */
const lengths = (list: number[], current: number, zero?: string): Option<number>[] =>
  [...new Set([...list, current])].sort((a, b) => a - b).map((m) => ({ value: m, label: m === 0 && zero ? zero : lengthLabel(m) }));

async function errorOf(r: Response): Promise<string> {
  const b = (await r.json().catch(() => null)) as { error?: string } | null;
  return b?.error ?? "Couldn't save. Try again.";
}

function timeZones(current: string): Option<string>[] {
  let all: string[] = [];
  try {
    all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    /* older browser: only the saved zone is offered */
  }
  return [...new Set([current, ...all])].sort().map((z) => ({ value: z, label: z.replace(/_/g, ' ') }));
}

export function Settings({
  toast,
  copyOn,
  copyBusy,
  onCopy,
  onAskAI,
}: {
  toast: Toast;
  /** "Copy to Google" lives in the app shell (the drawer has the same switch). */
  copyOn: boolean;
  copyBusy: boolean;
  onCopy: (on: boolean) => void;
  onAskAI: () => void;
}) {
  const preview = isPreviewTasks();
  const [s, setS] = useState<CalendarSettings | null>(preview ? PREVIEW : null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (preview) return;
    apiFetch('/api/calendar/settings')
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setS(((await r.json()) as { settings: CalendarSettings }).settings);
      })
      .catch(() => setFailed(true));
  }, [preview]);

  /** Show the change at once, save it, and put the old value back if the save fails. */
  const save = async (patch: Partial<CalendarSettings>, done?: () => void) => {
    if (!s) return;
    const before = s;
    setS({ ...s, ...patch });
    if (preview) {
      toast('Preview: nothing is saved.');
      return;
    }
    try {
      const r = await apiFetch('/api/calendar/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
      if (!r.ok) throw new Error(await errorOf(r));
      setS(((await r.json()) as { settings: CalendarSettings }).settings);
      done?.();
      toast('Saved.');
    } catch (err) {
      setS(before);
      toast(err instanceof Error && err.message ? err.message : "Couldn't save. Try again.");
    }
  };

  const jump = (id: string) => document.getElementById(`set-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="page set">
      <div className="set-in">
        <nav className="set-nav" aria-label="Settings sections">
          <span className="eyebrow">Settings</span>
          {SECTIONS.map(([id, label]) => (
            <button key={id} type="button" onClick={() => jump(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="set-main">
          <About preview={preview} onAskAI={onAskAI} />
          {s ? <Planning s={s} save={save} /> : <Card id="planning" title="Planning">{failed ? <p className="set-err">Couldn&apos;t load your settings. Reload the page to try again.</p> : <p className="muted">Loading…</p>}</Card>}
          <Calendars copyOn={copyOn} copyBusy={copyBusy} onCopy={onCopy} toast={toast} />
          <Account />
        </div>
      </div>
    </div>
  );
}

function Card({ id, title, lead, children }: { id: string; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section className="set-card" id={`set-${id}`} aria-labelledby={`set-${id}-h`}>
      <h2 id={`set-${id}-h`}>{title}</h2>
      {lead ? <p className="set-lead">{lead}</p> : null}
      {children}
    </section>
  );
}

/** One setting: what it is and what it does on the left, its control on the right. */
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-what">
        <b>{label}</b>
        {hint ? <small>{hint}</small> : null}
      </div>
      <div className="set-ctl">{children}</div>
    </div>
  );
}

/* ───────────────────────── About you ───────────────────────── */

function About({ preview, onAskAI }: { preview: boolean; onAskAI: () => void }) {
  const [memory, setMemory] = useState<Memory | null>(preview ? { instructions: '', facts: [] } : null);
  const [rules, setRules] = useState<PreferenceItem[]>([]);
  const [loadError, setLoadError] = useState(false);

  const reload = useCallback(async () => {
    if (preview) return;
    const [mem, prefs] = await Promise.all([
      apiFetch('/api/ai/memory')
        .then(async (r) => (r.ok ? ((await r.json()) as Memory) : null))
        .catch(() => null),
      loadPreferences(),
    ]);
    if (mem) setMemory(mem);
    setLoadError(!mem);
    setRules(prefs);
  }, [preview]);
  useEffect(() => {
    let live = true;
    if (preview) return;
    void Promise.all([
      apiFetch('/api/ai/memory')
        .then(async (r) => (r.ok ? ((await r.json()) as Memory) : null))
        .catch(() => null),
      loadPreferences(),
    ]).then(([mem, prefs]) => {
      if (!live) return;
      if (mem) setMemory(mem);
      setLoadError(!mem);
      setRules(prefs);
    });
    return () => {
      live = false;
    };
  }, [preview]);

  return (
    <Card
      id="about"
      title="About you"
      lead="Plan with AI reads this on every message. Write it here yourself, or say it in a chat and it is added for you. Change or remove anything.">
      {loadError ? <p className="set-err">Couldn&apos;t load what Plan with AI knows about you. Reload the page to try again.</p> : null}
      {memory ? (
        <>
          <Instructions initial={memory.instructions} preview={preview} />
          <Facts facts={memory.facts} preview={preview} onChange={reload} />
        </>
      ) : !loadError ? (
        <p className="muted">Loading…</p>
      ) : null}
      <Rules rules={rules} onChange={reload} onAskAI={onAskAI} />
    </Card>
  );
}

function Instructions({ initial, preview }: { initial: string; preview: boolean }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (preview) {
      setMsg({ ok: true, text: 'Preview: nothing is saved.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await apiFetch('/api/ai/memory', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ instructions: text }) });
      if (!r.ok) throw new Error(await errorOf(r));
      setSaved(text);
      setMsg({ ok: true, text: 'Saved. It applies from your next message.' });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Couldn't save. Try again." });
    }
    setBusy(false);
  }

  return (
    <form className="set-block" onSubmit={submit}>
      <label className="set-sub" htmlFor="set-instr">
        Your wishes
        <small>How you live and work, and how you want your time planned. In your own words.</small>
      </label>
      <textarea
        id="set-instr"
        className="set-field"
        rows={6}
        maxLength={MAX_INSTRUCTIONS}
        placeholder="For example: I work part time, about 25 hours over 5 days, and my shifts change every week. Keep evenings after 18:00 for family. I think best in the morning."
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setMsg(null);
        }}
      />
      <div className="set-line">
        <span className="set-count">
          {text.length} / {MAX_INSTRUCTIONS}
        </span>
        {msg ? (
          <span className={msg.ok ? 'set-ok' : 'set-err'} role="status">
            {msg.text}
          </span>
        ) : null}
        <button type="submit" className="btn ink sm" disabled={busy || text.trim() === saved.trim()}>
          Save
        </button>
      </div>
    </form>
  );
}

function Facts({ facts, preview, onChange }: { facts: Fact[]; preview: boolean; onChange: () => Promise<void> }) {
  const [adding, setAdding] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(method: 'POST' | 'PATCH' | 'DELETE', payload: Record<string, string>) {
    setError(null);
    if (preview) {
      setError('Preview: nothing is saved.');
      return false;
    }
    try {
      const r =
        method === 'DELETE'
          ? await apiFetch(`/api/ai/memory?id=${encodeURIComponent(payload.id)}`, { method })
          : await apiFetch('/api/ai/memory', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error(await errorOf(r));
      await onChange();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
      return false;
    }
  }

  return (
    <div className="set-block">
      <div className="set-sub">
        What it remembers
        <small>Lasting things about you. Plan with AI adds one when you tell it something like “I work part time”; you can add your own.</small>
      </div>
      {facts.length ? (
        <ul className="set-list">
          {facts.map((f) =>
            editing?.id === f.id ? (
              <li key={f.id}>
                <form
                  className="set-inline"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send('PATCH', { id: f.id, text: editing.text }).then((ok) => ok && setEditing(null));
                  }}>
                  <input className="set-field" aria-label="Change this" maxLength={300} value={editing.text} onChange={(e) => setEditing({ id: f.id, text: e.target.value })} autoFocus />
                  <button type="button" className="chip" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn ink sm" disabled={!editing.text.trim()}>
                    Save
                  </button>
                </form>
              </li>
            ) : (
              <li key={f.id}>
                <span className="set-text">{f.text}</span>
                <span className="set-tag">{f.source === 'ai' ? 'from a chat' : 'added by you'}</span>
                <button type="button" className="chip" onClick={() => setEditing({ id: f.id, text: f.text })}>
                  Edit
                </button>
                <button type="button" className="chip" aria-label={`Remove: ${f.text}`} onClick={() => void send('DELETE', { id: f.id })}>
                  Remove
                </button>
              </li>
            ),
          )}
        </ul>
      ) : (
        <p className="muted">Nothing yet.</p>
      )}
      <form
        className="set-inline"
        onSubmit={(e) => {
          e.preventDefault();
          if (adding.trim()) void send('POST', { text: adding }).then((ok) => ok && setAdding(''));
        }}>
        <input className="set-field" aria-label="Add something to remember" placeholder="Add something to remember" maxLength={300} value={adding} onChange={(e) => setAdding(e.target.value)} />
        <button type="submit" className="btn line sm" disabled={!adding.trim()}>
          Add
        </button>
      </form>
      {error ? <p className="set-err">{error}</p> : null}
    </div>
  );
}

function Rules({ rules, onChange, onAskAI }: { rules: PreferenceItem[]; onChange: () => Promise<void>; onAskAI: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const act = async (ok: Promise<boolean>) => {
    setError(null);
    if (await ok) await onChange();
    else setError("Couldn't change that. Try again.");
  };
  return (
    <div className="set-block">
      <div className="set-sub">
        Rules and habits of yours
        <small>A rule is something you said, like “never before 10”: the planner always obeys it. The rest it noticed from how you move and accept blocks, and only uses to choose between free times.</small>
      </div>
      {rules.length ? (
        <ul className="set-list">
          {rules.map((r) => {
            const learning = r.source === 'learned' && !r.active;
            return (
              <li key={`${r.source}-${r.id}`}>
                <span className="set-text">{r.text}</span>
                <span className="set-tag">{r.source === 'rule' ? 'rule' : learning ? 'still learning' : 'noticed'}</span>
                {learning ? (
                  <button type="button" className="chip" title="Use this from now on" onClick={() => void act(confirmPreference(r))}>
                    That&apos;s right
                  </button>
                ) : null}
                <button type="button" className="chip" aria-label={`Remove: ${r.text}`} onClick={() => void act(forgetPreference(r))}>
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">None yet.</p>
      )}
      <div className="set-line">
        <span className="muted">A new rule is said in words, in a chat.</span>
        <button type="button" className="btn line sm" onClick={onAskAI}>
          Tell Plan with AI
        </button>
      </div>
      {error ? <p className="set-err">{error}</p> : null}
    </div>
  );
}

/* ───────────────────────── Planning ───────────────────────── */

function Planning({ s, save }: { s: CalendarSettings; save: (p: Partial<CalendarSettings>, done?: () => void) => Promise<void> }) {
  const hours = useHours();
  const zones = useMemo(() => timeZones(s.timezone), [s.timezone]);

  const setDay = (day: string, v: { start: number; end: number } | null) => void save({ workHours: { ...s.workHours, [day]: v } }, () => void loadWorkHours());
  // "Your hours" is what the week draws; it is kept on this device and in your profile.
  const setShown = (start: number, end: number) => {
    setWindow(start, end);
    void save({ window: { start, end } });
  };

  return (
    <Card id="planning" title="Planning" lead="What the planner goes by when it places anything. Plan with AI reads the same values, and changes them when you ask it to.">
      <Row label="Time zone" hint="Every time is shown in it. Changing it re-reads your Google calendars.">
        <Dropdown label="Time zone" value={s.timezone} options={zones} onChange={(z) => void save({ timezone: z }, () => void syncNow(true))} />
      </Row>

      <div className="set-block">
        <div className="set-sub">
          Working hours
          <small>Work is planned inside these. A day switched off is a day off.</small>
        </div>
        <div className="set-days">
          {DAYS.map(([key, name]) => {
            const v = s.workHours[key] ?? null;
            return (
              <div className="set-day" key={key}>
                <label className="set-sw">
                  <input type="checkbox" role="switch" checked={!!v} onChange={() => setDay(key, v ? null : { start: 9, end: 18 })} />
                  <span>{name}</span>
                </label>
                {v ? (
                  <span className="set-span">
                    <Dropdown label={`${name} starts`} value={v.start} options={hourOptions(0, v.end - 1)} onChange={(h) => setDay(key, { start: h, end: v.end })} />
                    <span className="muted">to</span>
                    <Dropdown label={`${name} ends`} value={v.end} options={hourOptions(v.start + 1, 24)} onChange={(h) => setDay(key, { start: v.start, end: h })} />
                  </span>
                ) : (
                  <span className="muted">Day off</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Row label="Hours the week shows" hint="The span of the day drawn on the planner, at least 4 hours. Personal things can go anywhere inside it.">
        <span className="set-span">
          <Dropdown label="Day starts" value={hours.start} options={hourOptions(0, hours.end - MIN_WINDOW_H)} onChange={(h) => setShown(h, hours.end)} />
          <span className="muted">to</span>
          <Dropdown label="Day ends" value={hours.end} options={hourOptions(hours.start + MIN_WINDOW_H, 24)} onChange={(h) => setShown(hours.start, h)} />
        </span>
      </Row>

      <Row label="Gap between things" hint="Kept free before and after a block the planner places.">
        <Dropdown label="Gap between things" value={s.bufferMin} options={lengths([0, 5, 10, 15, 20, 30, 45, 60], s.bufferMin, 'None')} onChange={(m) => void save({ bufferMin: m })} />
      </Row>
      <Row label="Shortest focus block" hint="A free gap shorter than this is not used for focus work.">
        <Dropdown label="Shortest focus block" value={s.minFocusMin} options={lengths([15, 30, 45, 60, 90, 120], s.minFocusMin)} onChange={(m) => void save({ minFocusMin: m })} />
      </Row>
      <Row label="Demanding work per day" hint="The most hard work planned on one day, where your deadlines allow.">
        <Dropdown
          label="Demanding work per day"
          value={s.dailyFocusMin}
          options={lengths([60, 120, 180, 240, 300, 360, 480, 600, 720], s.dailyFocusMin)}
          onChange={(m) => void save({ dailyFocusMin: m })}
        />
      </Row>
      <Row label="Hard tasks" hint="Spread them across the week, or keep them together on as few days as possible.">
        <span className="set-seg" role="group" aria-label="Hard tasks">
          <button type="button" aria-pressed={s.hardWork === 'spread'} onClick={() => s.hardWork !== 'spread' && void save({ hardWork: 'spread' })}>
            Spread out
          </button>
          <button type="button" aria-pressed={s.hardWork === 'cluster'} onClick={() => s.hardWork !== 'cluster' && void save({ hardWork: 'cluster' })}>
            Together
          </button>
        </span>
      </Row>
      <Row label="Travel time" hint="Kept free before and after anything with an address when your week is planned. Video calls don't count.">
        <Dropdown label="Travel time" value={s.travelMin} options={lengths([0, 10, 15, 20, 30, 45, 60, 90, 120], s.travelMin, 'Off')} onChange={(m) => void save({ travelMin: m })} />
      </Row>
    </Card>
  );
}

/* ───────────────────────── Calendars ───────────────────────── */

function Calendars({ copyOn, copyBusy, onCopy, toast }: { copyOn: boolean; copyBusy: boolean; onCopy: (on: boolean) => void; toast: Toast }) {
  const { accounts, syncing } = useAccounts();
  const [sure, setSure] = useState<string | null>(null);
  const primary = accounts.flatMap((a) => a.calendars).find((c) => c.isPrimary);

  return (
    <Card id="calendars" title="Calendars" lead="Find Time reads the Google calendars you switch on and plans around them. It keeps their times, not what the events say.">
      {accounts.map((a) => (
        <div className="set-block" key={a.id}>
          <div className="set-line">
            <div className="set-sub">
              {a.email}
              <small>{a.syncError ? `Sync failed: ${a.syncError}` : a.lastSyncAt ? `Last read ${new Date(a.lastSyncAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : 'Not read yet'}</small>
            </div>
            {sure === a.id ? (
              <>
                <button type="button" className="chip" onClick={() => setSure(null)}>
                  Keep
                </button>
                <button
                  type="button"
                  className="btn danger sm"
                  onClick={() => {
                    setSure(null);
                    void disconnect(a.id).then(() => toast(`Disconnected ${a.email}. Its events are gone from Find Time.`));
                  }}>
                  Disconnect {a.email}
                </button>
              </>
            ) : (
              <button type="button" className="chip" onClick={() => setSure(a.id)}>
                Disconnect
              </button>
            )}
          </div>
          <div className="set-days">
            {a.calendars.map((c) => (
              <div className="set-day" key={c.id}>
                <label className="set-sw">
                  <input type="checkbox" role="switch" checked={c.readEnabled} onChange={() => void setCalRead(c.id, !c.readEnabled).then(() => refresh())} />
                  <i style={{ background: c.color || 'var(--event-bd)' }} />
                  <span>{c.name}</span>
                </label>
                <span className="muted">{c.readEnabled ? 'Shown and planned around' : 'Ignored'}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {!accounts.length ? <p className="muted">No calendar connected yet.</p> : null}
      <div className="set-line">
        <button type="button" className="btn line sm" onClick={() => void connect()}>
          {accounts.length ? 'Connect another Google account' : 'Connect Google Calendar'}
        </button>
        {accounts.length ? (
          <button type="button" className="chip" disabled={syncing} onClick={() => void syncNow(true)}>
            {syncing ? 'Reading…' : 'Read calendars now'}
          </button>
        ) : null}
      </div>
      {accounts.length ? (
        <Row
          label="Copy new blocks to Google"
          hint={`New blocks get a private copy on ${primary?.name ?? 'your primary Google calendar'}, so people booking you see the time is taken. Blocks you already have keep their own setting.`}>
          <label className="set-sw">
            <input type="checkbox" role="switch" aria-label="Copy new blocks to Google" checked={copyOn} disabled={copyBusy} onChange={() => onCopy(!copyOn)} />
          </label>
        </Row>
      ) : null}
    </Card>
  );
}

/* ───────────────────────── Account ───────────────────────── */

function Account() {
  const { user } = useAuthState();
  const [modal, setModal] = useState<AccountPage | null>(null);
  return (
    <Card id="account" title="Account">
      <Row label={user?.name || 'Your profile'} hint={user?.email ?? 'Name and email'}>
        <button type="button" className="btn line sm" onClick={() => setModal('profile')}>
          Edit profile
        </button>
      </Row>
      <Row label="Password" hint="How you sign in.">
        <button type="button" className="btn line sm" onClick={() => setModal('security')}>
          Change password
        </button>
      </Row>
      <Row label="Cookies" hint="What this browser may store for Find Time.">
        <button type="button" className="btn line sm" onClick={openCookieSettings}>
          Cookie settings
        </button>
      </Row>
      {modal ? <AccountModal page={modal} onPage={setModal} onClose={() => setModal(null)} /> : null}
    </Card>
  );
}
