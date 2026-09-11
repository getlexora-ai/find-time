import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/design/Icon';
import { C, R, rgba, w } from '@/design/tokens';
import { Txt } from '@/design/ui';
import { useResponsive } from '@/design/useResponsive';

import { PROBLEM } from '../copy';
import { RAMP } from '../ramp';
import { SectionHead } from './SectionHead';

const DAY = PROBLEM.packed.to - PROBLEM.packed.from;

/**
 * The pain, shown rather than argued: four cards, each a small picture of how a
 * calendar goes wrong — the email ping-pong, a day with no gap to think in, the
 * goal that rolls to next week, one moved meeting breaking three things — with a
 * single "Find Time:" line underneath. 2×2 ≥900, stacked below.
 */
export function PainPoints() {
  const { width } = useResponsive();
  const two = width >= 900;
  const { thread, packed, slip, cascade } = PROBLEM;

  return (
    <View>
      <SectionHead eyebrow={PROBLEM.eyebrow} title={PROBLEM.title} body={PROBLEM.body} />

      <View style={styles.grid}>
        <Card tag={thread.tag} count={thread.count} fix={thread.fix} half={two}>
          <View style={styles.thread}>
            {thread.messages.map((m, i) => (
              <View key={i} style={[styles.bubble, m.you ? styles.bubbleYou : styles.bubbleThem]}>
                <Txt style={styles.bubbleTxt}>{m.text}</Txt>
              </View>
            ))}
            <View style={[styles.bubble, styles.bubbleThem, styles.typing]}>
              <Icon name="dots" size={16} color={w(0.6)} />
            </View>
          </View>
        </Card>

        <Card tag={packed.tag} count={packed.count} fix={packed.fix} half={two}>
          <View style={styles.dayWrap}>
            <View style={styles.dayBar}>
              {packed.blocks.map((b) => (
                <View
                  key={b.start}
                  style={[
                    styles.seg,
                    {
                      left: `${Math.round(((b.start - packed.from) / DAY) * 1000) / 10}%`,
                      width: `${Math.round(((b.end - b.start) / DAY) * 1000) / 10}%`,
                    },
                  ]}
                />
              ))}
            </View>
            <View style={styles.ticks}>
              {packed.hours.map((h) => (
                <Txt key={h} style={styles.tick}>
                  {h}
                </Txt>
              ))}
            </View>
            <View style={styles.gaps}>
              <Txt style={styles.gapsLabel}>{packed.gapsLabel}</Txt>
              {packed.gaps.map((g, i) => (
                <View key={i} style={styles.gapChip}>
                  <Txt style={styles.gapTxt}>{g}</Txt>
                </View>
              ))}
            </View>
          </View>
        </Card>

        <Card tag={slip.tag} count={slip.count} fix={slip.fix} half={two}>
          <View style={styles.weeks}>
            {slip.weeks.map((wk, i) => (
              <View key={wk} style={styles.weekItem}>
                {i > 0 ? <Icon name="arrow-forward" size={14} color={C.orange} /> : null}
                <View style={styles.week}>
                  <Txt style={styles.weekLabel}>{wk}</Txt>
                  <View style={styles.goal}>
                    <Txt style={styles.goalTxt} numberOfLines={1}>
                      {slip.goal}
                    </Txt>
                  </View>
                  <Txt style={styles.weekState}>{slip.state}</Txt>
                </View>
              </View>
            ))}
          </View>
        </Card>

        <Card tag={cascade.tag} count={cascade.count} fix={cascade.fix} half={two}>
          <View style={styles.cascade}>
            <View style={styles.moved}>
              <Icon name="calendar-mark" size={16} color="#fff" />
              <Txt style={styles.movedTxt}>{cascade.moved}</Txt>
            </View>
            {cascade.clashes.map((c) => (
              <View key={c} style={styles.clash}>
                <Icon name="triangle" size={14} color={C.orange} />
                <Txt style={styles.clashTxt}>{c}</Txt>
                <View style={styles.clashTag}>
                  <Txt style={styles.clashTagTxt}>{cascade.clashTag}</Txt>
                </View>
              </View>
            ))}
          </View>
        </Card>
      </View>
    </View>
  );
}

