import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { connect, disconnect, refreshAccounts, setCalRead, syncNow, useAccounts } from '../account-store';
import { Icon } from '../Icon';
import { CATS, N, R, SANS } from '../tokens';
import { Button, CalSwatch, Press, Txt } from '../ui';

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
 * Rendered inside Clerk's modal, so it uses no app providers (no toast);
 * every state it needs comes from the account store.
 */
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
      <Txt style={styles.title}>Calendars</Txt>
      <Txt style={styles.lead}>
        Find Time reads your Google Calendar to plan around it. If sync fails, reconnect the account to give it fresh
        access.
      </Txt>

      {!!error && <Txt style={styles.error}>{error}</Txt>}

      {loading ? (
        <Txt style={styles.muted}>Loading…</Txt>
      ) : accounts.length === 0 ? (
        <View style={styles.card}>
          <Txt style={styles.muted}>No Google Calendar connected.</Txt>
          <Button
            variant="primary"
            label="Connect Google Calendar"
            onPress={connect}
            icon={<Icon name="calendar-add" size={14} color={N.onInk} />}
            style={styles.action}
          />
        </View>
      ) : (
        <>
          {accounts.map((a) => {
            const failed = a.syncStatus === 'error';
            return (
              <View key={a.id} style={styles.card}>
                <Txt style={styles.email} numberOfLines={1}>
                  {a.email}
                </Txt>
                <Txt style={[styles.status, failed && styles.statusErr]}>
                  {syncing
                    ? 'Syncing…'
                    : failed
                      ? `Sync failed — ${a.syncError ?? 'try reconnecting'}`
                      : a.lastSyncAt
                        ? `Synced ${new Date(a.lastSyncAt).toLocaleString()}`
                        : 'Not synced yet'}
                </Txt>

                <View style={styles.buttons}>
                  <Button
                    variant={failed ? 'primary' : 'secondary'}
                    label="Reconnect"
                    onPress={connect}
                    icon={<Icon name="refresh" size={14} color={failed ? N.onInk : N.ink2} />}
                  />
                  <Button
                    variant="secondary"
                    label={syncing ? 'Syncing…' : 'Sync now'}
                    onPress={() => void syncNow(true)}
                    icon={<Icon name="calendar" size={14} color={N.ink2} />}
                  />
                  <Button
                    variant="ghost"
                    label="Disconnect"
                    onPress={() => remove(a.id, a.email)}
                    icon={<Icon name="trash" size={14} color={N.ink2} />}
                  />
                </View>

                {a.calendars.length > 0 && <Txt style={styles.sub}>Show in Find Time</Txt>}
                {a.calendars.map((c) => (
                  <Press
                    key={c.id}
                    hoverBg={N.hover}
                    style={styles.calRow}
                    accessibilityRole="checkbox"
                    aria-checked={c.readEnabled}
                    aria-label={`Show ${c.name}`}
                    onPress={() => void setCalRead(c.id, !c.readEnabled)}>
                    <View style={[styles.box, c.readEnabled && styles.boxOn]}>
                      {c.readEnabled && <Icon name="check" size={10} color={N.onInk} />}
                    </View>
                    {/^#[0-9a-f]{6}$/i.test(c.color) && <CalSwatch color={c.color} />}
                    <Txt style={[styles.calName, !c.readEnabled && styles.calOff]} numberOfLines={1}>
                      {c.name}
                    </Txt>
                    {c.isPrimary && <Txt style={styles.tag}>primary</Txt>}
                  </Press>
                ))}
              </View>
            );
          })}
          <Button
            variant="ghost"
            label="Connect another Google account"
            onPress={connect}
            icon={<Icon name="calendar-add" size={14} color={N.ink2} />}
            style={styles.another}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 12 },
  title: { fontFamily: SANS, fontSize: 17, lineHeight: 24, fontWeight: '600', color: N.ink },
  lead: { fontFamily: SANS, fontSize: 13, lineHeight: 19, color: N.muted },
  error: { fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.accentInk },
  muted: { fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.muted },
  card: { borderWidth: 1, borderColor: N.line, borderRadius: R.md, padding: 14, gap: 6 },
  email: { fontFamily: SANS, fontSize: 14, lineHeight: 20, fontWeight: '600', color: N.ink },
  status: { fontFamily: SANS, fontSize: 12, lineHeight: 17, color: N.muted },
  statusErr: { color: N.accentInk },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6, marginBottom: 4 },
  action: { marginTop: 8, alignSelf: 'flex-start' },
  another: { alignSelf: 'flex-start' },
  sub: { marginTop: 6, fontFamily: SANS, fontSize: 12, lineHeight: 16, color: N.muted },
  calRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: R.md, paddingVertical: 7, paddingHorizontal: 6, marginHorizontal: -6 },
  box: {
    height: 18,
    width: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: N.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: N.surface,
  },
  boxOn: { backgroundColor: CATS.deep.color, borderColor: CATS.deep.color },
  calName: { flex: 1, fontFamily: SANS, fontSize: 14, lineHeight: 20, color: N.ink },
  calOff: { color: N.faint },
  tag: { fontFamily: SANS, fontSize: 12, lineHeight: 16, color: N.muted },
});
