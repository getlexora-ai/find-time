/**
 * `/welcome` on iOS / Android — the same five questions as the web page
 * (src/auth/dom/Onboarding.tsx), on the same contract (src/auth/onboarding.ts)
 * and API, drawn with the calendar's Nexus tokens.
 *
 * Differences from web, all deliberate:
 *   - The preview is the per-day bar strip, not the week grid (a phone has no
 *     room for both the question and a 7-column grid). Same planner behind it.
 *   - Google Calendar connect is web-only in the app today (account-store
 *     `connect`), so step 2 says where to do it and moves on; an account
 *     already connected on the web is used for the preview here too.
 *   - Time zone is the device's, shown and saved as-is.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CATS, MONO, N, tint } from '@/calendar/tokens';
import { useAuthState } from '@/lib/session';
import { Press, Txt } from '@/design/ui';

import { loadOnboarding, type OnboardingState, saveOnboarding, track } from '../client';
import {
  defaultAnswers,
  energyCurveFor,
  FOCUS_MAX,
  FOCUS_MIN,
  focusByDay,
  type Group,
  GROUP_OF,
  hourLabel,
  modernZone,
  type OnboardingAnswers,
  PEAKS,
  previewWeek,
  SAMPLE_MEETINGS,
  type TrackStep,
  WEEKDAYS,
} from '../onboarding';

const STEPS = ['Name', 'Calendar', 'Week', 'Peak', 'Focus'] as const;
const TRACK: TrackStep[] = ['name', 'calendar', 'week', 'peak', 'focus'];
const DAY_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAME = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DEEP = CATS.deep.color;
const SYNC = CATS.sync.color;

function deviceEnv(): { timezone?: string; clock24?: boolean } {
  try {
    const tz = modernZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const h12 = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12;
    return { timezone: tz, clock24: !h12 };
  } catch {
    return {};
  }
}

export default function NativeOnboarding() {
  const router = useRouter();
  const { isLoaded: authLoaded, isSignedIn, user, firstName, refetch } = useAuthState();
  const env = useMemo(() => deviceEnv(), []);

  const [a, setA] = useState<OnboardingAnswers>(() => defaultAnswers(env));
  const [changed, setChanged] = useState<Set<Group>>(() => new Set());
  const [server, setServer] = useState<OnboardingState | null>(null);
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState<null | 'finish' | 'skip'>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const started = useRef(false);
  const viewed = useRef(new Set<number>());
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    if (!user || started.current) return;
    started.current = true;
    void (async () => {
      const st = await loadOnboarding();
      setServer(st);
      if (st?.existing && st.answers) setA({ ...st.answers, firstName: st.answers.firstName || firstName });
      else setA({ ...defaultAnswers(env), firstName });
      setReady(true);
    })();
  }, [user, firstName, env]);

  useEffect(() => {
    if (authLoaded && !isSignedIn) router.replace('/login');
  }, [authLoaded, isSignedIn, router]);
  useEffect(() => {
    if (authLoaded && user?.onboarded && !busy && !done) router.replace('/app');
  }, [authLoaded, user, busy, done, router]);

  useEffect(() => {
    if (!ready || done || viewed.current.has(step)) return;
    viewed.current.add(step);
    track(TRACK[step], 'view', 'native');
  }, [step, ready, done]);

  const existing = Boolean(server?.existing);
  const real = Boolean(server?.connected && server.meetings);
  // Connecting a calendar is web-only: the step only appears when one is already connected.
  const flow = real ? [0, 1, 2, 3, 4] : [0, 2, 3, 4];
  const pos = Math.max(0, flow.indexOf(step));
  const nextOf = () => flow[Math.min(flow.length - 1, pos + 1)];
  const prevOf = () => flow[Math.max(0, pos - 1)];
  const blocks = useMemo(
    () => previewWeek(a, real && server?.meetings ? server.meetings : SAMPLE_MEETINGS),
    [a, real, server],
  );
  const focus = focusByDay(blocks);
  const focusWeek = focus.reduce((n, m) => n + m, 0) / 60;
  const work = WEEKDAYS.map((d) => a.days.includes(d));

  const patch = useCallback((p: Partial<OnboardingAnswers>) => {
    setError(null);
    setA((cur) => ({ ...cur, ...p }));
    setChanged((cur) => {
      const next = new Set(cur);
      for (const k of Object.keys(p) as (keyof OnboardingAnswers)[]) next.add(GROUP_OF[k]);
      return next;
    });
  }, []);

  function goTo(i: number) {
    if (i < 0 || i >= STEPS.length) return;
    if (i > step && step === 2 && !a.days.length) return setError('Pick at least one working day.');
    setStep(i);
    setError(null);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  async function submit(kind: 'finish' | 'skip') {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      await saveOnboarding(
        kind === 'skip' && existing
          ? { skip: true }
          : kind === 'skip'
            ? // keep what was touched, plus this device's time zone and clock
              { answers: a, changed: [...new Set<Group>([...changed, 'prefs'])] }
            : { answers: a, changed: existing ? [...changed] : undefined },
      );
      track(kind === 'skip' ? TRACK[step] : 'done', kind, 'native');
      await refetch();
      if (kind === 'finish') {
        setDone(true);
        setBusy(null);
        return;
      }
      router.replace('/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      setBusy(null);
    }
  }

  if (!authLoaded || !user || !ready) {
    return (
      <View style={[s.root, s.center]}>
        <ActivityIndicator color={N.ink} />
      </View>
    );
  }

  const name = a.firstName.trim();
  const isLast = step === STEPS.length - 1;
  const peak = PEAKS.find((p) => p.id === a.peak)!;

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.top}>
          <Txt style={s.brand}>Find Time</Txt>
          {!done ? (
            <Press onPress={() => void submit('skip')} disabled={!!busy} hoverBg={N.hover} style={s.quiet} accessibilityRole="button">
              <Txt style={s.quietTxt}>{busy === 'skip' ? 'Saving…' : existing ? 'Keep my settings' : 'Skip for now'}</Txt>
            </Press>
          ) : null}
        </View>

        <ScrollView ref={scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          {done ? (
            <View style={s.gap}>
              <Txt style={s.eyebrow}>ALL SET</Txt>
              <Txt style={s.q} accessibilityRole="header">
                {name ? `Your week is ready, ${name}.` : 'Your week is ready.'}
              </Txt>
              <Txt style={s.sub}>Ask Find Time to plan something and it starts from these. It keeps learning from what you move.</Txt>
              <View style={s.card}>
                <Row k="Working" v={`${WEEKDAYS.map((d, i) => (a.days.includes(d) ? DAY_SHORT[i] : '')).filter(Boolean).join(' ')} · ${hourLabel(a.start, a.clock24)}–${hourLabel(a.end, a.clock24)}`} />
                <Row k="Best hours" v={peak.label} />
                <Row k="Deep work" v={`${a.focusH} h a day, ${a.hardWork === 'spread' ? 'spread out' : 'clustered'}`} />
                <Row k="Time zone" v={a.timezone.replace(/_/g, ' ')} last />
              </View>
              <Primary label="Open my week" onPress={() => router.replace('/app')} />
            </View>
          ) : (
            <View style={s.gap}>
              <Txt style={s.eyebrow}>{existing ? 'REVIEW YOUR SETUP' : 'STEP 3 OF 3 · SHAPE YOUR WEEK'}</Txt>
              <View style={s.rail} accessibilityLabel={`Question ${pos + 1} of ${flow.length}: ${STEPS[step]}`}>
                {flow.map((idx, i) => (
                  <View key={idx} style={[s.railItem, i < pos && s.railDone, i === pos && s.railNow]} />
                ))}
              </View>
              <Txt style={s.railLbl}>
                {String(pos + 1).padStart(2, '0')} / {String(flow.length).padStart(2, '0')} · {STEPS[step].toUpperCase()}
              </Txt>

              {step === 0 ? (
                <>
                  <Txt style={s.q} accessibilityRole="header">
                    What should we call you?
                  </Txt>
                  <Txt style={s.sub}>It’s how the week greets you. Nothing else.</Txt>
                  <TextInput
                    value={a.firstName}
                    onChangeText={(t) => patch({ firstName: t })}
                    placeholder="Your first name"
                    placeholderTextColor={N.faint}
                    autoComplete="given-name"
                    textContentType="givenName"
                    maxLength={60}
                    style={s.input}
                    accessibilityLabel="First name"
                    returnKeyType="next"
                    onSubmitEditing={() => goTo(nextOf())}
                  />
                </>
              ) : null}

              {step === 1 ? (
                <>
                  <Txt style={s.q} accessibilityRole="header">
                    {real ? 'Your calendar is connected.' : 'Plan around your real meetings'}
                  </Txt>
                  <Txt style={s.sub}>
                    {real
                      ? `The preview below plans around your ${server?.meetings?.length ?? 0} meetings this week.`
                      : 'Connecting Google Calendar is done on the web for now: open Find Time in a browser and use the Calendars panel. Until then, plans use an example week.'}
                  </Txt>
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <Txt style={s.q} accessibilityRole="header">
                    When do you work?
                  </Txt>
                  <Txt style={s.sub}>Plans only land inside these hours.</Txt>
                  <View style={s.days}>
                    {WEEKDAYS.map((d, i) => {
                      const on = a.days.includes(d);
                      return (
                        <Press
                          key={d}
                          onPress={() => patch({ days: on ? a.days.filter((x) => x !== d) : WEEKDAYS.filter((x) => x === d || a.days.includes(x)) })}
                          style={[s.day, on && s.dayOn]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={DAY_NAME[i]}>
                          <Txt style={[s.dayTxt, on && s.dayTxtOn]}>{DAY_SHORT[i]}</Txt>
                        </Press>
                      );
                    })}
                  </View>
                  <View style={s.hours}>
                    <Stepper label="Start" value={hourLabel(a.start, a.clock24)} onDec={() => patch({ start: a.start - 1 })} onInc={() => patch({ start: a.start + 1 })} decOff={a.start <= 5} incOff={a.end - a.start - 1 < 2} />
                    <Stepper label="End" value={hourLabel(a.end, a.clock24)} onDec={() => patch({ end: a.end - 1 })} onInc={() => patch({ end: a.end + 1 })} decOff={a.end - 1 - a.start < 2} incOff={a.end >= 23} />
                  </View>
                  <View style={s.card}>
                    <Row k="Time zone" v={a.timezone.replace(/_/g, ' ')} />
                    <View style={s.row}>
                      <Txt style={s.rowK}>Clock</Txt>
                      <Toggle options={['24h', '12h']} value={a.clock24 ? 0 : 1} onPick={(i) => patch({ clock24: i === 0 })} />
                    </View>
                    <View style={[s.row, s.rowLast]}>
                      <Txt style={s.rowK}>Week starts</Txt>
                      <Toggle options={['Monday', 'Sunday']} value={a.weekStart === 1 ? 0 : 1} onPick={(i) => patch({ weekStart: i === 0 ? 1 : 0 })} />
                    </View>
                  </View>
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <Txt style={s.q} accessibilityRole="header">
                    When do you think best?
                  </Txt>
                  <Txt style={s.sub}>Deep work is ranked into these hours first.</Txt>
                  <View style={s.gapSm} accessibilityRole="radiogroup">
                    {PEAKS.map((p) => {
                      const on = a.peak === p.id;
                      return (
                        <Press
                          key={p.id}
                          onPress={() => patch({ peak: p.id })}
                          style={[s.peak, on && s.peakOn]}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: on }}>
                          <View style={{ flex: 1 }}>
                            <Txt style={s.peakTitle}>{p.label}</Txt>
                            <Txt style={s.peakHint}>{a.clock24 ? p.hint : `${hourLabel(p.from, false)} – ${hourLabel(p.to, false)}`}</Txt>
                          </View>
                          <Curve peak={p.id} on={on} />
                        </Press>
                      );
                    })}
                  </View>
                </>
              ) : null}

              {step === 4 ? (
                <>
                  <Txt style={s.q} accessibilityRole="header">
                    How much deep work a day?
                  </Txt>
                  <Txt style={s.sub}>Your daily budget for deep work.</Txt>
                  <Stepper
                    label="Each working day"
                    value={`${a.focusH} h`}
                    onDec={() => patch({ focusH: a.focusH - 0.5 })}
                    onInc={() => patch({ focusH: a.focusH + 0.5 })}
                    decOff={a.focusH <= FOCUS_MIN}
                    incOff={a.focusH >= FOCUS_MAX}
                  />
                  <Toggle
                    options={['Spread it', 'Cluster it']}
                    value={a.hardWork === 'spread' ? 0 : 1}
                    onPick={(i) => patch({ hardWork: i === 0 ? 'spread' : 'cluster' })}
                    wide
                  />
                  <Txt style={s.hint}>{a.hardWork === 'spread' ? 'A little every day.' : 'Big days, lighter days.'}</Txt>
                </>
              ) : null}

              {error ? (
                <Txt style={s.error} accessibilityLiveRegion="polite">
                  {error}
                </Txt>
              ) : null}

              <View style={s.nav}>
                {step > 0 ? (
                  <Press onPress={() => goTo(prevOf())} style={s.quiet} hoverBg={N.hover} accessibilityRole="button">
                    <Txt style={s.quietTxt}>← Back</Txt>
                  </Press>
                ) : (
                  <View />
                )}
                <Primary
                  label={isLast ? (existing ? 'Save changes' : 'Finish setup') : step === 1 && !real ? 'Use an example week' : 'Continue'}
                  onPress={() => (isLast ? void submit('finish') : goTo(nextOf()))}
                  busy={busy === 'finish'}
                />
              </View>
            </View>
          )}
        </ScrollView>

        {!done ? <Bars focus={focus} blocks={blocks} work={work} showFocus={step >= 3} total={focusWeek} real={real} /> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Primary({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) {
  return (
    <Press onPress={onPress} disabled={busy} style={s.primary} hoverBg="#262626" accessibilityRole="button" accessibilityState={{ busy }}>
      {busy ? <ActivityIndicator color={N.onInk} /> : <Txt style={s.primaryTxt}>{label} →</Txt>}
    </Press>
  );
}

function Row({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <View style={[s.row, last && s.rowLast]}>
      <Txt style={s.rowK}>{k}</Txt>
      <Txt style={s.rowV}>{v}</Txt>
    </View>
  );
}

function Stepper(props: { label: string; value: string; onDec: () => void; onInc: () => void; decOff: boolean; incOff: boolean }) {
  return (
    <View style={s.stepper}>
      <Press onPress={props.onDec} disabled={props.decOff} style={s.stepBtn} accessibilityRole="button" accessibilityLabel={`${props.label}: less, now ${props.value}`}>
        <Txt style={[s.stepGlyph, props.decOff && { color: N.ghost }]}>−</Txt>
      </Press>
      <View style={{ alignItems: 'center' }}>
        <Txt style={s.stepLbl}>{props.label}</Txt>
        <Txt style={s.stepVal}>{props.value}</Txt>
      </View>
      <Press onPress={props.onInc} disabled={props.incOff} style={s.stepBtn} accessibilityRole="button" accessibilityLabel={`${props.label}: more, now ${props.value}`}>
        <Txt style={[s.stepGlyph, props.incOff && { color: N.ghost }]}>+</Txt>
      </Press>
    </View>
  );
}

function Toggle({ options, value, onPick, wide }: { options: string[]; value: number; onPick: (i: number) => void; wide?: boolean }) {
  return (
    <View style={[s.toggle, wide && { alignSelf: 'stretch' }]}>
      {options.map((o, i) => (
        <Press
          key={o}
          onPress={() => onPick(i)}
          style={[s.toggleBtn, wide && { flex: 1 }, i === value && s.toggleOn]}
          accessibilityRole="button"
          accessibilityState={{ selected: i === value }}>
          <Txt style={[s.toggleTxt, i === value && { color: N.ink }]}>{o}</Txt>
        </Press>
      ))}
    </View>
  );
}

/** The stored energy curve for a peak as 16 little columns (6–21h). */
function Curve({ peak, on }: { peak: (typeof PEAKS)[number]['id']; on: boolean }) {
  return (
    <View style={s.curve} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {energyCurveFor(peak).map((p) => (
        <View key={p.hour} style={[s.curveBar, { height: 4 + p.level * 22, backgroundColor: on ? N.accent : N.ghost }]} />
      ))}
    </View>
  );
}