function Card({
  tag,
  count,
  fix,
  half,
  children,
}: {
  tag: string;
  count: string;
  fix: string;
  half: boolean;
  children: ReactNode;
}) {
  return (
    <View style={[styles.card, half ? styles.cardHalf : null]}>
      <View style={styles.cardHead}>
        <Txt style={styles.tag}>{tag}</Txt>
        <View style={styles.count}>
          <Txt style={styles.countTxt}>{count}</Txt>
        </View>
      </View>
      <View style={styles.visual}>{children}</View>
      <View style={styles.fix}>
        <Txt style={styles.fixLabel}>{PROBLEM.fixLabel}</Txt>
        <Txt style={styles.fixTxt}>{fix}</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  card: {
    width: '100%',
    borderRadius: R.xl2,
    borderWidth: 1,
    borderColor: w(0.15),
    backgroundColor: rgba('#121212', 0.92),
    overflow: 'hidden',
  },
  cardHalf: { flexBasis: '48%', flexGrow: 1, width: 'auto' },
  cardHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  tag: { color: '#fff', fontSize: 12, fontWeight: '500', letterSpacing: 1.5 },
  count: { borderRadius: R.full, backgroundColor: rgba(C.orange, 0.16), paddingHorizontal: 10, paddingVertical: 4 },
  countTxt: { color: C.orange, fontSize: 10, letterSpacing: 1, fontWeight: '600' },
  visual: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 22 },
  fix: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: w(0.1),
    backgroundColor: rgba(C.lime, 0.05),
  },
  fixLabel: { color: C.lime, fontSize: 10, lineHeight: 20, letterSpacing: 1.5, fontWeight: '600' },
  fixTxt: { flex: 1, color: '#fff', fontSize: 13, lineHeight: 20 },

  // the back-and-forth
  thread: { gap: 8 },
  bubble: { maxWidth: '80%', borderRadius: R.xl, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleYou: { alignSelf: 'flex-end', backgroundColor: w(0.14), borderBottomRightRadius: R.sm },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: w(0.06), borderBottomLeftRadius: R.sm },
  bubbleTxt: { color: w(0.85), fontSize: 12, lineHeight: 17 },
  typing: { paddingVertical: 4 },

  // no room to think
  dayWrap: { gap: 8 },
  dayBar: { height: 44, borderRadius: R.lg, backgroundColor: w(0.05), overflow: 'hidden', position: 'relative' },
  seg: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: w(0.22),
    borderLeftWidth: 2,
    borderLeftColor: rgba('#121212', 0.92),
  },
  ticks: { flexDirection: 'row', justifyContent: 'space-between' },
  tick: { color: RAMP.onPanel, fontSize: 10 },
  gaps: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 },
  gapsLabel: { color: RAMP.onPanel, fontSize: 10, letterSpacing: 1.5, marginRight: 4 },
  gapChip: {
    borderRadius: R.full,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: rgba(C.orange, 0.6),
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  gapTxt: { color: w(0.8), fontSize: 10, letterSpacing: 1 },

  // the goal that slips
  weeks: { flexDirection: 'row', alignItems: 'center' },
  weekItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  week: { flex: 1, minWidth: 0, alignItems: 'center', gap: 6 },
  weekLabel: { color: RAMP.onPanel, fontSize: 10, letterSpacing: 1.5 },
  goal: {
    alignSelf: 'stretch',
    borderRadius: R.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: rgba(C.orange, 0.6),
    paddingHorizontal: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  goalTxt: { color: w(0.6), fontSize: 11, letterSpacing: 1, textDecorationLine: 'line-through' },
  weekState: { color: C.orange, fontSize: 9, letterSpacing: 1 },

  // one change, three clashes
  cascade: { gap: 8 },
  moved: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: R.lg,
    backgroundColor: w(0.14),
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
  },
  movedTxt: { flexShrink: 1, color: '#fff', fontSize: 12, letterSpacing: 1 },
  clash: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginLeft: 16,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: rgba(C.orange, 0.35),
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clashTxt: { flex: 1, color: w(0.8), fontSize: 12 },
  clashTag: { borderRadius: R.full, backgroundColor: rgba(C.orange, 0.16), paddingHorizontal: 8, paddingVertical: 2 },
  clashTagTxt: { color: C.orange, fontSize: 9, letterSpacing: 1, fontWeight: '600' },
});
