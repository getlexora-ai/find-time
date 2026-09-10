import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/design/Icon';
import { C, R, rgba, w } from '@/design/tokens';
import { MONO, Press, Txt } from '@/design/ui';
import { clampText, joinWaitlist, NAME_MAX, REASON_MAX, validateEmail } from '@/signup/waitlist';

import { WAITLIST } from '../copy';
import { RAMP } from '../ramp';

type State = 'idle' | 'submitting' | 'success' | 'error';

/**
 * Email capture for the landing page. Not in landing.html — this is the M2/M3
 * slice the user asked for. Single opt-in, no confirmation email yet (needs a
 * vendor, plan §10 Q8). Posts to `/api/waitlist`; validates client-side first for
 * an instant error. Honeypot `company` field is visually hidden, not
 * `display:none`, so it stays out of the a11y tree without tipping off scripted
 * fills.
 */
export function WaitlistForm({
  source = 'waitlist_section',
  detailed = false,
}: {
  source?: string;
  /** the /waitlist page: stack the fields and reveal the optional name + "why" */
  detailed?: boolean;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [company, setCompany] = useState(''); // honeypot
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState('');
  const submittedAt = useRef(0);

  const submit = async () => {
    if (state === 'submitting') return;
    if (!validateEmail(email)) {
      setState('error');
      setMessage(WAITLIST.errorInvalid);
      return;
    }
    // debounce a double-tap
    const now = Date.now();
    if (now - submittedAt.current < 800) return;
    submittedAt.current = now;

    setState('submitting');
    const res = await joinWaitlist({
      email,
      company,
      source,
      name: detailed ? clampText(name, NAME_MAX) : undefined,
      reason: detailed ? clampText(reason, REASON_MAX) : undefined,
    });
    if (res.ok) {
      setState('success');
      setMessage(res.status === 'already' ? WAITLIST.successAlready : WAITLIST.success);
    } else {
      setState('error');
      setMessage(
        res.error === 'invalid_email'
          ? WAITLIST.errorInvalid
          : res.error === 'rate_limited'
            ? WAITLIST.errorRateLimited
            : WAITLIST.errorServer,
      );
    }
  };

  if (state === 'success') {
    return (
      <View style={styles.successRow} accessibilityLiveRegion="polite" aria-live="polite">
        <Icon name="check" size={20} color={C.lime} />
        <Txt style={styles.successTxt}>{message}</Txt>
      </View>
    );
  }

  const busy = state === 'submitting';

  return (
    <View style={[styles.wrap, detailed ? styles.wrapWide : null]}>
      {detailed && (
        <>
          <View style={styles.field}>
            <Txt style={styles.fieldLabel}>
              {WAITLIST.nameLabel} <Txt style={styles.optional}>· {WAITLIST.optional}</Txt>
            </Txt>
            <TextInput
              value={name}
              onChangeText={setName}
              editable={!busy}
              placeholder={WAITLIST.namePlaceholder}
              placeholderTextColor={w(0.4)}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={NAME_MAX}
              aria-label={WAITLIST.nameLabel}
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Txt style={styles.fieldLabel}>
              {WAITLIST.reasonLabel} <Txt style={styles.optional}>· {WAITLIST.optional}</Txt>
            </Txt>
            <TextInput
              value={reason}
              onChangeText={setReason}
              editable={!busy}
              placeholder={WAITLIST.reasonPlaceholder}
              placeholderTextColor={w(0.4)}
              multiline
              numberOfLines={4}
              maxLength={REASON_MAX}
              textAlignVertical="top"
              aria-label={WAITLIST.reasonLabel}
              style={[styles.input, styles.textarea]}
            />
          </View>
        </>
      )}

      <View style={[styles.row, detailed ? styles.rowStacked : null]}>
        <TextInput
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            if (state === 'error') setState('idle');
          }}
          onSubmitEditing={submit}
          editable={!busy}
          placeholder={WAITLIST.placeholder}
          placeholderTextColor={w(0.4)}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="email"
          aria-label={WAITLIST.emailLabel}
          style={[styles.input, state === 'error' ? styles.inputError : null]}
        />

        {/* honeypot — parked offscreen, hidden from the a11y tree; only a bot fills it */}
        <TextInput
          value={company}
          onChangeText={setCompany}
          aria-hidden
          autoComplete="off"
          style={styles.honeypot}
        />

        <Press
          onPress={submit}
          disabled={busy}
          accessibilityRole="button"
          aria-busy={busy}
          hoverBg={C.limeHover}
          hoverTransform={{ translateY: -2 }}
          style={[
            styles.submit,
            detailed ? styles.submitStacked : null,
            busy ? { opacity: 0.7 } : null,
          ]}>
          <Txt style={styles.submitTxt}>{busy ? WAITLIST.submitting : WAITLIST.submit}</Txt>
          {!busy && <Icon name="arrow-right-up" size={16} color={C.surface} />}
        </Press>
      </View>

      {state === 'error' && (
        <View style={styles.errorRow} accessibilityRole="alert" role="alert">
          <Icon name="triangle" size={14} color={C.orange} />
          <Txt style={styles.errorTxt}>{message}</Txt>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 460, gap: 10 },
  wrapWide: { maxWidth: 520, gap: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  rowStacked: { flexDirection: 'column', alignItems: 'stretch' },
  field: { gap: 6 },
  fieldLabel: { color: w(0.7), fontSize: 11, letterSpacing: 1 },
  optional: { color: w(0.4), fontSize: 10, letterSpacing: 1 },
  textarea: { minHeight: 96, paddingVertical: 12 },
  input: {
    flexGrow: 1,
    flexBasis: 240,
    minHeight: 44,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: w(0.2),
    backgroundColor: w(0.1),
    paddingHorizontal: 16,
    color: '#fff',
    fontFamily: MONO,
    fontSize: 13,
  },
  inputError: { borderColor: C.orange },
  honeypot: {
    position: 'absolute',
    width: 1,
    height: 1,
    left: -9999,
    opacity: 0,
  },
  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: rgba('#ccff00', 0.5),
    backgroundColor: C.lime,
    paddingHorizontal: 18,
    justifyContent: 'center',
    // detailed layout: `submitStacked` widens this below
  },
  submitStacked: { alignSelf: 'stretch', marginTop: 4 },
  submitTxt: { color: C.surface, fontSize: 12, fontWeight: '500', letterSpacing: 0.5 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorTxt: { color: C.orange, fontSize: 12 },
  successRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  successTxt: { color: RAMP.onBlue, fontSize: 13 },
});
