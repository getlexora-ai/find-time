import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatRange } from '@/lib/date';
import { generatePlan, type PlanResult } from '@/lib/planner';
import { addEvents, confirmAllDrafts, discardDrafts, useEvents } from '@/lib/store';
import { CATEGORY_COLOR, CATEGORY_LABEL } from '@/lib/types';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const EXAMPLES = [
  'Find 2 hours for deep work tomorrow morning',
  '3 sessions of 45 min for spec review on Thursday',
  'Block 30 min for inbox this afternoon',
  '90 minutes to prep the demo today',
];

export default function PlanScreen() {
  const theme = useTheme();
  const events = useEvents();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [added, setAdded] = useState(false);

  const pendingDrafts = events.filter((e) => e.draft).length;

  function run(text: string) {
    const q = text.trim();
    if (!q) return;
    setBusy(true);
    setAdded(false);
    // Simulated latency so the flow reads like a real request. The planner itself
    // is synchronous and offline — see src/lib/planner.ts for the LLM plug point.
    setTimeout(() => {
      setResult(generatePlan(q, events));
      setBusy(false);
    }, 350);
  }

  function addToCalendar() {
    if (!result || result.blocks.length === 0) return;
    addEvents(result.blocks);
    setAdded(true);
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.h1, { color: theme.text }]}>Plan with AI</Text>
          <Text style={[styles.sub, { color: theme.textSecondary }]}>
            Describe what you need time for. The planner finds open slots and proposes blocks you can drop onto your calendar.
          </Text>

          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="e.g. Find 2 hours for deep work tomorrow morning"
            placeholderTextColor={theme.textSecondary}
            multiline
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected },
            ]}
            onSubmitEditing={() => run(input)}
          />

          <Pressable
            onPress={() => run(input)}
            disabled={busy || !input.trim()}
            style={[styles.cta, { backgroundColor: theme.text, opacity: busy || !input.trim() ? 0.4 : 1 }]}>
            {busy ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <Text style={[styles.ctaText, { color: theme.background }]}>Generate plan</Text>
            )}
          </Pressable>

          <View style={styles.examples}>
            {EXAMPLES.map((ex) => (
              <Pressable
                key={ex}
                onPress={() => {
                  setInput(ex);
                  run(ex);
                }}
                style={[styles.chip, { borderColor: theme.backgroundSelected }]}>
                <Text style={[styles.chipText, { color: theme.textSecondary }]}>{ex}</Text>
              </Pressable>
            ))}
          </View>

          {result && (
            <View style={styles.result}>
              <Text style={[styles.rationale, { color: theme.text }]}>{result.rationale}</Text>
              {result.notes.map((n) => (
                <Text key={n} style={[styles.note, { color: CATEGORY_COLOR.meeting }]}>
                  ⚠ {n}
                </Text>
              ))}

              {result.blocks.map((b) => (
                <View
                  key={b.id}
                  style={[styles.block, { borderColor: CATEGORY_COLOR[b.category], backgroundColor: theme.backgroundElement }]}>
                  <View style={[styles.blockBar, { backgroundColor: CATEGORY_COLOR[b.category] }]} />
                  <View style={styles.flex}>
                    <Text style={[styles.blockTitle, { color: theme.text }]}>{b.title}</Text>
                    <Text style={[styles.blockMeta, { color: theme.textSecondary }]}>
                      {formatRange(b.start, b.end)} · {CATEGORY_LABEL[b.category]}
                    </Text>
                  </View>
                </View>
              ))}

              {result.blocks.length > 0 && !added && (
                <Pressable onPress={addToCalendar} style={[styles.cta, { backgroundColor: CATEGORY_COLOR.focus }]}>
                  <Text style={styles.ctaText}>
                    Add {result.blocks.length} {result.blocks.length === 1 ? 'block' : 'blocks'} to calendar
                  </Text>
                </Pressable>
              )}

              {added && (
                <Text style={[styles.addedMsg, { color: CATEGORY_COLOR.personal }]}>
                  ✓ Added as proposed blocks. Open the Calendar tab to confirm them.
                </Text>
              )}
            </View>
          )}

          {pendingDrafts > 0 && (
            <View style={[styles.pending, { borderColor: theme.backgroundSelected }]}>
              <Text style={[styles.pendingText, { color: theme.textSecondary }]}>
                {pendingDrafts} proposed {pendingDrafts === 1 ? 'block' : 'blocks'} awaiting review on the calendar
              </Text>
              <View style={styles.pendingActions}>
                <Pressable onPress={confirmAllDrafts} style={[styles.smallBtn, { backgroundColor: CATEGORY_COLOR.personal }]}>
                  <Text style={styles.smallBtnText}>Confirm all</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    discardDrafts();
                    setResult(null);
                    setAdded(false);
                  }}
                  style={[styles.smallBtn, styles.ghost, { borderColor: theme.textSecondary }]}>
                  <Text style={[styles.smallBtnText, { color: theme.textSecondary }]}>Discard all</Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: Spacing.six,
  },
  h1: { fontSize: 24, fontWeight: '700' },
  sub: { fontSize: 14, lineHeight: 20 },
  input: {
    minHeight: 90,
    borderRadius: 14,
    borderWidth: 1,
    padding: Spacing.three,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  cta: { borderRadius: 12, paddingVertical: Spacing.three, alignItems: 'center' },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  examples: { gap: Spacing.two },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  chipText: { fontSize: 13 },
  result: { gap: Spacing.two, marginTop: Spacing.two },
  rationale: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  note: { fontSize: 13, fontWeight: '600' },
  block: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.three,
    alignItems: 'center',
  },
  blockBar: { width: 4, alignSelf: 'stretch', borderRadius: 2, minHeight: 32 },
  blockTitle: { fontSize: 15, fontWeight: '600' },
  blockMeta: { fontSize: 13, marginTop: 2 },
  addedMsg: { fontSize: 14, fontWeight: '600', marginTop: Spacing.one },
  pending: { borderWidth: 1, borderRadius: 12, padding: Spacing.three, gap: Spacing.two, marginTop: Spacing.two },
  pendingText: { fontSize: 13, fontWeight: '600' },
  pendingActions: { flexDirection: 'row', gap: Spacing.two },
  smallBtn: { paddingHorizontal: Spacing.three, paddingVertical: 8, borderRadius: 8 },
  ghost: { backgroundColor: 'transparent', borderWidth: 1 },
  smallBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
