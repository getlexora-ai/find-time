import { Platform, StyleSheet, View } from 'react-native';

import { connect, disconnect, setCalRead, syncNow, useAccounts } from '../account-store';
import { Icon } from '../Icon';
import { N, R, SANS, T } from '../tokens';
import { Button, CalSwatch, Label, Mono, Press, Txt } from '../ui';
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
        <Mono>own blocks</Mono>
      </View>

      {!!error && <Txt style={styles.error}>{error}</Txt>}

      {loading ? (
        <Mono style={styles.pad}>Loading…</Mono>
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
            <Mono style={[styles.status, a.syncStatus === 'error' && styles.statusErr]}>
              {syncing
                ? 'syncing…'
                : a.syncStatus === 'error'
                  ? `sync failed — ${a.syncError ?? 'try again'}`
                  : a.lastSyncAt
                    ? `synced ${ago(a.lastSyncAt)}`
                    : 'not synced yet'}
            </Mono>

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
                {c.isPrimary && <Mono>primary</Mono>}
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
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, minHeight: 24 },
  iconBtn: { height: 24, width: 24, alignItems: 'center', justifyContent: 'center', borderRadius: R.sm },
  pad: { paddingVertical: 6 },
  muted: { fontFamily: SANS, ...T.caption, color: N.muted },
  error: { fontFamily: SANS, ...T.caption, color: N.accentInk, marginBottom: 8 },
  connect: { marginTop: 8, alignSelf: 'stretch' },
  account: { marginTop: 10 },
  acctHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  acctEmail: { flex: 1, fontFamily: SANS, ...T.caption, color: N.ink2 },
  status: { marginBottom: 4 },
  statusErr: { color: N.accentInk },
  calRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: R.sm, paddingVertical: 5, paddingHorizontal: 2 },
  box: {
    height: 14,
    width: 14,
    borderRadius: R.xs,
    borderWidth: 1,
    borderColor: N.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: N.surface,
  },
  boxOn: { backgroundColor: N.ink, borderColor: N.ink },
  calName: { flex: 1, fontFamily: SANS, ...T.caption, color: N.ink },
  calOff: { color: N.faint },
});
