import { Platform, StyleSheet, View } from 'react-native';

import { Icon } from '../Icon';
import { C, R, w } from '../tokens';
import { Press, Txt } from '../ui';
import { useToast } from './Toast';
import {
  connect,
  disconnect,
  setCalRead,
  syncNow,
  useAccounts,
} from '../account-store';

/**
 * Sidebar "Calendars" panel — Google Calendar connect / disconnect / per-calendar
 * read toggle / manual sync. Pull-only: these calendars feed events IN, edits in
 * Find Time do not push back (yet).
 */
export function GoogleCalendars() {
  const { loading, accounts, syncing } = useAccounts();
  const toast = useToast();
  const isWeb = Platform.OS === 'web';
  // Key the connect CTA off "no Google account connected", not "no session" —
  // an email/password user is `signedIn` but still has to connect Google here.
  const connected = accounts.length > 0;

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Txt style={styles.title}>Calendars</Txt>
        {connected && (
          <Press
            hoverBg={w(0.1)}
            style={styles.iconBtn}
            onPress={() => {
              void syncNow(true);
              toast('Syncing Google Calendar…');
            }}>
            <Icon name="refresh" size={15} color={syncing ? C.lime : w(0.45)} />
          </Press>
        )}
      </View>

      {loading ? (
        <Txt style={styles.muted}>Loading…</Txt>
      ) : !connected ? (
        isWeb ? (
          <Press
            hoverBg={w(0.1)}
            hoverBorder={C.lime}
            style={styles.connect}
            onPress={connect}>
            <Icon name="calendar-add" size={16} color={C.lime} />
            <Txt style={styles.connectTxt}>Connect Google Calendar</Txt>
          </Press>
        ) : (
          <Txt style={styles.muted}>Connect Google Calendar on the web.</Txt>
        )
      ) : (
        accounts.map((a) => (
          <View key={a.id} style={styles.account}>
            <View style={styles.acctHead}>
              <View style={[styles.acctDot, { backgroundColor: accentColor(a.accentColor) }]} />
              <Txt style={styles.acctEmail} numberOfLines={1}>
                {a.email}
              </Txt>
              <Press
                hoverBg={w(0.1)}
                style={styles.iconBtn}
                onPress={() => {
                  toast(`Disconnecting ${a.email}`);
                  void disconnect(a.id);
                }}>
                <Icon name="trash" size={14} color={w(0.4)} />
              </Press>
            </View>
            <Txt style={[styles.status, a.syncStatus === 'error' && { color: C.orange }]}>
              {syncing
                ? 'syncing…'
                : a.syncStatus === 'error'
                  ? `error — ${a.syncError ?? 'sync failed'}`
                  : a.lastSyncAt
                    ? `synced ${ago(a.lastSyncAt)}`
                    : 'not synced yet'}
            </Txt>

            {a.calendars.map((c) => (
              <Press
                key={c.id}
                hoverBg={w(0.1)}
                style={styles.calRow}
                onPress={() => void setCalRead(c.id, !c.readEnabled)}>
                <View style={[styles.box, c.readEnabled && styles.boxOn]}>
                  {c.readEnabled && <Icon name="check" size={11} color={C.surface} />}
                </View>
                <Txt style={styles.calName} numberOfLines={1}>
                  {c.name}
                </Txt>
                {c.isPrimary && <Txt style={styles.primary}>primary</Txt>}
              </Press>
            ))}
          </View>
        ))
      )}
    </View>
  );
}

function accentColor(name: string): string {
  const map: Record<string, string> = {
    lime: C.lime,
    periwinkle: '#c8c8ff',
    ember: '#ffb39a',
    amber: '#ffd600',
    white: '#ffffff',
  };
  return map[name] ?? C.lime;
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const styles = StyleSheet.create({
  section: { marginTop: 24, borderTopWidth: 1, borderTopColor: w(0.1), paddingTop: 20 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  title: { color: w(0.4), fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2 },
  iconBtn: { borderRadius: R.md, padding: 6 },
  muted: { color: w(0.4), fontSize: 12, paddingHorizontal: 8 },
  connect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: w(0.15),
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  connectTxt: { color: '#fff', fontSize: 12 },
  account: { marginBottom: 8 },
  acctHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 6 },
  acctDot: { height: 8, width: 8, borderRadius: 4 },
  acctEmail: { flex: 1, color: w(0.75), fontSize: 12 },
  status: { color: w(0.35), fontSize: 11, paddingHorizontal: 8, marginBottom: 4 },
  calRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: R.lg,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  box: {
    height: 16,
    width: 16,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: w(0.25),
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: C.lime, borderColor: C.lime },
  calName: { flex: 1, color: w(0.7), fontSize: 12 },
  primary: { color: w(0.3), fontSize: 10 },
});
