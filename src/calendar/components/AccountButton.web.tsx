import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { apiFetch } from '@/lib/api';
import { signOut, useAuthState } from '@/lib/session';

import { Icon } from '../Icon';
import { N, SANS } from '../tokens';
import { Txt } from '../ui';
import { type AccountPage, AccountModal, Avatar } from './AccountModal.web';
import './account-menu.css';

/**
 * Web account control: the avatar opens a menu with who you are, then
 * "Manage account" (the AccountModal: profile, password, calendars),
 * "Sign out", "Calendars" (the modal, straight on that page), "Set up my
 * week" (onboarding again — also the way back after "Skip for now") and
 * "Delete account", which wipes the Neon data and the sign-in (DELETE
 * /api/me) before signing out.
 *
 * Auth is Better Auth (src/lib/session.ts). The menu is portalled to <body>
 * and placed under the avatar (or above it when there is no room below);
 * Escape or a click outside closes it, arrow keys move through it.
 */
export function AccountButton({ showName = false }: { showName?: boolean }) {
  const { user } = useAuthState();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<AccountPage | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  async function leave() {
    await signOut();
    window.location.assign('/login');
  }

  async function handleDelete() {
    if (!window.confirm('Delete your account and all calendar data? This cannot be undone.')) return;
    try {
      const res = await apiFetch('/api/me', { method: 'DELETE' });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      window.alert('Could not delete the account. Try again.');
      return;
    }
    await leave();
  }

  function pick(action: () => void) {
    setOpen(false);
    action();
  }

  const name = user?.name || user?.email || '';

  return (
    <View style={styles.row}>
      <button
        ref={trigger}
        type="button"
        className="am am-trigger"
        aria-label="Open account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}>
        <Avatar name={name} image={user?.image} size={28} />
      </button>
      {open && user ? (
        <Menu anchor={trigger} onClose={() => setOpen(false)} name={user.name} email={user.email} image={user.image}>
          <MenuItem label="Manage account" icon={<GearIcon />} onClick={() => pick(() => setPage('profile'))} />
          <MenuItem label="Sign out" icon={<ExitIcon />} onClick={() => pick(() => void leave())} />
          <MenuItem
            label="Calendars"
            icon={<Icon name="calendar" size={14} color="currentColor" />}
            onClick={() => pick(() => setPage('calendars'))}
          />
          <MenuItem
            label="Set up my week"
            icon={<Icon name="target" size={14} color="currentColor" />}
            onClick={() => pick(() => window.location.assign('/welcome?redo=1'))}
          />
          <MenuItem
            label="Delete account"
            icon={<Icon name="trash" size={14} color="currentColor" />}
            onClick={() => pick(() => void handleDelete())}
          />
        </Menu>
      ) : null}
      {page ? (
        <AccountModal
          page={page}
          onPage={setPage}
          onClose={() => {
            setPage(null);
            trigger.current?.focus();
          }}
        />
      ) : null}
      {showName && name ? (
        <Txt style={styles.name} numberOfLines={1}>
          {name}
        </Txt>
      ) : null}
    </View>
  );
}

function Menu({
  anchor,
  onClose,
  name,
  email,
  image,
  children,
}: {
  anchor: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  name: string;
  email: string;
  image?: string | null;
  children: React.ReactNode;
}) {
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Under the avatar, left-aligned to it; flipped above when it would run off the bottom.
  // RN-web's Modal mounts its children hidden for a frame, so wait until the menu has a size.
  useLayoutEffect(() => {
    let frame = 0;
    function place() {
      const a = anchor.current?.getBoundingClientRect();
      const p = pop.current?.getBoundingClientRect();
      if (!a || !p) return;
      if (p.height === 0) {
        frame = requestAnimationFrame(place);
        return;
      }
      const gap = 8;
      const below = a.bottom + gap;
      const top = below + p.height > window.innerHeight - gap ? Math.max(gap, a.top - gap - p.height) : below;
      const left = Math.min(Math.max(gap, a.left), window.innerWidth - p.width - gap);
      setPos({ left, top });
      pop.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }
    place();
    return () => cancelAnimationFrame(frame);
  }, [anchor]);

  useEffect(() => {
    const btn = anchor.current;
    function down(e: MouseEvent) {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn?.contains(t)) onClose();
    }
    function key(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        btn?.focus();
      }
    }
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [anchor, onClose]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Tab') return;
    const items = [...(pop.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Tab') {
      onClose();
      return;
    }
    e.preventDefault();
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <div
        ref={pop}
        className="am am-pop"
        role="menu"
        aria-label="Account"
        onKeyDown={onKeyDown}
        style={pos ?? { left: 0, top: 0, visibility: 'hidden' }}>
        <div className="am-pop-head">
          <Avatar name={name || email} image={image} size={44} />
          <div className="am-id">
            {name ? <b>{name}</b> : null}
            <span>{email}</span>
          </div>
        </div>
        <div className="am-items">{children}</div>
      </div>
    </Modal>
  );
}

function MenuItem({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" className="am-item" onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6.6 1.5h2.8l.4 1.9 1.3.7 1.8-.7 1.4 2.4-1.4 1.3v1.5l1.4 1.3-1.4 2.4-1.8-.7-1.3.7-.4 1.9H6.6l-.4-1.9-1.3-.7-1.8.7-1.4-2.4 1.4-1.3V7.1L1.7 5.8l1.4-2.4 1.8.7 1.3-.7.4-1.9z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function ExitIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 2.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M10.5 5 13.5 8l-3 3M13.5 8H6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  name: { flex: 1, color: N.ink2, fontFamily: SANS, fontSize: 13, minWidth: 0 },
});
