/**
 * The preview, folded into one sticky line for narrow screens: deep work per
 * day as bars, meetings as dots. Pinned under the header on `/welcome` below
 * 980 px (auth.css), so the effect of each answer is visible without
 * scrolling past the questions — and never covers Back / Continue.
 */
import type { CSSProperties } from 'react';

import { focusByDay, type PreviewBlock } from '../onboarding';

const D = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

type Props = { blocks: PreviewBlock[]; work: boolean[]; showFocus: boolean; weekStart: 0 | 1 };

export function FocusStrip({ blocks, work, showFocus, weekStart }: Props) {
  const focus = focusByDay(blocks);
  const meet = [0, 0, 0, 0, 0, 0, 0];
  for (const b of blocks) if (b.kind === 'meeting') meet[b.day]++;
  const total = focus.reduce((n, m) => n + m, 0) / 60;
  const order = weekStart === 0 ? [6, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
  const maxMin = 6 * 60;

  return (
    <div className="fs" role="status" aria-label={`${showFocus ? `${total} hours of deep work` : `${work.filter(Boolean).length} working days`}, ${meet.reduce((n, m) => n + m, 0)} meetings this week`}>
      <div className="fs-days" aria-hidden="true">
        {order.map((d) => (
          <span key={d} className="fs-day" data-off={!work[d]}>
            <i className="fs-bar" style={{ '--h': `${showFocus ? Math.min(1, focus[d] / maxMin) * 100 : 0}%` } as CSSProperties} />
            <b>{D[d]}</b>
            <small>{'•'.repeat(Math.min(3, meet[d])) || '\u00a0'}</small>
          </span>
        ))}
      </div>
      <p className="fs-sum">
        <b>{showFocus ? `${total} h` : `${work.filter(Boolean).length} days`}</b>
        <span>{showFocus ? 'deep work' : 'working'}</span>
      </p>
    </div>
  );
}
