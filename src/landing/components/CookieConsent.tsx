import { useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';

import { Icon } from '@/design/Icon';
import { C, R, w } from '@/design/tokens';
import { Press, Txt } from '@/design/ui';

import { COOKIES } from '../copy';
import { RAMP } from '../ramp';

/**
 * Cookie notice for the (web-only) landing surface. Modelled on the sibling
 * Lexora repo's `src/components/cookie-consent.tsx`.
 *
 * Notice-only today: the site sets only strictly-necessary cookies (Clerk auth),
 * so there is nothing to consent to — just to be told. Flip `OPTIONAL_COOKIES`
 * when analytics (issue #10) or any non-essential cookie lands, and this turns
 * into an accept / decline choice; `hasCookieConsent('analytics')` is the gate
 * that then goes live.
 *
 * The "decided" flag lives in localStorage, which React doesn't own, so it is
 * read through useSyncExternalStore. Server + first client paint report
 * "decided" so nothing flashes; the store corrects it after hydration.
 */

const KEY = 'find-time-cookie-consent';
const VERSION = 1;
const OPTIONAL_COOKIES = false;

type Choice = 'acknowledged' | 'all' | 'necessary';
type Stored = { v: number; choice: Choice; ts: string };

function read(): Stored | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    return parsed && parsed.v === VERSION && typeof parsed.choice === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function write(choice: Choice) {
  try {
    globalThis.localStorage?.setItem(
      KEY,
      JSON.stringify({ v: VERSION, choice, ts: new Date().toISOString() }),
    );
  } catch {
    /* private mode: the notice reappears next visit, which is acceptable */
  }
}

/**
 * Gate for any future non-essential script. 'necessary' is always allowed;
 * 'analytics' needs a stored 'all' choice, and only once OPTIONAL_COOKIES is on.
 */
export function hasCookieConsent(category: 'necessary' | 'analytics' = 'necessary'): boolean {
  if (category === 'necessary') return true;
  if (!OPTIONAL_COOKIES) return false;
  return read()?.choice === 'all';
}

const listeners = new Set<() => void>();
const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
};

export function CookieConsent() {
  const decided = useSyncExternalStore(
    subscribe,
    () => read() !== null,
    () => true,
  );

  if (decided) return null;

  const choose = (choice: Choice) => {
    write(choice);
    for (const l of listeners) l();
  };

  return (
    <View style={styles.wrap} accessibilityRole="alert" role="alert" aria-label="Cookie notice">
      <View style={styles.row}>
        <Txt style={styles.body}>
          <Txt style={styles.lead}>{COOKIES.lead} </Txt>
          {COOKIES.body}{' '}
          <Link href="/privacy#cookies" style={styles.link}>
            {COOKIES.privacyLink}
          </Link>
          .
        </Txt>
        <Press
          onPress={() => choose('acknowledged')}
          accessibilityRole="button"
          aria-label={COOKIES.dismissLabel}
          hoverBg={w(0.12)}
          style={styles.close}>
          <Icon name="close" size={14} color={RAMP.onBlueMuted} />
        </Press>
      </View>

      <Press
        onPress={() => choose('acknowledged')}
        accessibilityRole="button"
        hoverBg={C.limeHover}
        style={styles.got}>
        <Txt style={styles.gotTxt}>{COOKIES.dismiss}</Txt>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    left: 16,
    maxWidth: 460,
    alignSelf: 'flex-end',
    gap: 12,
    padding: 16,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: w(0.18),
    backgroundColor: '#122a8a',
    zIndex: 50,
  },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  body: { flex: 1, color: RAMP.onBlueMuted, fontSize: 12, lineHeight: 18 },
  lead: { color: '#fff', fontWeight: '500' },
  link: { color: C.lime, fontSize: 12, fontFamily: 'monospace' },
  close: { padding: 4, borderRadius: R.full },
  got: {
    alignSelf: 'flex-start',
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: R.full,
    backgroundColor: C.lime,
  },
  gotTxt: { color: C.surface, fontSize: 12, fontWeight: '500', letterSpacing: 0.5 },
});
