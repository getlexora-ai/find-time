import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import type { FindTimeResponse } from '@/lib/api-types';

import { applyProposals } from '../cal-store';
import { Icon } from '../Icon';
import { useCalTheme } from '../theme-context';
import { C, R, rgba, w } from '../tokens';
import { MONO, Press, Txt } from '../ui';
import { useResponsive } from '../useResponsive';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? '';

const CHIPS = [
  { label: '2h deep work Thursday', fill: 'Make room for 2h of deep work on Thursday' },
  { label: 'Protect my mornings', fill: 'Block 90 minutes for focused work every weekday morning' },
  { label: 'Three review slots', fill: 'Find three 45-minute review slots this week' },
];

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtSlot(startISO: string, endISO: string) {
  const d = new Date(startISO);
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]} · ${startISO.slice(
    11,
    16,
  )}–${endISO.slice(11, 16)}`;
}

type Phase = 'idle' | 'analysing' | 'result';

/** Find time — right drawer ≥1024px, bottom sheet below (spec §2.13). Calls
 *  POST /api/ai/find-time (Claude parse + deterministic placer), renders the
 *  proposed blocks, and creates them via `applyProposals` on Add. */
export function AiPanel({
  prefill,
  onClose,
  onApplied,
  toast,
}: {
  prefill?: string;
  onClose: () => void;
  onApplied: (firstISO?: string, count?: number) => void;
  toast: (m: string) => void;
}) {
  const { theme } = useCalTheme();
  const { isDesktop } = useResponsive();
  // `prefill` only changes via a fresh mount (parent passes key={prefill}).
  const [text, setText] = useState(prefill ?? '');
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<FindTimeResponse | null>(null);
  const [listening, setListening] = useState(false);

  async function run() {
    if (phase === 'analysing') return;
    if (!text.trim()) {
      toast('Tell Find time what to make room for');
      return;
    }
    setPhase('analysing');
    try {
      const res = await fetch(`${BASE}/api/ai/find-time`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: text.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as FindTimeResponse & { error?: string };
      if (!res.ok) {
        toast(data.error ?? 'Find time hit a snag. Try again.');
        setPhase('idle');
        return;
      }
      setResult(data);
      setPhase('result');
    } catch {
      toast('Could not reach Find time. Check your connection.');
      setPhase('idle');
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={[styles.backdrop, { backgroundColor: C.scrim }, isDesktop ? styles.backdropDrawer : styles.backdropSheet]}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.panel,
            { backgroundColor: theme.panel, borderColor: theme.panelBorder },
            isDesktop ? styles.panelDrawer : styles.panelSheet,
          ]}>
          {/* the two concentric lime rings bleeding off the top-right corner */}
          <View
            pointerEvents="none"
            style={[styles.rings, isDesktop ? styles.ringsDrawer : styles.ringsSheet]}>
            <View style={[styles.ring, styles.ringOuter]} />
            <View style={[styles.ring, styles.ringInner]} />
          </View>
          <ScrollView contentContainerStyle={{ padding: isDesktop ? 24 : 20 }}>
            {!isDesktop && <View style={styles.grab} />}
            <View style={styles.head}>
              <View>
                <View style={styles.eyebrowRow}>
                  <Icon name="magic" size={20} color={C.lime} />
                  <Txt style={styles.eyebrow}>Find time</Txt>
                </View>
                <Txt style={styles.title}>What needs a slot?</Txt>
              </View>
              <Press onPress={onClose} hoverBg={w(0.1)} style={styles.close} aria-label="Close">
                <Icon name="close" size={20} color={w(0.5)} />
              </Press>
            </View>

            <Txt style={styles.desc}>
              Describe the outcome. Find time reshuffles only what is flexible and never touches a protected block.
            </Txt>

            <View style={styles.inputBox}>
              <TextInput
                value={text}
                onChangeText={setText}
                multiline
                numberOfLines={3}
                placeholder="Example: make room for 2h deep work on Thursday"
                placeholderTextColor={w(0.25)}
                style={styles.input}
              />
              <View style={styles.inputActions}>
                <Press
                  onPress={() => {
                    setListening((v) => !v);
                    toast(!listening ? 'Listening…' : 'Voice input stopped');
                  }}
                  hoverBg={w(0.1)}
                  style={[styles.mic, listening && { backgroundColor: C.orange }]}
                  aria-label="Voice input">
                  <Icon name="mic" size={18} color={listening ? '#fff' : w(0.45)} />
                </Press>
                {/* calendar.html swaps the button's own label while it "reads" */}
                <Press
                  onPress={run}
                  disabled={phase === 'analysing'}
                  hoverBg={C.limeHover}
                  style={styles.run}>
                  {phase === 'analysing' ? (
                    <>
                      <Icon name="refresh" size={18} color={C.surface} />
                      <Txt style={styles.runTxt}>Reading calendar…</Txt>
                    </>
                  ) : (
                    <>
                      <Txt style={styles.runTxt}>Find time</Txt>
                      <Icon name="arrow-right-up" size={16} color={C.surface} />
                    </>
                  )}
                </Press>
              </View>
            </View>

            <View style={styles.chipRow}>
              {CHIPS.map((c) => (
                <Press key={c.label} onPress={() => setText(c.fill)} hoverBg={w(0.05)} style={styles.chip}>
                  <Txt style={styles.chipTxt}>{c.label}</Txt>
                </Press>
              ))}
            </View>

            {phase === 'analysing' && (
              <View style={styles.analysing}>
                <Txt style={styles.analysingLabel}>Analysing</Txt>
                <View style={{ marginTop: 16, gap: 8 }}>
                  <View style={[styles.sk, { width: '75%' }]} />
                  <View style={[styles.sk, { width: '100%' }]} />
                  <View style={[styles.sk, { width: '66%' }]} />
                </View>
                <Txt style={styles.analysingNote}>Checking energy curve, protected blocks, and deadlines…</Txt>
              </View>
            )}

            {phase === 'result' && result && (
              <View style={styles.result}>
                <View style={styles.resultHead}>
                  <View style={styles.eyebrowRow}>
                    <Icon name="stars" size={18} color={C.lime} />
                    <Txt style={styles.resultHeadTxt}>
                      {result.proposals.length ? 'Time found' : 'No slot'}
                    </Txt>
                  </View>
                  {result.proposals.length > 0 && (
                    <View style={styles.resultBadge}>
                      <Txt style={styles.resultBadgeTxt}>
                        {result.proposals.length} block{result.proposals.length > 1 ? 's' : ''} · 0 conflicts
                      </Txt>
                    </View>
                  )}
                </View>
                <View style={{ padding: 16, gap: 8 }}>
                  {result.proposals.map((p, i) => (
                    <View key={`${p.startISO}-${i}`} style={styles.addRow}>
                      <View style={styles.addIcon}>
                        <Icon name="add" size={16} color={C.surface} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt style={styles.moveTitle}>{p.title}</Txt>
                        <Txt style={styles.addSub}>{fmtSlot(p.startISO, p.endISO)}</Txt>
                      </View>
                    </View>
                  ))}
                  <Txt style={styles.rationale}>{result.rationale}</Txt>
                </View>
                <View style={styles.resultBtns}>
                  {result.proposals.length > 0 ? (
                    <>
                      <Press
                        onPress={() => {
                          const n = applyProposals(result.proposals);
                          onApplied(result.proposals[0]?.startISO, n);
                          onClose();
                        }}
                        hoverBg={C.limeHover}
                        style={styles.applyBtn}>
                        <Txt style={styles.applyTxt}>
                          Add {result.proposals.length} block{result.proposals.length > 1 ? 's' : ''}
                        </Txt>
                      </Press>
                      <Press
                        onPress={() => {
                          setPhase('idle');
                          setResult(null);
                          toast('Suggestion dismissed');
                        }}
                        hoverBg={w(0.1)}
                        style={styles.dismissBtn}>
                        <Txt style={styles.dismissTxt}>Dismiss</Txt>
                      </Press>
                    </>
                  ) : (
                    <Press
                      onPress={() => {
                        setPhase('idle');
                        setResult(null);
                      }}
                      hoverBg={w(0.1)}
                      style={styles.dismissBtn}>
                      <Txt style={styles.dismissTxt}>Try again</Txt>
                    </Press>
                  )}
                </View>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  backdropSheet: { justifyContent: 'flex-end' },
  backdropDrawer: { justifyContent: 'flex-start', alignItems: 'flex-end' },
  panel: {
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  panelSheet: { width: '100%', maxHeight: '88%', borderTopLeftRadius: R.xl2, borderTopRightRadius: R.xl2 },
  panelDrawer: { height: '100%', width: 432, borderTopLeftRadius: R.xl2, borderBottomLeftRadius: R.xl2 },
  rings: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  ringsSheet: { borderTopLeftRadius: R.xl2, borderTopRightRadius: R.xl2 },
  ringsDrawer: { borderTopLeftRadius: R.xl2, borderBottomLeftRadius: R.xl2 },
  ring: { position: 'absolute', borderWidth: 1, borderRadius: R.full },
  ringOuter: { right: -48, top: -48, height: 144, width: 144, borderColor: rgba(C.lime, 0.2) },
  ringInner: { right: -24, top: -24, height: 96, width: 96, borderColor: rgba(C.lime, 0.3) },
  grab: { alignSelf: 'center', marginBottom: 16, height: 4, width: 40, borderRadius: R.full, backgroundColor: w(0.2) },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { color: C.lime, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2 },
  title: { marginTop: 8, color: '#fff', fontSize: 20, fontWeight: '500', letterSpacing: -0.4 },
  close: { height: 36, width: 36, alignItems: 'center', justifyContent: 'center', borderRadius: R.lg, borderWidth: 1, borderColor: w(0.1) },
  desc: { marginTop: 12, color: w(0.45), fontSize: 12, lineHeight: 18 },
  inputBox: { marginTop: 20, borderRadius: R.xl, borderWidth: 1, borderColor: w(0.1), backgroundColor: w(0.06), padding: 12 },
  input: { minHeight: 60, color: '#fff', fontSize: 14, lineHeight: 20, fontFamily: MONO, textAlignVertical: 'top' },
  inputActions: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mic: { height: 36, width: 36, alignItems: 'center', justifyContent: 'center', borderRadius: R.lg, borderWidth: 1, borderColor: w(0.1) },
  run: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: R.lg, backgroundColor: C.lime, paddingHorizontal: 16 },
  runTxt: { color: C.surface, fontSize: 12, fontWeight: '500' },
  chipRow: { marginTop: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: R.full, borderWidth: 1, borderColor: w(0.1), paddingHorizontal: 12, paddingVertical: 8 },
  chipTxt: { color: w(0.45), fontSize: 12 },
  analysing: { marginTop: 20, borderRadius: R.xl2, borderWidth: 1, borderColor: w(0.1), backgroundColor: w(0.05), padding: 16 },
  analysingLabel: { color: C.lime, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2 },
  analysingNote: { marginTop: 16, color: w(0.4), fontSize: 12 },
  sk: { height: 12, borderRadius: R.sm, backgroundColor: w(0.1) },
  result: { marginTop: 20, borderRadius: R.xl2, borderWidth: 1, borderColor: 'rgba(204,255,0,0.3)', backgroundColor: 'rgba(204,255,0,0.06)', overflow: 'hidden' },
  resultHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(204,255,0,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  resultHeadTxt: { color: C.lime, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2 },
  resultBadge: { borderRadius: R.full, backgroundColor: C.lime, paddingHorizontal: 8, paddingVertical: 4 },
  resultBadgeTxt: { color: C.surface, fontSize: 12 },
  addRow: { flexDirection: 'row', gap: 12, borderRadius: R.xl, borderWidth: 1, borderColor: 'rgba(204,255,0,0.4)', backgroundColor: 'rgba(204,255,0,0.1)', padding: 12 },
  addIcon: { height: 28, width: 28, borderRadius: R.lg, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center' },
  addSub: { marginTop: 4, color: C.lime, fontSize: 12 },
  moveTitle: { color: '#fff', fontSize: 12 },
  rationale: { paddingTop: 4, color: w(0.5), fontSize: 12, lineHeight: 18 },
  resultBtns: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: 'rgba(204,255,0,0.2)', padding: 16 },
  applyBtn: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: R.lg, backgroundColor: C.lime },
  applyTxt: { color: C.surface, fontSize: 12, fontWeight: '500' },
  dismissBtn: { height: 40, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: R.lg, borderWidth: 1, borderColor: w(0.1) },
  dismissTxt: { color: w(0.6), fontSize: 12 },
});
