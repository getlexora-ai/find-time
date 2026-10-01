import { useState } from 'react';
import { Platform, StyleSheet, Text, View, type GestureResponderHandlers, type ViewStyle } from 'react-native';

import { fromMin } from '../cal-date';
import { paint } from '../kinds';
import { blockGeometry } from '../layout';
import { N, PAST, R, SANS, SHADOW, T, TRANSITION } from '../tokens';
import type { LaidBlock } from '../types';

/**
 * One tile on the time grid (docs/calendar-spec.md §3).
 *
 * Presentational: TimeGrid owns every gesture and hands the handlers in, so
 * there is one place that knows what a press, a drag and a resize mean.
 *
 * Quiet calendar (2026-10-01): a tile is its title and its time, nothing else —
 * no glyphs, dots, swatches or mono meta. Colour says the category; the detail
 * popover says the rest.
 *
 * Height bands (56px/hour):
 *   < 24px   title only, one line — a 15-minute block
 *   24–45    title and start time on one row
 *   ≥ 46     title (as many lines as fit), then "13:30 – 16:00"
 */
export type TileState = {
  selected?: boolean;
  /** this tile is the one being dragged (drawn at the preview position) */
  dragging?: boolean;
  /** the dashed outline left at the origin while the tile is dragged */
  ghost?: boolean;
  past?: boolean;
  clash?: boolean;
};

export function EventBlock({
  it,
  winStart,
  state = {},
  body,
  top,
  bottom,
  canResize,
  locked,
  onKeyDown,
  label,
}: {
  it: LaidBlock;
  winStart: number;
  state?: TileState;
  body?: GestureResponderHandlers;
  top?: GestureResponderHandlers;
  bottom?: GestureResponderHandlers;
  canResize: boolean;
  /** why it cannot be dragged, if it cannot (sets the cursor) */
  locked?: boolean;
  onKeyDown?: (e: { key: string; shiftKey: boolean; altKey: boolean; preventDefault: () => void }) => void;
  /** the full sentence a screen reader hears */
  label: string;
}) {
  const { top: y, height, widthPct, leftPct } = blockGeometry(it, winStart);
  const ev = it.ev;
  const p = paint(ev);

  const tiny = height < 24;
  // two lines need 5 + 17 + 16 + 5 + the 2px gap under the tile
  const short = height < 46;

  const from = it.cutTop ? (it.trueStart == null ? '…' : fromMin(it.trueStart)) : fromMin(it.s);
  const to = it.cutBottom ? (it.trueEnd == null ? '…' : fromMin(it.trueEnd)) : fromMin(it.t);
  const times = `${from} – ${to}`;
  const startLabel = from;

  // Selected: the tile fills with its category colour and the text turns white.
  const on = !state.ghost && !!state.selected;
  const ink = on ? { color: N.onInk } : p.title;
  const sub = on ? { color: N.onInk } : p.meta;

  const [hover, setHover] = useState(false);
  const webProps =
    Platform.OS === 'web'
      ? ({ tabIndex: 0, onKeyDown, onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false) } as object)
      : {};
  const lifted = hover && !state.ghost && !state.dragging;

  return (
    <View
      style={[
        styles.wrap,
        { top: y, height, left: `${leftPct}%` as const, width: `${widthPct}%` as const },
        state.dragging && styles.wrapDragging,
      ]}>
      {/* While dragged, the tile at its origin becomes the dashed ghost. It is
          the same element with the same handlers: unmounting it would drop the
          pointer mid-drag (the responder belongs to this node). */}
      <View
        {...body}
        {...webProps}
        accessibilityRole="button"
        aria-label={label}
        style={[
          TRANSITION,
          styles.tile,
          ...(state.ghost ? [styles.ghost] : p.box),
          it.cutTop && styles.cutTop,
          it.cutBottom && styles.cutBottom,
          tiny && styles.tileTiny,
          state.past && !state.dragging && styles.past,
          lifted && [styles.lifted, SHADOW.md],
          on && { backgroundColor: p.color, borderColor: p.color },
          !state.ghost && state.clash && styles.clash,
          state.dragging && [SHADOW.lg, styles.dragging],
          cursor(locked ? 'not-allowed' : 'grab'),
        ]}>
        {state.ghost ? null : short ? (
          <View style={styles.row}>
            <Text style={[styles.title, tiny && styles.titleSmall, ink]} numberOfLines={1}>
              {ev.title}
            </Text>
            {!tiny && (
              <Text style={[styles.time, sub]} numberOfLines={1}>
                {startLabel}
              </Text>
            )}
          </View>
        ) : (
          <>
            <Text style={[styles.title, ink]} numberOfLines={Math.max(1, Math.floor((height - 30) / 17))}>
              {ev.title}
            </Text>
            <Text style={[styles.time, sub]} numberOfLines={1}>
              {ev.kind === 'ai' ? `${times} · proposed` : times}
            </Text>
          </>
        )}
      </View>

      {canResize && !tiny && (
        <>
          <View {...top} style={[styles.handle, styles.handleTop, cursor('ns-resize')]} aria-hidden />
          <View {...bottom} style={[styles.handle, styles.handleBottom, cursor('ns-resize')]} aria-hidden />
        </>
      )}
    </View>
  );
}

const cursor = (c: string) =>
  Platform.OS === 'web' ? ({ cursor: c } as unknown as ViewStyle) : null;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', paddingHorizontal: 2, paddingBottom: 2 },
  wrapDragging: { zIndex: 50 },
  tile: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: R.md,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 1,
  },
  tileTiny: { paddingVertical: 0, justifyContent: 'center', borderRadius: R.sm },
  // A tile that carries on past the drawn edge loses that edge's rounding, so
  // it reads as cut, not as ending there.
  cutTop: { borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  cutBottom: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  past: { opacity: PAST },
  lifted: { transform: [{ translateY: -1 }] },
  clash: { outlineColor: N.accent, outlineWidth: 1, outlineStyle: 'solid', outlineOffset: 1 } as ViewStyle,
  dragging: { opacity: 0.96 },
  ghost: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: N.faint,
    backgroundColor: N.ghostFill,
  },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 6, minWidth: 0 },
  // In a one-row tile the title keeps its width; the time is what gives way.
  title: { flexShrink: 0, maxWidth: '100%', fontFamily: SANS, ...T.tile },
  titleSmall: { fontSize: 11, lineHeight: 14 },
  time: { flexShrink: 1, minWidth: 0, fontFamily: SANS, ...T.time, fontVariant: ['tabular-nums'] },
  handle: { position: 'absolute', left: 6, right: 6, height: 7, zIndex: 2 },
  handleTop: { top: -1 },
  handleBottom: { bottom: 0 },
});
