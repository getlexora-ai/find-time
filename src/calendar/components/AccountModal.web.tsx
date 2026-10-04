import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';

import { Modal } from 'react-native';

import { authClient } from '@/lib/auth-client';
import { useAuthState } from '@/lib/session';

import { Icon, type IconName } from '../Icon';
import { CalendarSettings } from './CalendarSettings';
import './account-menu.css';

/**
 * "Manage account" (web): a modal over the app with three pages — Profile
 * (name, email, how you sign in), Security (change password) and Calendars
 * (CalendarSettings: connect / sync / disconnect Google). Opened from the
 * account menu in AccountButton.web.tsx, on the page that menu item names.
 *
 * Everything goes through Better Auth's client (`updateUser`,
 * `changePassword`, `listAccounts`); the session is re-read after a change so
 * the menu's name updates. Escape or the backdrop closes it; Tab stays inside;
 * the caller puts focus back where it belongs.
 */

export type AccountPage = 'profile' | 'security' | 'calendars';

const PAGES: { id: AccountPage; label: string; icon: IconName }[] = [
  { id: 'profile', label: 'Profile', icon: 'users' },
  { id: 'security', label: 'Security', icon: 'shield' },
  { id: 'calendars', label: 'Calendars', icon: 'calendar' },
];

export function AccountModal({ page, onPage, onClose }: { page: AccountPage; onPage: (p: AccountPage) => void; onClose: () => void }) {
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // RN-web's Modal shows its children a frame after mounting; focus once they're visible.
    const frame = requestAnimationFrame(() => card.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus());
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
    };
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !card.current) return;
    const items = [...card.current.querySelectorAll<HTMLElement>('button, input, a[href], [tabindex]:not([tabindex="-1"])')].filter(
      (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <div className="am am-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div ref={card} className="am-modal" role="dialog" aria-modal="true" aria-label="Manage account" onKeyDown={onKeyDown}>
          <nav className="am-nav" aria-label="Account">
            <h2>Account</h2>
            <p>Manage your account info.</p>
            {PAGES.map((p) => (
              <button key={p.id} type="button" className="am-tab" aria-current={p.id === page ? 'page' : undefined} onClick={() => onPage(p.id)}>
                <Icon name={p.icon} size={16} color="currentColor" />
                {p.label}
              </button>
            ))}
          </nav>
          <div className="am-page">
            {page === 'profile' ? <ProfilePage /> : null}
            {page === 'security' ? <SecurityPage /> : null}
            {page === 'calendars' ? <CalendarSettings /> : null}
          </div>
          <button type="button" className="am-close" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={16} color="currentColor" />
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Which ways this user can sign in: 'credential' (password) and/or 'google'. */
function useProviders(): string[] | null {
  const [providers, setProviders] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    void authClient.listAccounts().then(({ data }) => {
      if (live) setProviders((data ?? []).map((a) => a.providerId));
    });
    return () => {
      live = false;
    };
  }, []);
  return providers;
}

function ProfilePage() {
  const { user, refetch } = useAuthState();
  const providers = useProviders();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  const display = user.name || user.email;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.updateUser({ name: name.trim() });
    setBusy(false);
    if (err) return setError(err.message ?? 'Could not save. Try again.');
    refetch();
    setEditing(false);
  }

  return (
    <>
      <h3 className="am-page-title">Profile details</h3>
      <section className="am-sec">
        <h3>Profile</h3>
        <div className="am-sec-body">
          {editing ? (
            <form className="am-form" onSubmit={save}>
              <h4>Update profile</h4>
              <div className="am-field">
                <label htmlFor="am-name">Name</label>
                <input id="am-name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>
              {error ? <p className="am-err">{error}</p> : null}
              <div className="am-actions">
                <button type="button" className="am-btn am-btn-quiet" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button type="submit" className="am-btn am-btn-primary" disabled={busy}>
                  Save
                </button>
              </div>
            </form>
          ) : (
            <div className="am-row">
              <div className="am-who">
                <Avatar name={display} image={user.image} size={44} />
                <span>{user.name || '—'}</span>
              </div>
              <button
                type="button"
                className="am-link"
                onClick={() => {
                  setName(user.name ?? '');
                  setError(null);
                  setEditing(true);
                }}>
                Update profile
              </button>
            </div>
          )}
        </div>
      </section>
      <section className="am-sec">
        <h3>Email address</h3>
        <div className="am-sec-body">
          <div className="am-row">
            <span>
              {user.email}
              <span className="am-badge">Primary</span>
            </span>
          </div>
        </div>
      </section>
      {providers?.includes('google') ? (
        <section className="am-sec">
          <h3>Connected accounts</h3>
          <div className="am-sec-body">
            <div className="am-row">
              <span className="am-who">
                <GoogleG />
                Google
              </span>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}

function SecurityPage() {
  const providers = useProviders();
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [others, setOthers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (next.length < 8) return setError('Use at least 8 characters for your new password.');
    if (next !== confirm) return setError('The new passwords don’t match.');
    setBusy(true);
    const { error: err } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: others,
    });
    setBusy(false);
    if (err) {
      return setError(err.code === 'INVALID_PASSWORD' ? 'Your current password is not right.' : (err.message ?? 'Could not change it. Try again.'));
    }
    setEditing(false);
    setDone(true);
    setCurrent('');
    setNext('');
    setConfirm('');
  }

  return (
    <>
      <h3 className="am-page-title">Security</h3>
      <section className="am-sec">
        <h3>Password</h3>
        <div className="am-sec-body">
          {providers === null ? null : !providers.includes('credential') ? (
            <p className="am-muted">You sign in with Google, so there is no password to change.</p>
          ) : editing ? (
            <form className="am-form" onSubmit={save}>
              <h4>Update password</h4>
              <div className="am-field">
                <label htmlFor="am-cur">Current password</label>
                <input
                  id="am-cur"
                  type="password"
                  autoComplete="current-password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="am-field">
                <label htmlFor="am-new">New password</label>
                <input id="am-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
              </div>
              <div className="am-field">
                <label htmlFor="am-conf">Confirm password</label>
                <input id="am-conf" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              <label className="am-check">
                <input type="checkbox" checked={others} onChange={(e) => setOthers(e.target.checked)} />
                <span>Sign out of all other devices</span>
              </label>
              {error ? <p className="am-err">{error}</p> : null}
              <div className="am-actions">
                <button type="button" className="am-btn am-btn-quiet" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button type="submit" className="am-btn am-btn-primary" disabled={busy || !current || !next}>
                  Save
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="am-row">
                <span>••••••••••</span>
                <button
                  type="button"
                  className="am-link"
                  onClick={() => {
                    setError(null);
                    setDone(false);
                    setEditing(true);
                  }}>
                  Update password
                </button>
              </div>
              {done ? <p className="am-ok">Password updated.</p> : null}
            </>
          )}
        </div>
      </section>
    </>
  );
}

/** The user's photo (Google) when there is one, else their initials. */
export function Avatar({ name, image, size }: { name: string; image?: string | null; size: number }) {
  return (
    <span className="am-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden="true">
      {image ? <img src={image} alt="" referrerPolicy="no-referrer" /> : initials(name)}
    </span>
  );
}

export function initials(name: string): string {
  const parts = name
    .trim()
    .split(/[\s@.]+/)
    .filter(Boolean);
  if (parts.length === 0) return '·';
  return (parts[0][0] + (name.includes('@') ? '' : (parts[1]?.[0] ?? ''))).toUpperCase();
}

function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
