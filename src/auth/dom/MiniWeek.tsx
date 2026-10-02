/**
 * A small week calendar, drawn in the app's quiet look (src/calendar tokens):
 * soft tints with a 2px stroke, hatched time you're not working, the peak
 * window as a faint orange band.
 *
 * Pure and prop-driven. On `/welcome` it is the live preview of each answer;
 * on `/login` / `/signup` it shows the same example week settled. CSS
 * transitions (auth.css) carry every change, so moving a working hour slides
 * the hatching and the blocks rather than redrawing them.
 */
import type { CSSProperties } from 'react';

import { hourLabel, type PreviewBlock, WEEKDAYS } from '../onboarding';

const DAY_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type Props = {
  title: string;
  meta?: string;
  /** which of mon..sun are working days */
  work: boolean[];
  /** working hours, whole hours */
  start: number;
  end: number;
  /** peak window, hours; omitted = no band */
  peak?: { from: number; to: number } | null;
  blocks: PreviewBlock[];
  clock24?: boolean;
  /** 0 = Sunday first, 1 = Monday first */
  weekStart?: 0 | 1;
  stats?: { label: string; value: string }[];
  height?: number;
  /** legend text for meeting blocks — "Your meetings" once a calendar is connected */
  meetingLabel?: string;
};

export function MiniWeek({
  title,
  meta,
  work,
  start,
  end,
  peak,
  blocks,
  clock24 = true,
  weekStart = 1,
  stats,
  height = 360,
  meetingLabel = 'Meetings (example)',
}: Props) {
  // The visible window always shows a little either side of the working day.
  const vStart = Math.max(0, Math.min(7, start - 1));
  const vEnd = Math.min(24, Math.max(start + 9, end + 1));
  const span = (vEnd - vStart) * 60;
  const pct = (min: number) => ((min - vStart * 60) / span) * 100;
  const box = (s: number, e: number): CSSProperties => ({ top: `${pct(s)}%`, height: `${pct(e) - pct(s)}%` });

  // Column order: Monday-first or Sunday-first; block.day is always mon=0.
  const order = weekStart === 0 ? [6, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
  const hours: number[] = [];
  const stepH = vEnd - vStart > 14 ? 3 : 2;
  for (let h = Math.ceil(vStart / stepH) * stepH; h < vEnd; h += stepH) if (h > vStart) hours.push(h);

  const sorted = [...blocks].sort((a, b) => a.day - b.day || a.s - b.s);

  return (
    <figure className="mw" aria-label={`${title}. ${meta ?? ''}`}>
      <figcaption className="mw-bar">
        <span className="mw-title">{title}</span>
        {meta ? <span className="mw-meta">{meta}</span> : null}
      </figcaption>
      <div className="mw-head" aria-hidden="true">
        <span />
        {order.map((d) => (
          <span key={d} data-off={!work[d]}>
            {DAY_LABEL[d]}
          </span>
        ))}
      </div>
      <div className="mw-body" style={{ '--mw-h': `${height}px` } as CSSProperties} aria-hidden="true">
        <div className="mw-gut">
          {hours.map((h) => (
            <span key={h} style={{ top: `${pct(h * 60)}%` }}>
              {clock24 ? hourLabel(h, true).slice(0, 2) : hourLabel(h, false).replace(' ', '')}
            </span>
          ))}
        </div>
        {order.map((d) => (
          <div key={WEEKDAYS[d]} className="mw-day" data-off={!work[d]}>
            {hours.map((h) => (
              <i key={h} className="mw-line" style={{ top: `${pct(h * 60)}%` }} />
            ))}
            {work[d] ? (
              <>
                <i className="mw-closed" style={box(vStart * 60, start * 60)} />
                <i className="mw-closed" style={box(end * 60, vEnd * 60)} />
                {peak ? (
                  <i
                    className="mw-peak"
                    style={box(Math.max(start, peak.from) * 60, Math.max(Math.max(start, peak.from), Math.min(end, peak.to)) * 60)}
                  />
                ) : null}
              </>
            ) : null}
            {sorted
              .filter((b) => b.day === d)
              .map((b, i) => (
                <div
                  key={b.id}
                  className="mw-blk"
                  data-kind={b.kind}
                  data-short={b.e - b.s < 60}
                  style={{ ...box(b.s, b.e), '--i': i + d } as CSSProperties}>
                  <b>{b.title}</b>
                  {b.e - b.s >= 60 ? (
                    <small>
                      {fmt(b.s, clock24)}–{fmt(b.e, clock24)}
                    </small>
                  ) : null}
                </div>
              ))}
          </div>
        ))}
      </div>
      <div className="mw-legend" aria-hidden="true">
        <span>
          <i className="k-focus" />
          Deep work
        </span>
        <span>
          <i className="k-meet" />
          {meetingLabel}
        </span>
        {peak ? (
          <span>
            <i className="k-peak" />
            Your best hours
          </span>
        ) : null}
        <span>
          <i className="k-off" />
          Not working
        </span>
      </div>
      {stats?.length ? (
        <dl className="mw-stat">
          {stats.map((s) => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </figure>
  );
}

function fmt(min: number, clock24: boolean): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (clock24) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hh}:${String(m).padStart(2, '0')}` : `${hh}`;
}
