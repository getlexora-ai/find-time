import { Platform, StyleSheet, View } from 'react-native';

import { connect, disconnect, setCalRead, syncNow, useAccounts } from '../account-store';
import { Icon } from '../Icon';
import { CATS, N, R, SANS } from '../tokens';
import { Button, CalSwatch, Label, Press, Txt } from '../ui';
import { useToast } from './Toast';

/**
 * Calendars (spec §4): connect Google, show / hide each calendar, sync.
 *
 * Hiding a calendar takes its events off the grid and out of the KPI numbers
 * straight away (CalendarScreen filters on it) and stops the next sync reading
 * it. Each calendar shows its own Google colour — the same 6px square its tiles
 * carry, so you can tell Work from Family on the grid.
 */
export function GoogleCalendars() {
  const { loading, accounts, syncing, error } = useAccounts();
  const toast = useToast();
  const isWeb = Platform.OS === 'web';
  const connected = accounts.length > 0;

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Label>Calendars</Label>
        {connected && (
          <Press
            hoverBg={N.hover}
            style={styles.iconBtn}
            accessibilityRole="button"
            aria-label="Sync now"
            onPress={() => {
              void syncNow(true);
              toast('Syncing Google Calendar…');
            }}>
            <Icon name="refresh" size={14} color={syncing ? N.ink : N.faint} />
          </Press>
        )}
      </View>

      {/* Find Time's own blocks are always a calendar of their own. */}
      <View style={styles.calRow}>
        <View style={[styles.box, styles.boxOn]}>
          <Icon name="check" size={10} color={N.onInk} />
        </View>
        <Txt style={styles.calName}>Find Time</Txt>
        <Txt style={styles.tag}>own blocks</Txt>
      </View>

      {!!error && <Txt style={styles.error}>{error}</Txt>}

      {loading ? (
        <Txt style={[styles.muted, styles.pad]}>Loading…</Txt>
      ) : !connected ? (
        isWeb ? (
          <Button
            variant="secondary"
            label="Connect Google Calendar"
            onPress={connect}
            icon={<Icon name="calendar-add" size={14} color={N.ink2} />}
            style={styles.connect}
          />
        ) : (
          <Txt style={styles.muted}>Connect Google Calendar on the web.</Txt>
        )
      ) : (
        accounts.map((a) => (
          <View key={a.id} style={styles.account}>
            <View style={styles.acctHead}>
              <Txt style={styles.acctEmail} numberOfLines={1}>
                {a.email}
              </Txt>
              <Press
                hoverBg={N.hover}
                style={styles.iconBtn}
                accessibilityRole="button"
                aria-label={`Disconnect ${a.email}`}
                onPress={() => {
                  toast(`Disconnecting ${a.email}`);
                  void disconnect(a.id);
                }}>
                <Icon name="trash" size={13} color={N.faint} />
              </Press>
            </View>
            <Txt style={[styles.status, a.syncStatus === 'error' && styles.statusErr]}>
              {syncing
                ? 'syncing…'
                : a.syncStatus === 'error'
                  ? `sync failed — ${a.syncError ?? 'try again'}`
                  : a.lastSyncAt
                    ? `synced ${ago(a.lastSyncAt)}`
                    : 'not synced yet'}
            </Txt>
            {a.syncStatus === 'error' && !syncing && isWeb && (
              // Reconnect re-runs the Google consent for this email; nothing is deleted.
              <Press hoverBg={N.hover} style={styles.reconnect} accessibilityRole="button" onPress={connect}>
                <Icon name="refresh" size={12} color={N.ink2} />
                <Txt style={styles.reconnectTxt}>Reconnect</Txt>
              </Press>
            )}

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
        ))
      )}
    </View>
  );
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const styles = StyleSheet.create({
  section: { paddingVertical: 16, borderTopWidth: 1, borderTopColor: N.line },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, minHeight: 28 },
  iconBtn: { height: 30, width: 30, alignItems: 'center', justifyContent: 'center', borderRadius: R.md },
  pad: { paddingVertical: 6 },
  muted: { fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.muted },
  error: { fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.accentInk, marginBottom: 8 },
  connect: { marginTop: 8, alignSelf: 'stretch' },
  account: { marginTop: 12 },
  acctHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  acctEmail: { flex: 1, fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.ink2 },
  status: { marginBottom: 4, fontFamily: SANS, fontSize: 12, lineHeight: 16, color: N.muted },
  statusErr: { color: N.accentInk },
  reconnect: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: R.md, paddingVertical: 4, paddingHorizontal: 6, marginHorizontal: -6, marginBottom: 4 },
  reconnectTxt: { fontFamily: SANS, fontSize: 12, lineHeight: 16, color: N.ink2, textDecorationLine: 'underline' },
  tag: { fontFamily: SANS, fontSize: 12, lineHeight: 16, color: N.muted },
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
});
