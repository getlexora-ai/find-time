import { StyleSheet, View } from 'react-native';

import { Logo } from '@/design/Logo';

import { useAccounts } from '../account-store';
import { Icon } from '../Icon';
import type { CalActions, CalState, ViewKind } from '../state';
import { N, R, SANS, SHADOW, T } from '../tokens';
import { Button, Mono, Press, Txt } from '../ui';
import { useResponsive } from '../useResponsive';
import { AccountButton } from './AccountButton';

const VIEWS: { key: ViewKind; label: string }[] = [
  { key: 'week', label: 'Week' },
  { key: 'day', label: 'Day' },
];

/**
 * The header (B artboard): mark + name, Week | Day, the period in mono,
 * ‹ Today ›, New, and the one primary action — Plan with AI.
 * On a phone it is one row: mark, the period (opens the date picker), ‹ ›, account.
 */
export function CommandBar({
  state,
  actions,
  range,
}: {
  state: CalState;
  actions: CalActions;
  /** "21 – 27 SEP 2026" */
  range: string;
}) {
  const { isDesktop, isPhone } = useResponsive();
  const { accounts, syncing } = useAccounts();
  const failed = accounts.some((a) => a.syncStatus === 'error');

  return (
    <View style={[styles.bar, isPhone && styles.barPhone]}>
      <View style={styles.brand}>
        <View style={[styles.mark, SHADOW.sm]}>
          <Logo size={16} color={N.onInk} />
        </View>
        {!isPhone && <Txt style={styles.name}>Find Time</Txt>}
      </View>

      {isDesktop && (
        <View style={styles.tabs} accessibilityRole="tablist" aria-label="Calendar view">
          {VIEWS.map((v) => {
            const on = state.view === v.key;
            return (
              <Press
                key={v.key}
                onPress={() => actions.setView(v.key)}
                hoverBg={on ? undefined : N.hover}
                accessibilityRole="tab"
                aria-selected={on}
                style={[styles.tab, on && [styles.tabOn, SHADOW.sm]]}>
                <Txt style={[styles.tabTxt, on && styles.tabTxtOn]}>{v.label}</Txt>
              </Press>
            );
          })}
        </View>
      )}

      <View style={styles.spacer} />

      <Press
        onPress={actions.openPicker}
        disabled={isDesktop}
        accessibilityRole="button"
        aria-label={`Showing ${range}. Pick a date`}
        style={styles.range}>
        <Mono style={styles.rangeTxt} numberOfLines={1}>
          {range}
        </Mono>
        {!isDesktop && <Icon name="arrow-down" size={12} color={N.muted} />}
      </Press>
      {(syncing || failed) && isDesktop && (
        <Mono style={[styles.sync, failed && styles.syncErr]}>{failed ? 'SYNC FAILED' : 'SYNCING…'}</Mono>
      )}

      <Button
        variant="secondary"
        onPress={() => actions.step(-1)}
        accessibilityLabel={state.view === 'week' ? 'Previous week' : 'Previous day'}
        icon={<Icon name="arrow-left" size={14} color={N.ink2} />}
        style={styles.navBtn}
      />
      {!isPhone && <Button variant="secondary" label="Today" onPress={actions.goToday} style={styles.today} />}
      <Button
        variant="secondary"
        onPress={() => actions.step(1)}
        accessibilityLabel={state.view === 'week' ? 'Next week' : 'Next day'}
        icon={<Icon name="arrow-right" size={14} color={N.ink2} />}
        style={styles.navBtn}
      />

      {isDesktop && (
        <>
          <Button
            variant="secondary"
            label="New"
            onPress={() => actions.openCompose(null)}
            icon={<Icon name="add" size={14} color={N.ink2} />}
          />
          <Button variant="primary" label="Plan with AI" onPress={() => actions.openAI()} />
        </>
      )}
      {!isDesktop && <AccountButton />}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: N.line,
  },
  barPhone: { height: 56, paddingHorizontal: 12, gap: 6 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 16 },
  mark: { width: 30, height: 30, borderRadius: R.sm, backgroundColor: N.ink, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: SANS, ...T.title, color: N.ink },
  tabs: { flexDirection: 'row', gap: 4 },
  tab: { height: 30, paddingHorizontal: 12, borderRadius: R.md, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: N.surface },
  tabTxt: { fontFamily: SANS, ...T.body, color: N.muted },
  tabTxtOn: { color: N.ink },
  spacer: { flex: 1 },
  range: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 4, minWidth: 0, flexShrink: 1 },
  rangeTxt: { fontSize: 11, color: N.muted },
  sync: { fontSize: 10, color: N.faint, marginRight: 4 },
  syncErr: { color: N.accentInk },
  navBtn: { width: 32, height: 32 },
  today: { height: 32 },
});
