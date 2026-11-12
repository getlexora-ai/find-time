import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { addDays, iso, MO, startOfWeek } from '@/calendar/cal-date';

/**
 * Prism's own pickers, so nothing in the editor is a browser control:
 * Dropdown (a listbox) and DatePicker (a month grid). Both open in a layer
 * fixed to the viewport, so a parent's overflow can't clip them, but they
 * stay inside the editor's DOM, so a click in them is "inside" the popover.
 *
 * Keyboard: Enter/Space/↓ opens; ↑↓ (and ←→ by day, PageUp/PageDown by month
 * in the calendar) move; Home/End jump; typing jumps to a match; Enter picks;
 * Escape closes without changing anything (and without closing the editor).
 */

type Layer = { left: number; top: number; width: number; up: boolean };

/** Where the open layer goes: under the button, or above it when there is no room. */
function place(btn: HTMLElement, height: number, width?: number): Layer {
  const r = btn.getBoundingClientRect();
  const up = r.bottom + height + 8 > window.innerHeight && r.top - height - 8 > 0;
  const w = Math.max(width ?? r.width, r.width);
  return { left: Math.min(r.left, window.innerWidth - w - 8), top: up ? r.top - height - 4 : r.bottom + 4, width: w, up };
}

function useOutside(open: boolean, refs: React.RefObject<HTMLElement | null>[], close: () => void) {
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (refs.every((r) => !r.current?.contains(e.target as Node))) close();
    };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, [open, refs, close]);
}

/* ───────────────────────── Dropdown ───────────────────────── */

export type Option<T> = { value: T; label: string; hint?: string };