function Bars({
  focus,
  blocks,
  work,
  showFocus,
  total,
  real,
}: {
  focus: number[];
  blocks: { day: number; kind: string }[];
  work: boolean[];
  showFocus: boolean;
  total: number;
  real: boolean;
}) {
  const meet = [0, 0, 0, 0, 0, 0, 0];
  for (const b of blocks) if (b.kind === 'meeting') meet[b.day]++;
  return (
    <View style={s.bars} accessibilityLabel={showFocus ? `${total} hours of deep work this week` : 'Your working week'}>
      <View style={s.barRow}>
        {DAY_SHORT.map((d, i) => (
          <View key={i} style={s.barCol}>
            <View style={[s.barTrack, !work[i] && { backgroundColor: N.offHours, borderWidth: 1, borderColor: N.line }]}>
              <View style={[s.barFill, { height: `${showFocus ? Math.min(1, focus[i] / 360) * 100 : 0}%` }]} />
            </View>
            <Txt style={[s.barDay, !work[i] && { color: N.faint }]}>{d}</Txt>
            <Txt style={s.barMeet}>{meet[i] ? String(meet[i]) : ' '}</Txt>
          </View>
        ))}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Txt style={s.barTotal}>{showFocus ? `${total} h` : `${work.filter(Boolean).length} days`}</Txt>
        <Txt style={s.barCap}>{showFocus ? 'deep work' : 'working'}</Txt>
        <Txt style={s.barCap}>{real ? 'your meetings' : 'example meetings'}</Txt>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: N.ground },
  center: { alignItems: 'center', justifyContent: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 },
  brand: { fontSize: 15, fontWeight: '600', color: N.ink },
  body: { padding: 20, paddingBottom: 32 },
  gap: { gap: 16 },
  gapSm: { gap: 10 },
  eyebrow: { fontFamily: MONO, fontSize: 11, letterSpacing: 0.9, color: N.muted },
  rail: { flexDirection: 'row', gap: 6 },
  railItem: { flex: 1, height: 2, borderRadius: 1, backgroundColor: N.ghost },
  railDone: { backgroundColor: N.ink2 },
  railNow: { backgroundColor: N.accent },
  railLbl: { fontFamily: MONO, fontSize: 10.5, color: N.ink2, marginTop: -8 },
  q: { fontSize: 28, lineHeight: 31, fontWeight: '500', letterSpacing: -0.9, color: N.ink },
  sub: { fontSize: 15.5, lineHeight: 23, color: N.ink2, marginTop: -6 },
  hint: { fontSize: 13, color: N.muted },
  input: {
    height: 50,
    borderRadius: 12,
    backgroundColor: N.surface,
    borderWidth: 1,
    borderColor: N.line,
    paddingHorizontal: 14,
    fontSize: 16,
    color: N.ink,
  },
  days: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: N.surface, borderWidth: 1, borderColor: N.line },
  dayOn: { backgroundColor: N.ink, borderColor: N.ink },
  dayTxt: { fontSize: 14, fontWeight: '500', color: N.muted },
  dayTxtOn: { color: N.onInk },
  hours: { flexDirection: 'row', gap: 10 },
  stepper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 58,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: N.surface,
    borderWidth: 1,
    borderColor: N.line,
  },
  stepBtn: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stepGlyph: { fontSize: 20, color: N.ink2 },
  stepLbl: { fontSize: 11, color: N.muted },
  stepVal: { fontFamily: MONO, fontSize: 17, color: N.ink },
  card: { borderRadius: 14, backgroundColor: N.surface, borderWidth: 1, borderColor: N.line },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, minHeight: 52, borderBottomWidth: 1, borderBottomColor: N.line },
  rowLast: { borderBottomWidth: 0 },
  rowK: { fontSize: 14, color: N.muted },
  rowV: { fontSize: 14, fontWeight: '500', color: N.ink, flexShrink: 1, textAlign: 'right' },
  toggle: { flexDirection: 'row', padding: 3, borderRadius: 10, backgroundColor: N.sunken },
  toggleBtn: { height: 34, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  toggleOn: { backgroundColor: N.surface, borderWidth: 1, borderColor: N.line },
  toggleTxt: { fontSize: 13.5, color: N.muted },
  peak: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: N.surface, borderWidth: 1, borderColor: N.line },
  peakOn: { borderColor: N.ink, borderWidth: 1.5 },
  peakTitle: { fontSize: 15, fontWeight: '500', color: N.ink },
  peakHint: { fontFamily: MONO, fontSize: 11, color: N.muted, marginTop: 2 },
  curve: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 28 },
  curveBar: { width: 4, borderRadius: 1 },
  error: { fontSize: 13.5, color: N.accentInk, backgroundColor: tint(N.accent, 0.1), padding: 10, borderRadius: 10, overflow: 'hidden' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  quiet: { paddingHorizontal: 12, height: 40, borderRadius: 999, justifyContent: 'center' },
  quietTxt: { fontSize: 15, color: N.ink2 },
  primary: { height: 50, paddingHorizontal: 22, borderRadius: 999, backgroundColor: N.ink, alignItems: 'center', justifyContent: 'center' },
  primaryTxt: { color: N.onInk, fontSize: 15, fontWeight: '500' },
  bars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: N.line,
    backgroundColor: N.glass,
  },
  barRow: { flex: 1, flexDirection: 'row', gap: 6 },
  barCol: { flex: 1, alignItems: 'center', gap: 2 },
  barTrack: { width: '100%', maxWidth: 26, height: 28, borderRadius: 5, backgroundColor: N.sunken, overflow: 'hidden', justifyContent: 'flex-end' },
  barFill: { width: '100%', backgroundColor: DEEP, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barDay: { fontSize: 11, color: N.ink2, fontWeight: '500' },
  barMeet: { fontFamily: MONO, fontSize: 9.5, color: SYNC, lineHeight: 11 },
  barTotal: { fontSize: 18, fontWeight: '500', color: N.ink, letterSpacing: -0.5 },
  barCap: { fontSize: 10.5, color: N.muted },
});
