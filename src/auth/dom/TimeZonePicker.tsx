/**
 * A searchable time-zone field (ARIA combobox + listbox). The detected zone is
 * pinned first; typing filters ~400 IANA zones by any part of the name
 * ("tokyo", "america/new", "kolkata"). Arrow keys move, Enter picks, Escape
 * closes and restores the current value.
 */
import { useId, useMemo, useRef, useState } from 'react';

import { modernZone } from '../onboarding';


function allZones(): string[] {
  try {
    const raw = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
    const out = [...new Set(raw.map(modernZone))].filter((z) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: z });
        return true;
      } catch {
        return false;
      }
    });
    return out.sort();
  } catch {
    return [];
  }
}

const pretty = (z: string) => z.replace(/_/g, ' ');

function offsetOf(zone: string): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName');
    return part?.value.replace('GMT', 'UTC') ?? '';
  } catch {
    return '';
  }
}

type Props = { value: string; detected: string; onChange: (zone: string) => void; labelId: string };

export function TimeZonePicker({ value, detected, onChange, labelId }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const zones = useMemo(() => {
    const all = allZones();
    const here = modernZone(detected);
    const rest = all.filter((z) => z !== here);
    return here ? [here, ...rest] : rest;
  }, [detected]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/\s+/g, '_');
    const hits = needle ? zones.filter((z) => z.toLowerCase().includes(needle)) : zones;
    return hits.slice(0, 60);
  }, [q, zones]);

  function pick(z: string) {
    onChange(z);
    setOpen(false);
    setQ('');
  }

  function move(delta: number) {
    const next = Math.max(0, Math.min(shown.length - 1, active + delta));
    setActive(next);
    listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
  }

  return (
    <div className="tz">
      <div className="tz-field">
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-labelledby={labelId}
          aria-autocomplete="list"
          aria-activedescendant={open && shown[active] ? `${id}-${active}` : undefined}
          value={open ? q : pretty(value)}
          placeholder={pretty(value)}
          onFocus={() => {
            setOpen(true);
            setQ('');
            setActive(0);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (!open) setOpen(true);
              else move(1);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              move(-1);
            } else if (e.key === 'Enter') {
              if (open && shown[active]) {
                e.preventDefault();
                pick(shown[active]);
              }
            } else if (e.key === 'Escape') {
              setOpen(false);
              setQ('');
            }
          }}
        />
        <span className="tz-off mono" aria-hidden="true">
          {offsetOf(value)}
        </span>
      </div>
      {open ? (
        <ul className="tz-list" role="listbox" id={listId} ref={listRef} aria-labelledby={labelId}>
          {shown.length ? (
            shown.map((z, i) => (
              <li
                key={z}
                id={`${id}-${i}`}
                role="option"
                aria-selected={z === value}
                data-active={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(z);
                }}
                onMouseEnter={() => setActive(i)}>
                <span>{pretty(z)}</span>
                <small className="mono">{z === modernZone(detected) ? 'Detected' : offsetOf(z)}</small>
              </li>
            ))
          ) : (
            <li className="tz-none" role="option" aria-selected={false} aria-disabled="true">
              No zone matches “{q}”
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
