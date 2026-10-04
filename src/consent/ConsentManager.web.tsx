import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';

import { COOKIES } from '@/landing/copy';

import './consent.css';
import { DeclarationTable } from './DeclarationTable';
import { CATEGORIES, DECLARATION, optionalInUse, THIRD_PARTY_HOSTS, type OptionalCategory } from './registry';
import {
  gpcSignal,
  needsChoice,
  NONE,
  onConsentChange,
  onOpenSettings,
  readConsent,
  saveConsent,
  type Choices,
} from './store';

/**
 * Site-wide cookie banner + settings dialog (web). Mounted once in
 * src/app/_layout.tsx, so it covers the landing, legal, auth and app routes.
 *
 * What keeps this on the right side of GDPR / §25 TDDDG:
 *   - nothing optional runs before a choice (store.ts `loadScript`),
 *   - "Reject all" sits next to "Accept all" with the same weight, first layer,
 *   - no pre-ticked boxes; categories are opt-in one by one,
 *   - the dialog reopens from "Cookie settings" in every footer, from
 *     /privacy#cookies, and from any link to `#cookie-settings`, so withdrawing
 *     is as easy as agreeing (Art. 7(3)),
 *   - each choice is logged with a random id as proof (Art. 7(1)), and asked
 *     again after 12 months or when the declaration grows,
 *   - Global Privacy Control counts as "reject all".
 *
 * While only necessary items are declared, the banner is a notice ("Got it");
 * Preferences (ft-theme, ft-hours) are optional, so today it asks for a choice.
 */

const subscribeNone = () => () => {};

