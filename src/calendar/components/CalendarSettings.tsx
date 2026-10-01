import { useEffect, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { C } from '@/design/tokens';
import { HAIRLINE, MONO_STACK } from '@/lib/clerkAppearance';

import { connect, disconnect, refreshAccounts, setCalRead, syncNow, useAccounts } from '../account-store';
import { Icon, type IconName } from '../Icon';
import { CalSwatch, Press } from '../ui';

/**
 * "Calendars" page inside Clerk's Manage account (web): the place to connect,
 * reconnect, sync and disconnect Google Calendar, and pick which calendars
 * are read.
 *
 * Reconnect is the connect flow run again. The OAuth callback reuses the
 * account with the same email and asks Google for consent, so a revoked or
 * expired grant is replaced and the old sync error is cleared — nothing is
 * deleted.
 *
 * It lives on Clerk's dark surface, not the calendar's light one, so it takes
 * its colours and type from the Clerk theme (src/lib/clerkAppearance.ts)
 * rather than the calendar tokens. It also uses no app providers (no toast):
 * Clerk's modal renders it, and every state it needs is in the account store.
 */

const K = {
  text: '#ffffff',
  muted: 'rgba(255,255,255,0.6)',
  faint: 'rgba(255,255,255,0.4)',
  line: HAIRLINE,
  lineStrong: 'rgba(255,255,255,0.25)',
  hover: 'rgba(255,255,255,0.06)',
  lime: C.lime,
  onLime: C.surface,
  danger: C.orange,
};

function Btn({
  label,
  icon,
  onPress,
  kind = 'outline',
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
  kind?: 'primary' | 'outline' | 'quiet';
}) {
  const color = kind === 'primary' ? K.onLime : kind === 'quiet' ? K.muted : K.text;
  return (
    <Press
      hoverBg={kind === 'primary' ? undefined : K.hover}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.btn, kind === 'primary' && styles.btnPrimary, kind === 'outline' && styles.btnOutline]}>
      <Icon name={icon} size={14} color={color} />
      <Text style={[styles.btnTxt, { color }]}>{label}</Text>
    </Press>
  );
}

const T = ({ style, children, lines }: { style: object | object[]; children: ReactNode; lines?: number }) => (
  <Text style={style} numberOfLines={lines}>
    {children}
  </Text>
);

export function CalendarSettings() {
  const { loading, accounts, syncing, error } = useAccounts();

  useEffect(() => {
    void refreshAccounts();
  }, []);

  function remove(id: string, email: string) {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Disconnect ${email}? Its events are removed from Find Time; your Google Calendar is not touched.`)
    ) {
      return;
    }
    void disconnect(id);
  }

  return (
    <View style={styles.page}>
      <View style={styles.head}>
        <T style={styles.title}>Calendars</T>
        <T style={styles.lead}>
          Find Time reads your Google Calendar to plan around it. If sync fails, reconnect the account to give it fresh
          access.
        </T>
      </View>

      {!!error && <T style={styles.error}>{error}</T>}

      {loading ? (
        <T style={styles.muted}>Loading…</T>
      ) : accounts.length === 0 ? (
        <View style={styles.card}>
          <T style={styles.muted}>No Google Calendar connected.</T>
          <View style={styles.buttons}>
            <Btn kind="primary" label="Connect Google Calendar" icon="calendar-add" onPress={connect} />
          </View>
        </View>
      ) : (
        <>
          {accounts.map((a) => {
            const failed = a.syncStatus === 'error';
            return (
              <View key={a.id} style={styles.card}>
                <T style={styles.email} lines={1}>
                  {a.email}
                </T>
                <T style={[styles.status, failed && styles.statusErr]}>
                  {syncing
                    ? 'Syncing…'
                    : failed
                      ? `Sync failed — ${a.syncError ?? 'try reconnecting'}`
                      : a.lastSyncAt
                        ? `Synced ${new Date(a.lastSyncAt).toLocaleString()}`
                        : 'Not synced yet'}
                </T>

                <View style={styles.buttons}>
                  <Btn kind={failed ? 'primary' : 'outline'} label="Reconnect" icon="refresh" onPress={connect} />
                  <Btn
                    kind={failed ? 'outline' : 'primary'}
                    label={syncing ? 'Syncing…' : 'Sync now'}
                    icon="calendar"
                    onPress={() => void syncNow(true)}
                  />
                  <Btn kind="quiet" label="Disconnect" icon="trash" onPress={() => remove(a.id, a.email)} />
                </View>

                {a.calendars.length > 0 && <T style={styles.sub}>Show in Find Time</T>}
                {a.calendars.map((c) => (
                  <Press
                    key={c.id}
                    hoverBg={K.hover}
                    style={styles.calRow}
                    accessibilityRole="checkbox"
                    aria-checked={c.readEnabled}
                    aria-label={`Show ${c.name}`}
                    onPress={() => void setCalRead(c.id, !c.readEnabled)}>
                    <View style={[styles.box, c.readEnabled && styles.boxOn]}>
                      {c.readEnabled && <Icon name="check" size={10} color={K.onLime} />}
                    </View>
                    {/^#[0-9a-f]{6}$/i.test(c.color) && <CalSwatch color={c.color} size={8} />}
                    <T style={[styles.calName, !c.readEnabled && styles.calOff]} lines={1}>
                      {c.name}
                    </T>
                    {c.isPrimary && <T style={styles.tag}>primary</T>}
                  </Press>
                ))}
              </View>
            );
          })}
          <View style={styles.another}>
            <Btn kind="quiet" label="Connect another Google account" icon="calendar-add" onPress={connect} />
          </View>
        </>
      )}
    </View>
  );
}

const base = { fontFamily: MONO_STACK };

const styles = StyleSheet.create({
  page: { gap: 16 },
  head: { gap: 6, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: K.line },
  title: { ...base, fontSize: 17, lineHeight: 24, fontWeight: '700', color: K.text },
  lead: { ...base, fontSize: 13, lineHeight: 20, color: K.muted },
  error: { ...base, fontSize: 13, lineHeight: 18, color: K.danger },
  muted: { ...base, fontSize: 13, lineHeight: 18, color: K.muted },
  card: { borderWidth: 1, borderColor: K.line, borderRadius: 12, padding: 16, gap: 6 },
  email: { ...base, fontSize: 14, lineHeight: 20, fontWeight: '600', color: K.text },
  status: { ...base, fontSize: 12, lineHeight: 17, color: K.muted },
  statusErr: { color: K.danger },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 6 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 34, paddingHorizontal: 12, borderRadius: 8 },
  btnPrimary: { backgroundColor: K.lime },
  btnOutline: { borderWidth: 1, borderColor: K.lineStrong },
  btnTxt: { ...base, fontSize: 13, fontWeight: '600' },
  another: { flexDirection: 'row' },
  sub: { ...base, marginTop: 8, fontSize: 12, lineHeight: 16, color: K.faint, textTransform: 'uppercase', letterSpacing: 0.6 },
  calRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 8, marginHorizontal: -8 },
  box: {
    height: 18,
    width: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: K.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: K.lime, borderColor: K.lime },
  calName: { ...base, flex: 1, fontSize: 14, lineHeight: 20, color: K.text },
  calOff: { color: K.faint },
  tag: { ...base, fontSize: 12, lineHeight: 16, color: K.faint },
});
