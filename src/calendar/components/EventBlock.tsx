import { useState } from 'react';
import { Platform, StyleSheet, Text, View, type GestureResponderHandlers, type ViewStyle } from 'react-native';

import { fromMin } from '../cal-date';
import { Icon } from '../Icon';
import { metaLine, paint } from '../kinds';
import { blockGeometry } from '../layout';
import { CATS, MONO, N, PAST, R, SANS, SHADOW, T, TRANSITION } from '../tokens';
import type { LaidBlock } from '../types';
import { CalSwatch } from '../ui';

/**
 * One tile on the time grid (docs/calendar-spec.md §3).
 *
 * Presentational: TimeGrid owns every gesture and hands the handlers in, so
 * there is one place that knows what a press, a drag and a resize mean.
 *
 * Height bands (56px/hour):
 *   < 24px   title only, one line — a 15-minute block
 *   24–45    title + glyph on one row
 *   46–89    title, meta line
 *   ≥ 90     title on two lines, meta, glyph pinned to the bottom
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
  calColor,
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
  /** the source calendar's own colour — the 6px square (spec §4) */
  calColor?: string;
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
  const short = height < 46;
  const tall = height >= 90;

  const times =
    `${it.cutTop ? (it.trueStart == null ? '…' : `↑${fromMin(it.trueStart)}`) : fromMin(it.s)}` +
    `–${it.cutBottom ? (it.trueEnd == null ? '…' : `${fromMin(it.trueEnd)}↓`) : fromMin(it.t)}`;

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
          state.past && !state.dragging && (p.dark ? styles.pastOnInk : styles.past),
          lifted && [styles.lifted, SHADOW.md],
          !state.ghost && state.selected && (p.dark ? styles.selectedOnDark : styles.selected),
          !state.ghost && state.clash && styles.clash,
          state.dragging && [SHADOW.lg, styles.dragging],
          cursor(locked ? 'not-allowed' : 'grab'),
        ]}>
        {state.ghost ? null : tiny ? (
          <Row>
            {!!calColor && <CalSwatch color={calColor} size={5} />}
            <Title p={p.title} lines={1} small>
              {ev.title}
            </Title>
          </Row>
        ) : short ? (
          <Row>
            {!p.solid && <View style={[styles.catDot, { backgroundColor: p.color }]} />}
            {!!calColor && <CalSwatch color={calColor} />}
            <Title p={p.title} lines={1}>
              {ev.title}
            </Title>
            {state.clash ? (
              <Icon name="triangle" size={11} color={N.accent} />
            ) : (
              <Icon name={p.spec.icon} size={11} color={p.glyph} />
            )}
          </Row>
        ) : (
          <>
            <Title p={p.title} lines={tall ? 2 : 1}>
              {ev.title}
            </Title>
            <Row>
              {/* White tiles carry their category as a round dot (the square is the calendar). */}
              {!p.solid && <View style={[styles.catDot, { backgroundColor: p.color }]} />}
              {!!calColor && <CalSwatch color={calColor} />}
              <Meta p={p.meta}>{metaLine(ev, CATS[ev.cat].label, times)}</Meta>
            </Row>
            {tall && (
              <View style={styles.foot}>
                {state.clash ? (
                  <Icon name="triangle" size={13} color={N.accent} />
                ) : (
                  <Icon name={p.spec.icon} size={13} color={p.glyph} />
                )}
              </View>
            )}
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

function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

function Title({
  children,
  p,
  lines,
  small,
}: {
  children: React.ReactNode;
  p: object;
  lines: number;
  small?: boolean;
}) {
  return (
    <View style={styles.titleWrap}>
      <Text style={[styles.title, small && styles.titleSmall, p]} numberOfLines={lines}>
        {children}
      </Text>
    </View>
  );
}

function Meta({ children, p }: { children: React.ReactNode; p: object }) {
  return (
    <Text style={[styles.meta, p]} numberOfLines={1}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', paddingHorizontal: 2, paddingBottom: 2 },
  wrapDragging: { zIndex: 50 },
  tile: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: R.md,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 3,
  },
  tileTiny: { paddingVertical: 0, justifyContent: 'center', borderRadius: R.sm },
  // A tile that carries on past the drawn edge loses that edge's rounding, so
  // it reads as cut, not as ending there.
  cutTop: { borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  cutBottom: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  past: { opacity: PAST.light },
  pastOnInk: { opacity: PAST.onInk },
  lifted: { transform: [{ translateY: -1 }] },
  selected: { outlineColor: N.ink, outlineWidth: 2, outlineStyle: 'solid', outlineOffset: 2 } as ViewStyle,
  selectedOnDark: { outlineColor: N.ink, outlineWidth: 2, outlineStyle: 'solid', outlineOffset: 2 } as ViewStyle,
  clash: { outlineColor: N.accent, outlineWidth: 1, outlineStyle: 'solid', outlineOffset: 1 } as ViewStyle,
  dragging: { opacity: 0.96 },
  ghost: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: N.faint,
    backgroundColor: N.ghostFill,
  },
  catDot: { width: 6, height: 6, borderRadius: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 },
  titleWrap: { flex: 1, minWidth: 0 },
  title: { fontFamily: SANS, ...T.tile },
  titleSmall: { fontSize: 10, lineHeight: 13 },
  meta: { flex: 1, fontFamily: MONO, ...T.meta, fontVariant: ['tabular-nums'] },
  foot: { marginTop: 'auto' },
  handle: { position: 'absolute', left: 6, right: 6, height: 7, zIndex: 2 },
  handleTop: { top: -1 },
  handleBottom: { bottom: 0 },
});
