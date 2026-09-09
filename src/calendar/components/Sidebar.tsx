import { ScrollView, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '../Icon';
import { CATS, CAT_KEYS, C, R, w } from '../tokens';
import type { CalEvent } from '../types';
import { AccountButton } from './AccountButton';
import { GoogleCalendars } from './GoogleCalendars';
import { MiniMonth } from './MiniMonth';
import { useCalTheme } from '../theme-context';
import { Press, Txt } from '../ui';
import { useToast } from './Toast';

const NAV: { label: string; icon: IconName; badge?: string; dot?: boolean; active?: boolean }[] = [
  { label: 'Today', icon: 'sun', badge: '04' },
  { label: 'Projects', icon: 'folder', badge: '03' },
  { label: 'Calendar', icon: 'calendar', active: true },
  { label: 'AI sessions', icon: 'magic', dot: true },
];

export function Sidebar({
  selected,
  events,
  onPick,
}: {
  selected: Date;
  events: CalEvent[];
  onPick: (dateIso: string) => void;
}) {
  const { theme } = useCalTheme();
  const toast = useToast();

  return (
    <View style={[styles.aside, { backgroundColor: theme.rail, borderRightColor: w(0.1) }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Txt style={styles.logoTxt}>FT</Txt>
          </View>
          <View>
            <Txt style={styles.brandName}>Find time</Txt>
            <Txt style={styles.brandSub}>AI product planner</Txt>
          </View>
        </View>

        <View style={styles.nav}>
          {NAV.map((n) => (
            <Press
              key={n.label}
              onPress={() => !n.active && toast(`${n.label} is out of scope for this prototype`)}
              hoverBg={n.active ? w(0.15) : w(0.1)}
              style={[styles.navItem, n.active && styles.navItemOn]}>
              <Icon name={n.icon} size={18} color={n.active ? C.lime : w(0.55)} />
              <Txt style={[styles.navLabel, n.active && styles.navLabelOn]}>{n.label}</Txt>
              {n.badge && (
                <View style={n.active ? styles.badgeOn : undefined}>
                  <Txt style={n.active ? styles.badgeOnTxt : styles.badge}>
                    {n.active ? String(events.length) : n.badge}
                  </Txt>
                </View>
              )}
              {n.dot && <View style={styles.navDot} />}
            </Press>
          ))}
        </View>

        <MiniMonth selected={selected} events={events} onPick={onPick} />

        <GoogleCalendars />

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Txt style={styles.sectionTitle}>Categories</Txt>
            <Icon name="eye" size={16} color={w(0.4)} />
          </View>
          {CAT_KEYS.map((k) => (
            <Press key={k} hoverBg={w(0.1)} style={styles.calRow}>
              <View style={[styles.calDot, { backgroundColor: CATS[k].color }]} />
              <Txt style={styles.calLabel}>{CATS[k].label}</Txt>
              <Txt style={styles.calCount}>{events.filter((e) => e.cat === k).length}</Txt>
            </Press>
          ))}
        </View>

        <View style={[styles.focusCard, { borderColor: theme.panelBorder, backgroundColor: theme.panel }]}>
          <View style={styles.focusHead}>
            <Txt style={styles.focusLabel}>Focus protected</Txt>
            <Icon name="shield" size={18} color={C.lime} />
          </View>
          <View style={styles.focusRow}>
            <Txt style={styles.focusBig}>11h</Txt>
            <Txt style={styles.focusDelta}>+2h 30m</Txt>
          </View>
          <View style={styles.bar}>
            <View style={styles.barFill} />
          </View>
          <Txt style={styles.focusNote}>72% of this week&apos;s deep work is booked.</Txt>
        </View>

        <View style={styles.user}>
          <AccountButton showName />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  aside: { width: 256, borderRightWidth: 1 },
  content: { paddingHorizontal: 20, paddingVertical: 24, flexGrow: 1 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 32, paddingHorizontal: 8 },
  logo: {
    height: 40,
    width: 40,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: 'rgba(204,255,0,0.6)',
    backgroundColor: C.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoTxt: { color: C.surface, fontSize: 16, fontWeight: '600', letterSpacing: -1 },
  brandName: { color: '#fff', fontSize: 14, fontWeight: '500' },
  brandSub: { color: w(0.45), fontSize: 12, marginTop: 2 },
  nav: { gap: 4 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: R.lg,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  navItemOn: { backgroundColor: w(0.1), borderWidth: 1, borderColor: w(0.1) },
  navLabel: { flex: 1, color: w(0.55), fontSize: 12 },
  navLabelOn: { color: '#fff' },
  badge: { color: w(0.55), fontSize: 12 },
  badgeOn: { borderRadius: R.sm, backgroundColor: C.lime, paddingHorizontal: 6, paddingVertical: 2 },
  badgeOnTxt: { color: C.surface, fontSize: 12 },
  navDot: { height: 6, width: 6, borderRadius: 3, backgroundColor: C.orange },
  section: { marginTop: 24, borderTopWidth: 1, borderTopColor: w(0.1), paddingTop: 20 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  sectionTitle: { color: w(0.4), fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2 },
  calRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: R.lg, paddingHorizontal: 12, paddingVertical: 10 },
  calDot: { height: 8, width: 8, borderRadius: 4 },
  calLabel: { flex: 1, color: w(0.7), fontSize: 12 },
  calCount: { color: w(0.25), fontSize: 12 },
  focusCard: { marginTop: 24, borderRadius: R.xl, borderWidth: 1, padding: 16 },
  focusHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  focusLabel: { color: w(0.45), fontSize: 12 },
  focusRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8 },
  focusBig: { color: '#fff', fontSize: 24, fontWeight: '500', letterSpacing: -0.5 },
  focusDelta: { color: C.lime, fontSize: 12 },
  bar: { height: 6, borderRadius: R.full, backgroundColor: w(0.1), overflow: 'hidden' },
  barFill: { height: '100%', width: '72%', borderRadius: R.full, backgroundColor: C.lime },
  focusNote: { marginTop: 12, color: w(0.4), fontSize: 12, lineHeight: 18 },
  user: { paddingHorizontal: 8, paddingVertical: 8, marginTop: 16 },
});
