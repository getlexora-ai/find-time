import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { useToast } from '@/calendar/components/Toast';
import { Icon } from '@/design/Icon';
import { C, ink, LANDING, R } from '@/design/tokens';
import { MONO, Press, Txt } from '@/design/ui';
import { useReducedMotion } from '@/design/useReducedMotion';

import { PHONE, TOASTS } from '../copy';
import { RAMP } from '../ramp';

type ResponseState = 'default' | 'thinking' | 'answered';

const RESPONSE_COPY: Record<ResponseState, { title: string; body: string }> = {
  default: { title: PHONE.responseTitle, body: PHONE.responseBody },
  thinking: { title: PHONE.thinkingTitle, body: PHONE.thinkingBody },
  answered: { title: PHONE.answeredTitle, body: PHONE.answeredBody },
};

/**
 * The light `#f4f4f4` phone mock: status bar + notch, a decorative crosshair
 * overlay (landing.html's stacked CSS gradients, ported as one small SVG), the
 * capacity panel, the "ASK FIND TIME" input, the AI response block, and the
 * APPLY PLAN footer. `capacity` is driven by the planner card's regenerate.
 */
export function MockPhoneCard({ capacity }: { capacity: number }) {
  const toast = useToast();
  const reduced = useReducedMotion();
  const [prompt, setPrompt] = useState<string>(PHONE.askValue);
  const [response, setResponse] = useState<ResponseState>('default');
  const [applied, setApplied] = useState(false);
  const [barW] = useState(() => new Animated.Value(capacity));
  const askTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Animated.timing(barW, {
      toValue: capacity,
      duration: reduced ? 0 : 700,
      useNativeDriver: false,
    }).start();
  }, [capacity, reduced, barW]);

  useEffect(() => () => {
    if (askTimer.current != null) clearTimeout(askTimer.current);
  }, []);

  const ask = () => {
    if (!prompt.trim()) return;
    setResponse('thinking');
    if (askTimer.current != null) clearTimeout(askTimer.current);
    askTimer.current = setTimeout(() => {
      setResponse('answered');
      toast(TOASTS.askAnswered);
    }, 1100);
  };

  const apply = () => {
    if (applied) return;
    setApplied(true);
    toast(TOASTS.planApplied);
  };

  const r = RESPONSE_COPY[response];
  const width = barW.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });

  return (
    <View style={styles.card}>
      {/* status bar */}
      <View style={styles.statusBar}>
        <Txt style={styles.statusTxt}>{PHONE.statusTime}</Txt>
        <View style={styles.notch} />
        <View style={styles.statusIcons}>
          <Icon name="wifi" size={14} color={RAMP.onLight} />
          <Icon name="battery" size={14} color={RAMP.onLight} />
        </View>
      </View>

      {/* decorative crosshair (landing.html: 3 stacked radial/linear gradients) */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none" opacity={0.2}>
        <Circle cx="20%" cy="20%" r="14" stroke={C.orange} strokeWidth={1} fill="none" />
        <Line x1="20%" y1="0%" x2="20%" y2="100%" stroke={C.orange} strokeWidth={1} />
        <Line x1="0%" y1="20%" x2="100%" y2="20%" stroke={C.orange} strokeWidth={1} />
      </Svg>

      <View style={styles.headRow}>
        <View>
          <Txt style={styles.eyebrow}>{PHONE.eyebrow}</Txt>
          <Txt style={styles.title}>{PHONE.title}</Txt>
        </View>
        <View style={styles.badge}>
          <Icon name="magic" size={20} color={C.lime} />
        </View>
      </View>

      {/* capacity */}
      <View style={styles.panel}>
        <View style={styles.panelHead}>
          <Txt style={styles.muted}>{PHONE.capacityLabel}</Txt>
          <Txt style={styles.strong}>{capacity}%</Txt>
        </View>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, { width }]} />
        </View>
        <View style={styles.panelFoot}>
          <Txt style={styles.muted}>{PHONE.plannedLabel}</Txt>
          <Txt style={styles.muted}>{PHONE.freeLabel}</Txt>
        </View>
      </View>

      {/* ask */}
      <View style={{ marginTop: 20 }}>
        <Txt style={[styles.muted, { marginBottom: 8 }]}>{PHONE.askLabel}</Txt>
        <View style={styles.inputRow}>
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            onSubmitEditing={ask}
            aria-label={PHONE.askAccessibilityLabel}
            placeholderTextColor={ink(0.35)}
            style={styles.input}
          />
          <Press
            onPress={ask}
            accessibilityRole="button"
            aria-label={PHONE.submitLabel}
            hoverTransform={{ scale: 1.05 }}
            style={styles.send}>
            <Icon name="arrow-forward" size={18} color={C.surface} />
          </Press>
        </View>
      </View>

      {/* response */}
      <View style={[styles.response, response === 'thinking' ? { opacity: 0.4 } : null]}>
        <View style={styles.responseHead}>
          <Icon name="stars" size={18} color={C.surface} />
          <Txt style={styles.responseTitle}>{r.title}</Txt>
        </View>
        <Txt style={styles.responseBody}>{r.body}</Txt>
      </View>

      {/* footer */}
      <View style={styles.footer}>
        <Txt style={styles.muted}>{PHONE.changes}</Txt>
        <Press
          onPress={apply}
          accessibilityRole="button"
          hoverTransform={{ translateY: -2 }}
          style={[styles.apply, applied ? { backgroundColor: C.canvas } : null]}>
          <Txt style={styles.applyTxt}>{applied ? PHONE.applied : PHONE.apply}</Txt>
        </Press>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 384,
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 32,
    borderWidth: 6,
    borderColor: C.surface,
    backgroundColor: C.light,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  statusBar: {
    marginHorizontal: -8,
    marginTop: -12,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusTxt: { fontSize: 10, fontWeight: '500', color: RAMP.onLight },
  notch: {
    position: 'absolute',
    left: '50%',
    top: 0,
    height: 20,
    width: 80,
    marginLeft: -40,
    borderRadius: R.full,
    backgroundColor: C.surface,
  },
  statusIcons: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  eyebrow: { color: RAMP.onLight, fontSize: 12 },
  title: { marginTop: 4, fontSize: 14, fontWeight: '500', color: C.surface },
  badge: {
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.full,
    backgroundColor: C.surface,
  },
  panel: {
    marginTop: 32,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: ink(0.1),
    backgroundColor: LANDING.phonePanel,
    padding: 16,
  },
  panelHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  panelFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  muted: { color: RAMP.onLight, fontSize: 12 },
  strong: { color: C.surface, fontWeight: '500', fontSize: 12 },
  track: { height: 8, borderRadius: R.full, backgroundColor: ink(0.1), overflow: 'hidden' },
  fill: { height: '100%', borderRadius: R.full, backgroundColor: C.orange },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: ink(0.15),
    backgroundColor: C.lightCard,
    padding: 8,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 8,
    color: C.surface,
    fontFamily: MONO,
    fontSize: 12,
  },
  send: {
    height: 36,
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.md,
    backgroundColor: C.orange,
  },
  response: {
    marginTop: 16,
    borderRadius: R.lg,
    backgroundColor: LANDING.aiResponse,
    padding: 16,
  },
  responseHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  responseTitle: { color: C.surface, fontWeight: '500', fontSize: 12 },
  responseBody: { color: ink(0.75), fontSize: 12, lineHeight: 20 },
  footer: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: ink(0.1),
    paddingTop: 16,
  },
  apply: {
    borderRadius: R.full,
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  applyTxt: { color: '#fff', fontWeight: '500', fontSize: 12 },
});
