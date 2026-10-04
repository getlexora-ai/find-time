import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { COOKIES } from '@/landing/copy';

import './consent.css';
import { DeclarationTable } from './DeclarationTable';
import { CATEGORIES, DECLARATION, optionalInUse, type OptionalCategory } from './registry';
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
 * While only necessary items are declared, the banner is a notice ("Got it").
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
          <p className="cc-title">{COOKIES.title}</p>
          <p className="cc-text">
            {noticeOnly ? COOKIES.notice : COOKIES.consent(listNames(optional))}{' '}
            <a className="cc-link" href="/privacy#cookies">
              {COOKIES.privacyLink}
            </a>
          </p>
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

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal(); // native focus trap, Esc, inert page behind
  }, []);

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
            {COOKIES.settings}
          </h2>
          <button type="button" className="cc-x" aria-label={COOKIES.close} onClick={onClose}>
            ×
          </button>
        </header>

        <div className="cc-dialog-body">
          <p className="cc-text">{COOKIES.dialogIntro}</p>
          {!noticeOnly && gpcSignal() && <p className="cc-note">{COOKIES.gpc}</p>}

          {CATEGORIES.map((c) => {
            const items = DECLARATION.filter((i) => i.category === c.id);
            const required = c.id === 'necessary';
            const used = items.length > 0;
            const on = required || draft[c.id as OptionalCategory];
            return (
              <section key={c.id} className="cc-cat">
                <div className="cc-cat-row">
                  <div>
                    <h3 className="cc-cat-h">{c.label}</h3>
                    <p className="cc-cat-d">{c.description}</p>
                  </div>
                  {required ? (
                    <span className="cc-tag">{COOKIES.alwaysOn}</span>
                  ) : used ? (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={c.label}
                      className="cc-switch"
                      onClick={() => setDraft((d) => ({ ...d, [c.id]: !d[c.id as OptionalCategory] }))}>
                      <span />
                    </button>
                  ) : (
                    <span className="cc-tag cc-tag-off">{COOKIES.notUsed}</span>
                  )}
                </div>
                {used && (
                  <details className="cc-details">
                    <summary>{COOKIES.items(items.length)}</summary>
                    <div className="cc-table-wrap">
                      <DeclarationTable category={c.id} />
                    </div>
                  </details>
                )}
              </section>
            );
          })}

          <p className="cc-meta">
            {current ? COOKIES.yourChoice(new Date(current.ts).toLocaleDateString(), current.id) : COOKIES.noChoice}
          </p>
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

function listNames(cats: OptionalCategory[]): string {
  const names = cats.map((c) => CATEGORIES.find((x) => x.id === c)!.label.toLowerCase());
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
