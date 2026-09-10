import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { C, LANDING, R, rgba, w } from '@/design/tokens';
import { Press, Txt } from '@/design/ui';

import { AGENT_LOG } from '../copy';
import { RAMP } from '../ramp';

type ChipState = 'done' | 'held' | 'paid';

/**
 * The hero's example activity log: four things the agent did this morning, one of
 * them — a payment — held until the visitor approves it. It is the pitch in one
 * card: breadth of work, plus the confirmation gate. Example data, not the
 * visitor's. "Approve" resolves the held row; "Review" shows what will be sent.
 */
export function AgentLog() {
  const [approved, setApproved] = useState(false);
  const [review, setReview] = useState(false);

  return (
    <View style={styles.card} aria-label={AGENT_LOG.label}>
      <View style={styles.head}>
        <Txt style={styles.headTxt}>{AGENT_LOG.title}</Txt>
        <View style={styles.live}>
          <View style={styles.liveDot} />
          <Txt style={styles.liveTxt}>{AGENT_LOG.status}</Txt>
        </View>
      </View>

      {AGENT_LOG.rows.map((row) => {
        const held = Boolean(row.held) && !approved;
        return (
          <View key={row.time} style={[styles.row, held ? styles.rowHeld : null]}>
            <Txt style={styles.time}>{row.time}</Txt>
            <View style={styles.main}>
              <Txt style={styles.kind}>{row.kind}</Txt>
              <Txt style={styles.what}>
                {row.text}
                {row.token ? <Txt style={[styles.what, styles.token]}> {row.token}</Txt> : null}
              </Txt>
              {held ? (
                <>
                  <View style={styles.actions}>
                    <Press
                      onPress={() => setApproved(true)}
                      accessibilityRole="button"
                      hoverBg={C.limeHover}
                      style={[styles.mini, styles.approve]}>
                      <Txt style={styles.approveTxt}>{AGENT_LOG.approve}</Txt>
                    </Press>
                    <Press
                      onPress={() => setReview((v) => !v)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: review }}
                      hoverBg={w(0.08)}
                      style={[styles.mini, styles.reviewBtn]}>
                      <Txt style={styles.reviewTxt}>{review ? AGENT_LOG.reviewClose : AGENT_LOG.review}</Txt>
                    </Press>
                  </View>
                  {review ? <Txt style={styles.detail}>{AGENT_LOG.reviewBody}</Txt> : null}
                </>
              ) : null}
            </View>
            <Chip state={row.held ? (approved ? 'paid' : 'held') : 'done'} />
          </View>
        );
      })}

      <View style={styles.foot}>
        <Txt style={styles.footTxt}>
          {AGENT_LOG.footActions}
          {' · '}
          <Txt style={[styles.footTxt, { color: C.lime }]}>{AGENT_LOG.footWaiting(approved ? 0 : 1)}</Txt>
        </Txt>
        <Txt style={styles.footTxt}>{AGENT_LOG.footSecrets}</Txt>
      </View>
    </View>
  );
}

function Chip({ state }: { state: ChipState }) {
  const held = state === 'held';
  const label = held ? AGENT_LOG.held : state === 'paid' ? AGENT_LOG.paid : AGENT_LOG.done;
  return (
    <View style={[styles.chip, held ? styles.chipHeld : styles.chipDone]}>
      <Txt style={[styles.chipTxt, { color: held ? C.surface : C.lime }]}>{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: w(0.15),
    backgroundColor: rgba('#121212', 0.92),
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 20 },
    elevation: 10,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: w(0.1),
  },
  headTxt: { color: RAMP.onPanel, fontSize: 11, letterSpacing: 1.5 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.lime },
  liveTxt: { color: C.lime, fontSize: 11, letterSpacing: 1.5 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: w(0.08),
  },
  rowHeld: { backgroundColor: rgba(C.orange, 0.1) },
  time: { width: 40, color: RAMP.onPanel, fontSize: 12, lineHeight: 20, fontVariant: ['tabular-nums'] },
  main: { flex: 1, minWidth: 0, gap: 4 },
  kind: { color: LANDING.aiResponse, fontSize: 10, letterSpacing: 1.5 },
  what: { color: '#fff', fontSize: 13, lineHeight: 20 },
  token: { color: C.lime },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  mini: { borderRadius: R.full, paddingHorizontal: 14, minHeight: 34, justifyContent: 'center' },
  approve: { backgroundColor: C.lime },
  approveTxt: { color: C.surface, fontSize: 11, fontWeight: '600', letterSpacing: 1 },
  reviewBtn: { borderWidth: 1, borderColor: w(0.25) },
  reviewTxt: { color: '#fff', fontSize: 11, letterSpacing: 1 },
  detail: { marginTop: 8, color: RAMP.onPanel, fontSize: 12, lineHeight: 18 },
  chip: { borderRadius: R.full, paddingHorizontal: 8, paddingVertical: 4 },
  chipDone: { backgroundColor: rgba(C.lime, 0.14) },
  chipHeld: { backgroundColor: C.orange },
  chipTxt: { fontSize: 10, lineHeight: 14, letterSpacing: 1, fontWeight: '600' },
  foot: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  footTxt: { color: RAMP.onPanel, fontSize: 11, letterSpacing: 1 },
});
