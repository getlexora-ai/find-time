import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAccounts } from '../account-store';
import { Icon } from '../Icon';
import { Logo } from '@/design/Logo';
import type { CalActions, CalState, ViewKind } from '../state';
import { useCalTheme } from '../theme-context';
import { C, R, w } from '../tokens';
import { CHROME_BLUR, Press, Txt } from '../ui';
import { useResponsive } from '../useResponsive';
import { AccountButton } from './AccountButton';

const VIEWS: { key: ViewKind; label: string; short: string }[] = [
  { key: 'month', label: 'Month', short: 'M' },
  { key: 'week', label: 'Week', short: 'W' },
  { key: 'day', label: 'Day', short: 'D' },
];

function agoShort(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * The single bar above the grid — period, navigation, view, actions.
 *
 * Replaces the stacked Header + Toolbar, which together spent ~190px of every
 * screen before any calendar appeared: a 64px chrome bar (breadcrumb, a search
 * box that raised "Search is not built yet", a bell that raised "No
 * notifications yet") over a ~120px title block (a letter-spaced eyebrow, a
 * 30px title and a sentence of prose restating the counts beside it).
 *
 * What survived is what you act on. The prose is gone, the two inert controls
 * are gone, and the counts that were narrated in a paragraph are now a clash
 * pill you can click. ~56px total, so the grid starts near the top of the
 * viewport instead of halfway down it.
 */
export function CommandBar({
  state,
  actions,
  title,
  clashes,
  onOpenTheme,
}: {
  state: CalState;
  actions: CalActions;
  title: string;
  clashes: number;
  onOpenTheme: (anchor: { x: number; y: number }) => void;
}) {
  const { theme } = useCalTheme();
  const { isDesktop, isPhone } = useResponsive();
  const { accounts, syncing } = useAccounts();
  const themeBtn = useRef<View>(null);

  const lastSync = accounts
    .map((a) => a.lastSyncAt)
    .filter((t): t is string => Boolean(t))
    .sort()
    .at(-1);
  const syncLabel = syncing
    ? 'Syncing…'
    : lastSync
      ? `Synced ${agoShort(lastSync)}`
      : accounts.length
        ? 'Not synced'
        : 'No calendar';

  return (
    <View style={[styles.bar, CHROME_BLUR, { backgroundColor: theme.chrome }]}>
      {!isDesktop && (
        <View style={styles.logo}>
          <Logo size={20} color={C.surface} />
        </View>
      )}

      <Press
        disabled={isDesktop}
        onPress={actions.openPicker}
        style={styles.titleBtn}
        accessibilityRole="button">
        <Txt numberOfLines={1} style={[styles.title, isPhone && styles.titlePhone]}>
          {title}
        </Txt>
        {!isDesktop && <Icon name="arrow-down" size={14} color={w(0.4)} />}
      </Press>

      <View style={styles.group}>
        <Press
          onPress={() => actions.step(-1)}
          hoverBg={w(0.1)}
          style={styles.navIcon}
          accessibilityRole="button"
          aria-label="Previous period">
          <Icon name="arrow-left" size={16} color={w(0.6)} />
        </Press>
        <Press onPress={actions.goToday} hoverBg={w(0.1)} style={styles.today} accessibilityRole="button">
          <Txt style={styles.todayTxt}>Today</Txt>
        </Press>
        <Press
          onPress={() => actions.step(1)}
          hoverBg={w(0.1)}
          style={styles.navIcon}
          accessibilityRole="button"
          aria-label="Next period">
          <Icon name="arrow-right" size={16} color={w(0.6)} />
        </Press>
      </View>

      {/* The old toolbar spent a full sentence on "N clashes to resolve". A
          pill that opens the first one is the same information and an action. */}
      {clashes > 0 && (
        <Press
          onPress={() => actions.setView('day')}
          hoverBg="rgba(255,68,0,0.18)"
          style={styles.clashPill}
          accessibilityRole="button">
          <Icon name="triangle" size={13} color={C.orange} />
          <Txt style={styles.clashTxt}>
            {clashes} clash{clashes > 1 ? 'es' : ''}
          </Txt>
        </Press>
      )}

      <View style={styles.spacer} />

      <View style={styles.group} accessibilityRole="tablist" aria-label="Calendar view">
        {VIEWS.map((v) => {
          const on = state.view === v.key;
          return (
            <Press
              key={v.key}
              onPress={() => actions.setView(v.key)}
              hoverBg={on ? undefined : w(0.1)}
              accessibilityRole="tab"
              aria-selected={on}
              style={[styles.tab, on && styles.tabOn]}>
              <Txt style={[styles.tabTxt, on && styles.tabTxtOn]}>{isPhone ? v.short : v.label}</Txt>
            </Press>
          );
        })}
      </View>

      {isDesktop && <Txt style={styles.sync}>{syncLabel}</Txt>}

      {!isPhone && (
        <Press
          onPress={() => actions.openCompose(null)}
          hoverBg={w(0.1)}
          style={styles.newBtn}
          accessibilityRole="button">
          <Icon name="add" size={16} color={w(0.7)} />
          <Txt style={styles.newTxt}>New</Txt>
        </Press>
      )}

      {!isPhone && (
        <Press
          onPress={() => actions.openAI()}
          hoverBg={C.limeHover}
          style={styles.findBtn}
          accessibilityRole="button">
          <Icon name="magic" size={15} color={C.surface} />
          <Txt style={styles.findTxt}>Find time</Txt>
        </Press>
      )}

      <Press
        ref={themeBtn}
        hoverBg={w(0.1)}
        style={styles.iconBtn}
        accessibilityRole="button"
        aria-label="Change background theme"
        onPress={() => themeBtn.current?.measureInWindow((x, y) => onOpenTheme({ x, y }))}>
        <Icon name="palette" size={16} color={w(0.55)} />
      </Press>

      {/* Desktop keeps the account control in the sidebar. */}
      {!isDesktop && <AccountButton />}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: w(0.1),
    paddingHorizontal: 14,
    paddingVertical: 10,
    zIndex: 40,
  },
  logo: {
    height: 30,
    width: 30,
    borderRadius: R.md,
    backgroundColor: C.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0, flexShrink: 1 },
  title: { color: '#fff', fontSize: 17, lineHeight: 24, fontWeight: '500', letterSpacing: -0.4 },
  titlePhone: { fontSize: 15 },
  spacer: { flexGrow: 1, flexBasis: 0 },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: w(0.1),
    backgroundColor: w(0.05),
    padding: 3,
  },
  navIcon: { height: 26, width: 26, alignItems: 'center', justifyContent: 'center', borderRadius: R.sm },
  today: { height: 26, borderRadius: R.sm, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  todayTxt: { color: w(0.8), fontSize: 11 },
  tab: { height: 26, borderRadius: R.sm, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  // White, not lime: lime is reserved for the two things that are genuinely
  // about the AI (a proposal, and a protected block), so it stays meaningful.
  tabOn: { backgroundColor: w(0.16) },
  tabTxt: { color: w(0.5), fontSize: 11 },
  tabTxtOn: { color: '#fff', fontWeight: '500' },
  clashPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: 'rgba(255,68,0,0.4)',
    backgroundColor: 'rgba(255,68,0,0.1)',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  clashTxt: { color: C.orange, fontSize: 11 },
  sync: { color: w(0.3), fontSize: 11 },
  newBtn: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: w(0.1),
    backgroundColor: w(0.05),
    paddingHorizontal: 10,
  },
  newTxt: { color: w(0.7), fontSize: 11 },
  findBtn: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: R.md,
    backgroundColor: C.lime,
    paddingHorizontal: 12,
  },
  findTxt: { color: C.surface, fontSize: 11, fontWeight: '500' },
  iconBtn: {
    height: 32,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: w(0.1),
    backgroundColor: w(0.05),
  },
});
