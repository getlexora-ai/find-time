import { type FormEvent, useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import type { PreferenceItem } from '@/lib/api-types';

import { forgetPreference, loadPreferences } from '../agent-store';

/**
 * "About you" page inside Manage account (AccountModal.web.tsx): everything Plan
 * with AI reads about you on every message, in one place you can change.
 *
 *   Instructions  what you write yourself, like a project's instructions
 *   Memory        facts it saved from your chats, or that you added
 *   Rules         what you told it to always do or never do, and what it learned
 *
 * Backed by /api/ai/memory (db/029) and /api/ai/preferences.
 */

type Fact = { id: string; text: string; source: 'user' | 'ai'; updatedAt: string };
type Memory = { instructions: string; facts: Fact[] };

const MAX_INSTRUCTIONS = 2000;
const PLACEHOLDER =
  'For example: I work part time, about 25 hours over 5 days, and my shifts change every week. Keep evenings after 18:00 for family. I think best in the morning.';

async function errorOf(r: Response): Promise<string> {
  const b = (await r.json().catch(() => null)) as { error?: string } | null;
  return b?.error ?? 'Could not save. Try again.';
}

export function AboutYou() {
  const [memory, setMemory] = useState<Memory | null>(null);
  const [rules, setRules] = useState<PreferenceItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function reload() {
    try {
      const r = await apiFetch('/api/ai/memory');
      if (!r.ok) throw new Error(await errorOf(r));
      setMemory((await r.json()) as Memory);
      setLoadError(null);
    } catch {
      setLoadError('Could not load what Plan with AI knows about you.');
    }
    setRules(await loadPreferences());
  }

  useEffect(() => {
    void reload();
  }, []);

  return (
    <>
      <h3 className="am-page-title">About you</h3>
      <p className="am-muted am-lead">
        Plan with AI reads this page on every message. Write instructions yourself; it adds to Memory when you tell it
        something lasting in a chat. Change or remove anything here.
      </p>
      {loadError ? <p className="am-err">{loadError}</p> : null}
      {memory ? (
        <>
          <Instructions initial={memory.instructions} />
          <MemoryList facts={memory.facts} onChange={reload} />
        </>
      ) : !loadError ? (
        <p className="am-muted">Loading…</p>
      ) : null}
      <RulesList rules={rules} onChange={reload} />
    </>
  );
}

function Instructions({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await apiFetch('/api/ai/memory', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ instructions: text }),
      });
      if (!r.ok) throw new Error(await errorOf(r));
      setSaved(text.trim());
      setMsg({ ok: true, text: 'Saved. It applies from your next message.' });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not save. Try again.' });
    }
    setBusy(false);
  }

  const changed = text.trim() !== saved.trim();
  return (
    <section className="am-sec">
      <h3>Instructions</h3>
      <form className="am-sec-body" onSubmit={save}>
        <label className="am-muted" htmlFor="am-instr">
          How you live and work, and how you want things planned.
        </label>
        <textarea
          id="am-instr"
          className="am-textarea"
          rows={6}
          maxLength={MAX_INSTRUCTIONS}
          placeholder={PLACEHOLDER}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setMsg(null);
          }}
        />
        <div className="am-row">
          <span className="am-count">
            {text.length} / {MAX_INSTRUCTIONS}
          </span>
          <button type="submit" className="am-btn am-btn-primary" disabled={busy || !changed}>
            Save
          </button>
        </div>
        {msg ? <p className={msg.ok ? 'am-ok' : 'am-err'}>{msg.text}</p> : null}
      </form>
    </section>
  );
}

function MemoryList({ facts, onChange }: { facts: Fact[]; onChange: () => Promise<void> }) {
  const [adding, setAdding] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(method: 'POST' | 'PATCH' | 'DELETE', payload: Record<string, string>) {
    setError(null);
    try {
      const r =
        method === 'DELETE'
          ? await apiFetch(`/api/ai/memory?id=${encodeURIComponent(payload.id)}`, { method })
          : await apiFetch('/api/ai/memory', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error(await errorOf(r));
      await onChange();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.');
      return false;
    }
  }

  return (
    <section className="am-sec">
      <h3>Memory</h3>
      <div className="am-sec-body">
        {facts.length === 0 ? (
          <p className="am-muted">Nothing yet. Tell Plan with AI something lasting, like “I work part time”, and it shows up here.</p>
        ) : (
          <ul className="am-list">
            {facts.map((f) =>
              editing?.id === f.id ? (
                <li key={f.id} className="am-item-row">
                  <form
                    className="am-inline"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send('PATCH', { id: f.id, text: editing.text }).then((ok) => ok && setEditing(null));
                    }}>
                    <input
                      type="text"
                      className="am-input"
                      aria-label="Change this fact"
                      maxLength={300}
                      value={editing.text}
                      onChange={(e) => setEditing({ id: f.id, text: e.target.value })}
                      autoFocus
                    />
                    <button type="button" className="am-btn am-btn-quiet" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                    <button type="submit" className="am-btn am-btn-primary" disabled={!editing.text.trim()}>
                      Save
                    </button>
                  </form>
                </li>
              ) : (
                <li key={f.id} className="am-item-row">
                  <span className="am-fact">
                    {f.text}
                    <span className="am-badge">{f.source === 'ai' ? 'from a chat' : 'added by you'}</span>
                  </span>
                  <span className="am-item-actions">
                    <button type="button" className="am-link" onClick={() => setEditing({ id: f.id, text: f.text })}>
                      Edit
                    </button>
                    <button type="button" className="am-link am-link-danger" aria-label={`Remove: ${f.text}`} onClick={() => void send('DELETE', { id: f.id })}>
                      Remove
                    </button>
                  </span>
                </li>
              ),
            )}
          </ul>
        )}
        <form
          className="am-inline"
          onSubmit={(e) => {
            e.preventDefault();
            if (adding.trim()) void send('POST', { text: adding }).then((ok) => ok && setAdding(''));
          }}>
          <input
            type="text"
            className="am-input"
            aria-label="Add something to remember"
            placeholder="Add something to remember"
            maxLength={300}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
          />
          <button type="submit" className="am-btn am-btn-primary" disabled={!adding.trim()}>
            Add
          </button>
        </form>
        {error ? <p className="am-err">{error}</p> : null}
      </div>
    </section>
  );
}

function RulesList({ rules, onChange }: { rules: PreferenceItem[]; onChange: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  async function remove(item: PreferenceItem) {
    setError(null);
    if (await forgetPreference(item)) await onChange();
    else setError('Could not remove it. Try again.');
  }
  return (
    <section className="am-sec">
      <h3>Rules & preferences</h3>
      <div className="am-sec-body">
        {rules.length === 0 ? (
          <p className="am-muted">None yet. Say something like “never before 10” or “I write better in the mornings” in a chat.</p>
        ) : (
          <ul className="am-list">
            {rules.map((r) => (
              <li key={`${r.source}-${r.id}`} className="am-item-row">
                <span className="am-fact">
                  {r.text}
                  <span className="am-badge">{r.source === 'rule' ? 'rule' : r.active ? 'learned' : 'still learning'}</span>
                </span>
                <span className="am-item-actions">
                  <button type="button" className="am-link am-link-danger" aria-label={`Remove: ${r.text}`} onClick={() => void remove(r)}>
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {error ? <p className="am-err">{error}</p> : null}
      </div>
    </section>
  );
}
