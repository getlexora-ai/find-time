/**
 * The landing's 3D week board (src/landing/dom/board.ts), mounted for
 * sign-up and onboarding so the account flow continues the landing's world:
 * meetings are slabs set into the board, deep work arrives as proposals
 * hovering above it, and `settled` drops them into place — "nothing lands
 * until you say yes", acted out when setup is finished.
 *
 * Desktop only (≥ 981 px), WebGL only, and never under reduced motion: in any
 * of those cases — or if the context is lost — `onGl(false)` and the parent
 * keeps showing the flat `MiniWeek`. The same happens if the device can't
 * hold ~15 fps (`perfGuard`: no usable GPU). three.js loads lazily, so pages
 * that never mount this don't pay for it.
 */
import { useEffect, useRef } from 'react';

import type { Board, BoardTile } from '@/landing/dom/board';

import type { PreviewBlock } from '../onboarding';

/** the board's hour window — wide enough for most working days, clipped beyond */
export const BOARD_START = 7 * 60;
export const BOARD_END = 21 * 60;
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type Props = {
  blocks: PreviewBlock[];
  /** deep work hovers as proposals until settled */
  settled: boolean;
  /** show deep work at all (onboarding hides it until the peak step) */
  showFocus: boolean;
  work: boolean[];
  /** working hours, whole hours */
  start: number;
  end: number;
  peak?: { from: number; to: number } | null;
  weekStart?: 0 | 1;
  /** day-of-month per column (Mon first), when the week is a real one */
  dates?: number[] | null;
  label: string;
  onGl: (on: boolean) => void;
};

export function canUseBoard(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  if (!window.matchMedia('(min-width: 981px)').matches) return false;
  const probe = document.createElement('canvas');
  return Boolean(probe.getContext('webgl2') || probe.getContext('webgl'));
}

export function WeekBoard3D(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<Board | null>(null);
  const onGl = useRef(props.onGl);
  const latest = useRef(props);
  // keep the latest props for the async mount and the board callbacks
  useEffect(() => {
    onGl.current = props.onGl;
    latest.current = props;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !canUseBoard()) {
      onGl.current(false);
      return;
    }
    let alive = true;
    import('@/landing/dom/board')
      .then(({ mountBoard }) =>
        mountBoard(host, {
          offsetX: () => 0,
          perfGuard: true,
          frame: { count: 7, start: BOARD_START, end: BOARD_END, px: 150, fill: { w: 1, h: 0.95 }, elevation: 50 },
          onFail: () => {
            boardRef.current?.dispose();
            boardRef.current = null;
            onGl.current(false);
          },
        }),
      )
      .then((b) => {
        if (!alive) return b.dispose();
        boardRef.current = b;
        apply(b, latest.current);
        onGl.current(true);
      })
      .catch(() => onGl.current(false));
    return () => {
      alive = false;
      boardRef.current?.dispose();
      boardRef.current = null;
    };
  }, []);

  // React owns what is on the board; the board animates the difference.
  const { blocks, settled, showFocus, work, start, end, peak, weekStart, dates } = props;
  useEffect(() => {
    if (boardRef.current) apply(boardRef.current, { ...latest.current, blocks, settled, showFocus, work, start, end, peak, weekStart, dates });
  }, [blocks, settled, showFocus, work, start, end, peak, weekStart, dates]);

  return <div className="b3d" ref={hostRef} role="img" aria-label={props.label} />;
}

/** What the board last received, per board — so a re-render with equal data costs nothing. */
const last = new WeakMap<Board, { face: string; tiles: string }>();

function apply(b: Board, p: Props) {
  const order = p.weekStart === 0 ? [6, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
  const col = (day: number) => order.indexOf(day);
  const face = {
    days: order.map((d) => ({ short: WEEK[d], num: p.dates?.[d] })),
    work: order.map((d) => p.work[d]),
    open: { start: p.start * 60, end: p.end * 60 },
    peak: p.peak ? { start: p.peak.from * 60, end: p.peak.to * 60 } : null,
  };
  const seen = last.get(b) ?? { face: '', tiles: '' };
  const faceKey = JSON.stringify(face);
  // repainting the face re-uploads a large texture: only when it changed
  if (faceKey !== seen.face) b.setFace(face);
  const tiles: BoardTile[] = [];
  for (const blk of p.blocks) {
    if (blk.kind === 'focus' && !p.showFocus) continue;
    const s = Math.max(BOARD_START, blk.s);
    const e = Math.min(BOARD_END, blk.e);
    if (e - s < 15) continue;
    tiles.push({
      // position in the id: a moved block lifts away and a new one arrives,
      // rather than one slab sliding across days
      id: blk.kind === 'focus' ? `${blk.id}@${blk.day}:${s}-${e}` : blk.id,
      day: col(blk.day),
      s,
      e,
      title: blk.title,
      kind: blk.kind === 'focus' ? 'user' : 'meet',
      state: blk.kind === 'focus' && !p.settled ? 'proposal' : 'solid',
    });
  }
  const tilesKey = JSON.stringify(tiles);
  if (tilesKey !== seen.tiles) b.setTiles(tiles);
  last.set(b, { face: faceKey, tiles: tilesKey });
}