export function Dropdown<T extends string | number>({
  value,
  options,
  onChange,
  label,
  disabled,
  title,
  className,
  height = 260,
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
  title?: string;
  className?: string;
  height?: number;
}) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [layer, setLayer] = useState<Layer | null>(null);
  const [active, setActive] = useState(0);
  const typed = useRef({ text: '', at: 0 });
  const cur = options.find((o) => o.value === value);

  const show = () => {
    if (disabled || !btn.current) return;
    setLayer(place(btn.current, Math.min(height, options.length * 34 + 10)));
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const hide = (focus = true) => {
    setOpen(false);
    if (focus) btn.current?.focus();
  };
  useOutside(open, [btn, list], () => hide(false));

  // Keep the active option in view by scrolling the list only — scrollIntoView
  // would also scroll the week behind the editor. On open, centre the value.
  const opened = useRef(false);
  useLayoutEffect(() => {
    const ul = list.current;
    if (!open || !ul) {
      opened.current = false;
      return;
    }
    const el = ul.children[active] as HTMLElement | undefined;
    if (!el) return;
    if (!opened.current) {
      ul.scrollTop = el.offsetTop - ul.clientHeight / 2 + el.offsetHeight / 2;
      opened.current = true;
    } else if (el.offsetTop < ul.scrollTop) ul.scrollTop = el.offsetTop - 4;
    else if (el.offsetTop + el.offsetHeight > ul.scrollTop + ul.clientHeight) ul.scrollTop = el.offsetTop + el.offsetHeight - ul.clientHeight + 4;
  }, [open, active]);

  const pick = (i: number) => {
    const o = options[i];
    if (o) onChange(o.value);
    hide();
  };

  const key = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    const last = options.length - 1;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      hide();
    } else if (e.key === 'ArrowDown') setActive((a) => Math.min(last, a + 1));
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(last);
    else if (e.key === 'Enter' || e.key === ' ') pick(active);
    else if (e.key === 'Tab') hide(false);
    else if (e.key.length === 1) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(), at: now };
      const i = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
      if (i >= 0) setActive(i);
      return;
    } else return;
    e.preventDefault();
  };

  return (
    <span className={`dd${className ? ` ${className}` : ''}`}>
      <button
        ref={btn}
        type="button"
        className="dd-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`${label}: ${cur?.label ?? ''}`}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        disabled={disabled}
        title={title}
        onClick={() => (open ? hide() : show())}
        onKeyDown={key}>
        <span className="dd-v">{cur?.label ?? '—'}</span>
        {cur?.hint && <span className="dd-h">{cur.hint}</span>}
        <svg className="dd-c" viewBox="0 0 12 12" aria-hidden>
          <path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && layer && (
        <ul
          ref={list}
          id={id}
          role="listbox"
          aria-label={label}
          className="dd-list"
          style={{ left: layer.left, top: layer.top, minWidth: layer.width, maxHeight: height }}>
          {options.map((o, i) => (
            <li
              key={String(o.value)}
              id={`${id}-${i}`}
              role="option"
              aria-selected={o.value === value}
              className={i === active ? 'on' : undefined}
              onPointerEnter={() => setActive(i)}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => pick(i)}>
              <span>{o.label}</span>
              {o.hint && <small>{o.hint}</small>}
              {o.value === value && (
                <svg viewBox="0 0 12 12" aria-hidden>
                  <path d="m2.5 6.5 2.3 2.2L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

/* ───────────────────────── DatePicker ───────────────────────── */

const WD1 = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const WD_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const fromIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const longDay = (s: string) => {
  const d = fromIso(s);
  return `${WD_FULL[(d.getDay() + 6) % 7]} ${d.getDate()} ${MO[d.getMonth()]}`;
};

export function DatePicker({
  value,
  onChange,
  disabled,
  title,
}: {
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  title?: string;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const cal = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [layer, setLayer] = useState<Layer | null>(null);
  const [focus, setFocus] = useState(value); // the day the keyboard is on
  const todayIso = iso(new Date());

  const show = () => {
    if (disabled || !btn.current) return;
    setLayer(place(btn.current, 300, 268));
    setFocus(value);
    setOpen(true);
  };
  const hide = (f = true) => {
    setOpen(false);
    if (f) btn.current?.focus();
  };
  useOutside(open, [btn, cal], () => hide(false));
  useEffect(() => {
    if (open) (cal.current?.querySelector('[data-focus="true"]') as HTMLElement | null)?.focus({ preventScroll: true });
  }, [open, focus]);

  const f = fromIso(focus);
  const first = new Date(f.getFullYear(), f.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const shift = (n: number) => setFocus(iso(addDays(f, n)));
  const month = (n: number) => {
    const t = new Date(f.getFullYear(), f.getMonth() + n, 1);
    const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    setFocus(iso(new Date(t.getFullYear(), t.getMonth(), Math.min(f.getDate(), last))));
  };
  const pick = (d: string) => {
    onChange(d);
    hide();
  };

  const key = (e: React.KeyboardEvent) => {
    const map: Record<string, () => void> = {
      ArrowLeft: () => shift(-1),
      ArrowRight: () => shift(1),
      ArrowUp: () => shift(-7),
      ArrowDown: () => shift(7),
      PageUp: () => month(-1),
      PageDown: () => month(1),
      Home: () => shift(-((f.getDay() + 6) % 7)),
      End: () => shift(6 - ((f.getDay() + 6) % 7)),
      Enter: () => pick(focus),
      ' ': () => pick(focus),
      Escape: () => hide(),
    };
    const fn = map[e.key];
    if (!fn) return;
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  return (
    <span className="dd dp">
      <button
        ref={btn}
        type="button"
        className="dd-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Day: ${longDay(value)}`}
        disabled={disabled}
        title={title}
        onClick={() => (open ? hide() : show())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            show();
          }
        }}>
        <span className="dd-v">{longDay(value)}</span>
        <svg className="dd-c" viewBox="0 0 12 12" aria-hidden>
          <path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && layer && (
        <div ref={cal} className="dp-cal" role="dialog" aria-label="Choose a day" style={{ left: layer.left, top: layer.top }} onKeyDown={key}>
          <div className="dp-head">
            <b>
              {MO[f.getMonth()]} <em>{f.getFullYear()}</em>
            </b>
            <button type="button" aria-label="Previous month" onClick={() => month(-1)}>
              ‹
            </button>
            <button type="button" aria-label="Next month" onClick={() => month(1)}>
              ›
            </button>
          </div>
          <div className="dp-grid" role="grid">
            {WD1.map((w) => (
              <span key={w} className="dp-wd" role="columnheader">
                {w}
              </span>
            ))}
            {days.map((d) => {
              const s = iso(d);
              const out = d.getMonth() !== f.getMonth();
              return (
                <button
                  key={s}
                  type="button"
                  role="gridcell"
                  tabIndex={s === focus ? 0 : -1}
                  data-focus={s === focus}
                  aria-selected={s === value}
                  aria-label={longDay(s)}
                  className={`dp-d${out ? ' out' : ''}${s === todayIso ? ' today' : ''}${s === value ? ' sel' : ''}`}
                  onClick={() => pick(s)}>
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="dp-foot">
            <button type="button" onClick={() => pick(todayIso)}>
              Today
            </button>
            <button type="button" onClick={() => pick(iso(addDays(new Date(), 1)))}>
              Tomorrow
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
