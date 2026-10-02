/**
 * The example week, drawn as a quiet calendar (src/calendar look: title + time
 * on soft tints, ink text, one orange stroke for proposals and clashes).
 *
 * Stage-driven and pure: the story passes the stage its chapters are on and
 * CSS transitions carry the change, so the canvas reads the same with motion
 * off. `notes` draws the hero's pain labels on the week as it arrives.
 */
import type { CSSProperties } from 'react';

import {
  CRUMBS,
  DAYS,
  DAY_END,
  DAY_START,
  FREE,
  TILES,
  clock,
  dur,
  pct,
  tileEnd,
  tileState,
} from './week-data';

type Props = {
  stage: number;
  label: string;
  /** hero only: point at the problems in the week */
  notes?: { crumbs: string; b2b: string; homeless: string };
  /** text alternative for the whole picture */
  alt?: string;
  className?: string;
};

const HOURS = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START + i * 60);

const box = (s: number, e: number): CSSProperties => ({
  top: `${pct(s)}%`,
  height: `${pct(e) - pct(s)}%`,
});

export function WeekCanvas({ stage, label, notes, alt, className }: Props) {
  return (
    <figure
      className={`wk ${className ?? ''}`}
      data-stage={stage}
      role={alt ? 'img' : undefined}
      aria-label={alt}>
      <figcaption className="wk-cap">
        <span className="mono">{label}</span>
        <span className="mono wk-range">Sep 14 – 18</span>
      </figcaption>

      <div className="wk-head" aria-hidden="true">
        <span />
        {DAYS.map((d) => (
          <span key={d.short}>
            {d.short} <b>{d.num}</b>
          </span>
        ))}
      </div>

      <div className="wk-body" aria-hidden="true">
        <div className="wk-gutter">
          {HOURS.slice(0, -1).map((m) => (
            <span key={m} style={{ top: `${pct(m)}%` }}>
              {clock(m)}
            </span>
          ))}
        </div>

        <div className="wk-grid">
          {HOURS.slice(1, -1).map((m) => (
            <i key={m} className="wk-line" style={{ top: `${pct(m)}%` }} />
          ))}

          {DAYS.map((d, day) => (
            <div key={d.short} className="wk-col">
              {FREE.filter((f) => f.day === day).map((f) => (
                <span key={`f${f.s}`} className="wk-free" data-on={stage === 1} style={box(f.s, f.e)}>
                  <em>{dur(f.e - f.s)} free</em>
                </span>
              ))}

              {notes &&
                CRUMBS.filter((c) => c.day === day).map((c) => (
                  <span key={`c${c.s}`} className="wk-crumb" style={box(c.s, c.e)} />
                ))}

              {TILES.filter((t) => t.day === day).map((t) => {
                const state = tileState(t, stage);
                const e = tileEnd(t, stage);
                return (
                  <div
                    key={t.id}
                    className={`wk-tile k-${t.kind}`}
                    data-state={state}
                    data-short={e - t.s <= 45 || undefined}
                    style={box(t.s, e)}>
                    <strong>{t.title}</strong>
                    <span>
                      {clock(t.s)}–{clock(e)}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}

          {notes && (
            <>
              {/* under Monday's 10:30 / 16:00 crumbs and Tuesday's last call */}
              <span className="wk-note n-crumbs" style={{ top: `${pct(11 * 60 + 45)}%` }}>
                ↑ {notes.crumbs}
              </span>
              <span className="wk-note n-b2b" style={{ top: `${pct(19 * 60)}%` }}>
                ↑ {notes.b2b}
              </span>
              <span className="wk-note n-homeless">{notes.homeless}</span>
            </>
          )}
        </div>
      </div>
    </figure>
  );
}
