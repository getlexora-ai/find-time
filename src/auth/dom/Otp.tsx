/**
 * Six one-digit boxes for an emailed code. Typing advances, Backspace steps
 * back, arrows move, and pasting the whole code (or one-time-code autofill
 * into the first box) fills every box. `onComplete` fires once the sixth
 * digit lands, so a pasted code verifies without a click.
 */
import { type ClipboardEvent, type KeyboardEvent, useEffect, useRef } from 'react';

type Props = {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  invalid?: boolean;
  /** bump to replay the shake */
  shake?: number;
  disabled?: boolean;
};

const N = 6;

export function Otp({ value, onChange, onComplete, invalid, shake = 0, disabled }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    refs.current[Math.min(value.length, N - 1)]?.focus();
    // focus only on mount; later focus follows the keyboard handlers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Replay the shake animation each time `shake` changes while invalid.
  useEffect(() => {
    const el = wrap.current;
    if (!el || !shake || !invalid) return;
    el.dataset.shake = 'false';
    void el.offsetWidth;
    el.dataset.shake = 'true';
  }, [shake, invalid]);

  function set(next: string) {
    const clean = next.replace(/\D/g, '').slice(0, N);
    onChange(clean);
    refs.current[Math.min(clean.length, N - 1)]?.focus();
    if (clean.length === N) onComplete?.(clean);
  }

  function onInput(i: number, raw: string) {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return;
    // autofill / fast typing can drop several digits into one box
    set(value.slice(0, i) + digits + value.slice(i + digits.length));
  }

  function onKey(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (value[i]) set(value.slice(0, i) + value.slice(i + 1));
      else if (i > 0) {
        set(value.slice(0, i - 1) + value.slice(i));
        refs.current[i - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault();
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < N - 1) {
      e.preventDefault();
      refs.current[i + 1]?.focus();
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text');
    if (!/\d/.test(text)) return;
    e.preventDefault();
    set(text);
  }

  return (
    <div className="au-otp" ref={wrap} data-invalid={invalid} role="group" aria-label="6-digit code">
      {Array.from({ length: N }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={value[i] ?? ''}
          onChange={(e) => onInput(i, e.target.value)}
          onKeyDown={(e) => onKey(i, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={i === 0 ? N : 1}
          aria-label={`Digit ${i + 1}`}
          data-filled={Boolean(value[i])}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
