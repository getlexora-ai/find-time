/**
 * The example week — the hero's demo week and the story's planned week.
 *
 * Drawn like the Prism app's grid (src/prism): meetings in their calendar's
 * tint, focus blocks deep indigo, proposals dashed in the Plan with AI orange,
 * time away hatched. Stage-driven and pure; CSS transitions carry the changes,
 * and it is complete in the server-rendered markup.
 */
import type { CSSProperties } from 'react';

import {
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

export type ExtraTile = { id: string; day: number; s: number; e: number; title: string; state: 'proposal' | 'solid' };

type Props = {
  /** story stage 0–4 */
  stage: number;
  label: string;
  /** the visitor's own blocks from the hero demo */
  extra?: ExtraTile[];
  className?: string;
};

const HOURS = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START + i * 60);

const box = (s: number, e: number): CSSProperties => ({
  top: `${pct(s)}%`,
  height: `${pct(e) - pct(s)}%`,
});

export function WeekCanvas({ stage, label, extra = [], className }: Props) {
  let n = 0;
  return (
    <figure className={`wk ${className ?? ''}`} data-stage={stage}>
      <figcaption className="wk-cap">
        <span className="mono">{label}</span>
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

              {TILES.filter((t) => t.day === day).map((t) => {
                const state = tileState(t, stage);
                const e = tileEnd(t, stage);
                return (
                  <div
                    key={t.id}
                    className={`wk-tile k-${t.kind}`}
                    data-state={state}
                    data-short={e - t.s <= 45 || undefined}
                    style={{ ...box(t.s, e), '--d': n++ } as CSSProperties}>
                    <strong>{t.title}</strong>
                    <span>
                      {clock(t.s)}–{clock(e)}
                    </span>
                  </div>
                );
              })}

              {extra
                .filter((t) => t.day === day)
                .map((t) => (
                  <div
                    key={t.id}
                    className="wk-tile k-user"
                    data-state={t.state}
                    data-short={t.e - t.s <= 45 || undefined}
                    style={box(t.s, t.e)}>
                    <strong>{t.title}</strong>
                    <span>
                      {clock(t.s)}–{clock(t.e)}
                    </span>
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}