export function ConsentManager() {
  // Render nothing on the server and on the first client paint (no hydration mismatch).
  const mounted = useSyncExternalStore(subscribeNone, () => true, () => false);
  const [, bump] = useState(0);
  const [open, setOpen] = useState(false);
  const optional = optionalInUse();
  const noticeOnly = optional.length === 0;

  useEffect(() => onConsentChange(() => bump((n) => n + 1)), []);
  useEffect(() => onOpenSettings(() => setOpen(true)), []);

  // GPC: a standing "no" from the browser. Only meaningful once there is something to refuse.
  useEffect(() => {
    if (!noticeOnly && needsChoice() && gpcSignal()) saveConsent(NONE, 'gpc');
  }, [noticeOnly]);

  // `#cookie-settings` anywhere opens the dialog (in-app links, emails, support replies).
  useEffect(() => {
    const check = () => {
      if (window.location.hash === '#cookie-settings') setOpen(true);
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, []);

  if (!mounted) return null;

  // Drop `#cookie-settings` on the way out, so the same link opens it again.
  const close = () => {
    setOpen(false);
    if (window.location.hash === '#cookie-settings') {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  const all = (on: boolean): Choices => ({
    preferences: on && optional.includes('preferences'),
    statistics: on && optional.includes('statistics'),
    marketing: on && optional.includes('marketing'),
  });

  return (
    <>
      {needsChoice() && !open && (
        <section className="cc-banner" aria-label={COOKIES.title} role="region">
          <p className="cc-title">
            <CookieMark />
            {COOKIES.title}
          </p>
          <p className="cc-text">
            {noticeOnly ? COOKIES.notice : COOKIES.consent(listNames(optional))}{' '}
            <a className="cc-link" href="/privacy#cookies">
              {COOKIES.privacyLink}
            </a>
          </p>
          <ul className="cc-strip" aria-label={COOKIES.settings}>
            {CATEGORIES.map((c) => {
              const used = c.id === 'necessary' || optional.includes(c.id as OptionalCategory);
              return (
                <li key={c.id} className={c.id === 'necessary' ? 'cc-chip cc-chip-on' : used ? 'cc-chip' : 'cc-chip cc-chip-off'}>
                  <span className="cc-chip-dot" aria-hidden />
                  {c.label}
                  {!used && <span className="cc-sr">, {COOKIES.notUsed.toLowerCase()}</span>}
                </li>
              );
            })}
          </ul>
          <div className="cc-actions">
            {noticeOnly ? (
              <>
                <button type="button" className="cc-btn cc-ghost" onClick={() => setOpen(true)}>
                  {COOKIES.settings}
                </button>
                <button type="button" className="cc-btn cc-solid" onClick={() => saveConsent(NONE, 'notice')}>
                  {COOKIES.gotIt}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="cc-btn cc-ghost" onClick={() => setOpen(true)}>
                  {COOKIES.customize}
                </button>
                <button type="button" className="cc-btn cc-solid" onClick={() => saveConsent(all(false), 'reject-all')}>
                  {COOKIES.rejectAll}
                </button>
                <button type="button" className="cc-btn cc-solid" onClick={() => saveConsent(all(true), 'accept-all')}>
                  {COOKIES.acceptAll}
                </button>
              </>
            )}
          </div>
        </section>
      )}
      {open && (
        <SettingsDialog
          noticeOnly={noticeOnly}
          onClose={close}
          onSave={(choices, method) => {
            saveConsent(choices, method);
            close();
          }}
          all={all}
        />
      )}
    </>
  );
}

function SettingsDialog({
  noticeOnly,
  onClose,
  onSave,
  all,
}: {
  noticeOnly: boolean;
  onClose: () => void;
  onSave: (c: Choices, method: 'custom' | 'accept-all' | 'reject-all' | 'notice') => void;
  all: (on: boolean) => Choices;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const current = readConsent();
  const [draft, setDraft] = useState<Choices>(current?.choices ?? NONE);
  const [tab, setTab] = useState<Tab>('consent');

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal(); // native focus trap, Esc, inert page behind
  }, []);

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const onTabKey = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length];
    setTab(next);
    document.getElementById(`cc-tab-${next}`)?.focus();
  };

  return (
    <dialog
      ref={ref}
      className="cc-dialog"
      aria-labelledby="cc-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // backdrop click
      }}>
      <div className="cc-dialog-in">
        <header className="cc-dialog-head">
          <h2 id="cc-dialog-title" className="cc-h">
            <CookieMark />
            {COOKIES.settings}
          </h2>
          <button type="button" className="cc-x" aria-label={COOKIES.close} onClick={onClose}>
            ×
          </button>
        </header>

        <div className="cc-tabs" role="tablist" aria-label={COOKIES.settings} onKeyDown={onTabKey}>
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`cc-tab-${t}`}
              aria-controls="cc-panel"
              aria-selected={tab === t}
              tabIndex={tab === t ? 0 : -1}
              className="cc-tab"
              onClick={() => setTab(t)}>
              {COOKIES.tabs[t]}
              {t === 'details' && <span className="cc-count">{DECLARATION.length}</span>}
            </button>
          ))}
        </div>

        <div className="cc-dialog-body" role="tabpanel" id="cc-panel" aria-labelledby={`cc-tab-${tab}`}>
          {tab === 'consent' && (
            <>
              <p className="cc-text">{COOKIES.dialogIntro}</p>
              {!noticeOnly && gpcSignal() && <p className="cc-note">{COOKIES.gpc}</p>}
              {CATEGORIES.map((c) => {
                const required = c.id === 'necessary';
                const used = DECLARATION.some((i) => i.category === c.id);
                const on = required || (used && draft[c.id as OptionalCategory]);
                return (
                  <section key={c.id} className="cc-cat">
                    <div>
                      <h3 className="cc-cat-h">
                        {c.label}
                        {required ? (
                          <span className="cc-tag">{COOKIES.alwaysOn}</span>
                        ) : (
                          !used && <span className="cc-tag cc-tag-off">{COOKIES.notUsed}</span>
                        )}
                      </h3>
                      <p className="cc-cat-d">{c.description}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={c.label}
                      disabled={required || !used}
                      className="cc-switch"
                      onClick={() => setDraft((d) => ({ ...d, [c.id]: !d[c.id as OptionalCategory] }))}>
                      <span />
                    </button>
                  </section>
                );
              })}
            </>
          )}

          {tab === 'details' &&
            CATEGORIES.map((c) => {
              const items = DECLARATION.filter((i) => i.category === c.id);
              return (
                <details key={c.id} className="cc-acc" open={c.id === 'necessary'}>
                  <summary>
                    <span className="cc-acc-h">{c.label}</span>
                    <span className="cc-count">{items.length}</span>
                  </summary>
                  <p className="cc-cat-d">{c.description}</p>
                  {items.length > 0 ? (
                    <div className="cc-table-wrap">
                      <DeclarationTable category={c.id} />
                    </div>
                  ) : (
                    <p className="cc-empty">{COOKIES.noItems}</p>
                  )}
                </details>
              );
            })}

          {tab === 'about' && (
            <>
              {COOKIES.about
                .filter((_, i) => i < 2 || firstPartyOnly())
                .map((t) => (
                  <p key={t} className="cc-text cc-para">
                    {t}
                  </p>
                ))}
              <p className="cc-text cc-para">
                <a className="cc-link" href="/privacy#cookies">
                  {COOKIES.privacyLink}
                </a>
              </p>
              <div className="cc-record">
                <p className="cc-record-h">{COOKIES.recordTitle}</p>
                <p className="cc-meta">
                  {current
                    ? COOKIES.yourChoice(new Date(current.ts).toLocaleDateString(), current.id)
                    : COOKIES.noChoice}
                </p>
                <p className="cc-cat-d">{COOKIES.withdraw}</p>
              </div>
            </>
          )}
        </div>

        <footer className="cc-actions cc-dialog-foot">
          {noticeOnly ? (
            <button type="button" className="cc-btn cc-solid" onClick={() => onSave(NONE, 'notice')}>
              {COOKIES.gotIt}
            </button>
          ) : (
            <>
              <button type="button" className="cc-btn cc-ghost" onClick={() => onSave(draft, 'custom')}>
                {COOKIES.save}
              </button>
              <button type="button" className="cc-btn cc-solid" onClick={() => onSave(all(false), 'reject-all')}>
                {COOKIES.rejectAll}
              </button>
              <button type="button" className="cc-btn cc-solid" onClick={() => onSave(all(true), 'accept-all')}>
                {COOKIES.acceptAll}
              </button>
            </>
          )}
        </footer>
      </div>
    </dialog>
  );
}

const TABS = ['consent', 'details', 'about'] as const;
type Tab = (typeof TABS)[number];

/** True while every declared item is Find Time's own and no other host is contacted. */
function firstPartyOnly(): boolean {
  return THIRD_PARTY_HOSTS.length === 0 && DECLARATION.every((i) => i.provider.startsWith('Find Time'));
}

function CookieMark() {
  return (
    <svg className="cc-mark" viewBox="0 0 20 20" width="18" height="18" aria-hidden>
      <path
        d="M10 2.5a7.5 7.5 0 1 0 7.4 8.7 2.6 2.6 0 0 1-3.1-2.6 2.6 2.6 0 0 1-2.9-3.3A2.6 2.6 0 0 1 10 2.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="9" r="1" fill="currentColor" />
      <circle cx="9.5" cy="13.5" r="1" fill="currentColor" />
      <circle cx="13.5" cy="13" r="0.9" fill="currentColor" />
    </svg>
  );
}

function listNames(cats: OptionalCategory[]): string {
  const names = cats.map((c) => CATEGORIES.find((x) => x.id === c)!.label.toLowerCase());
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
