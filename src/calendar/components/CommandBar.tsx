import { type GestureResponderEvent, StyleSheet, View } from 'react-native';

import { Logo } from '@/design/Logo';

import { useAccounts } from '../account-store';
import { Icon } from '../Icon';
import type { CalActions, CalState, Page, PointAnchor, ViewKind } from '../state';
import { N, R, SANS, SHADOW, T } from '../tokens';
import { Button, Press, Txt } from '../ui';
import { useResponsive } from '../useResponsive';
import { AccountButton } from './AccountButton';

/**
 * A point just under the pressed heading, for the date picker. Popover places
 * its card at (x + 12, y - 12), so this lands it flush left, 8px below. On web
 * the heading's own box is used; press coordinates are not reliable there.
 */
function underTarget(e: GestureResponderEvent, alignRight?: number) {
  const el = e.currentTarget as unknown as { getBoundingClientRect?: () => DOMRect };
  if (typeof el?.getBoundingClientRect === 'function') {
    const r = el.getBoundingClientRect();
    // Right-aligned: the card's right edge on the button's (alignRight = card width).
    return { x: alignRight ? r.right - alignRight - 12 : r.left - 12, y: r.bottom + 20 };
  }
  const { pageX, pageY } = e.nativeEvent;
  return { x: alignRight ? pageX - alignRight : pageX - 24, y: pageY + 36 };
}

const PAGES: { key: Page; label: string }[] = [
  { key: 'planner', label: 'Planner' },
  { key: 'insights', label: 'Insights' },
];

const VIEWS: { key: ViewKind; label: string }[] = [
  { key: 'week', label: 'Week' },
  { key: 'day', label: 'Day' },
];

/**
 * Two rows, each with one job (quiet calendar, 2026-10-01).
 *
 *   app bar   mark · Planner | Insights ·········· Plan with AI · account
 *   toolbar   October 2026 ‹ › Today ············· Week | Day · New · Show
 *
 * The numbers live on Insights, not over the grid. On a phone it is one row:
 * mark, the period (opens the date picker), ‹ ›, Show, account.
 */
export function CommandBar({
  state,
  actions,
  page,
  onPage,
  title,
  needsYou,
  onShow,
  part,
  aiOpen,
}: {
  state: CalState;
  actions: CalActions;
  page: Page;
  onPage: (p: Page) => void;
  /** "October 2026", "Sep – Oct 2026", "Thursday 1 October" */
  title: string;
  /** clashes + proposals waiting — the dot on Insights */
  needsYou: number;
  onShow: (anchor?: PointAnchor) => void;
  /** desktop: draw only the app bar or only the toolbar (the AI panel docks beside the toolbar) */
  part?: 'app' | 'tools';
  aiOpen?: boolean;
}) {
  const { isDesktop } = useResponsive();
  const { accounts, syncing } = useAccounts();
  const failed = accounts.some((a) => a.syncStatus === 'error');
  const prevLabel = state.view === 'week' ? 'Previous week' : 'Previous day';
  const nextLabel = state.view === 'week' ? 'Next week' : 'Next day';

  if (!isDesktop) {
    return (
      <View style={[styles.bar, styles.barPhone]}>
        <View style={[styles.mark, SHADOW.sm]}>
          <Logo size={16} color={N.onInk} />
        </View>
        <Press
          onPress={(e) => actions.openPicker(underTarget(e))}
          accessibilityRole="button"
          aria-label={`Showing ${title}. Pick a date`}
          style={styles.periodBtn}>
          <Txt style={[styles.period, styles.periodPhone]} numberOfLines={1}>
            {page === 'insights' ? 'Insights' : title}
          </Txt>
          <Icon name="arrow-down" size={12} color={N.muted} />
        </Press>
        <View style={styles.spacer} />
        <Button variant="ghost" onPress={() => actions.step(-1)} accessibilityLabel={prevLabel} icon={<Icon name="arrow-left" size={16} color={N.ink2} />} style={styles.navBtn} />
        <Button variant="ghost" onPress={() => actions.step(1)} accessibilityLabel={nextLabel} icon={<Icon name="arrow-right" size={16} color={N.ink2} />} style={styles.navBtn} />
        <Button variant="ghost" onPress={onShow} accessibilityLabel="Show and hours" icon={<Icon name="eye" size={16} color={N.ink2} />} style={styles.navBtn} />
        <AccountButton />
      </View>
    );
  }

  const appBar = (
      <View style={styles.bar}>
        <View style={styles.brand}>
          <View style={[styles.mark, SHADOW.sm]}>
            <Logo size={16} color={N.onInk} />
          </View>
          <Txt style={styles.name}>Find Time</Txt>
        </View>

        <View style={styles.pages} accessibilityRole="tablist" aria-label="Section">
          {PAGES.map((p) => {
            const on = page === p.key;
            return (
              <Press
                key={p.key}
                onPress={() => onPage(p.key)}
                hoverBg={on ? undefined : N.hover}
                accessibilityRole="tab"
                aria-selected={on}
                style={[styles.page, on && styles.pageOn]}>
                <Txt style={[styles.pageTxt, on && styles.pageTxtOn]}>{p.label}</Txt>
                {p.key === 'insights' && needsYou > 0 && (
                  <View style={styles.badge} aria-label={`${needsYou} need you`}>
                    <Txt style={styles.badgeTxt}>{needsYou}</Txt>
                  </View>
                )}
              </Press>
            );
          })}
        </View>

        <View style={styles.spacer} />
        {(syncing || failed) && (
          <Txt style={[styles.sync, failed && styles.syncErr]}>{failed ? 'Sync failed' : 'Syncing…'}</Txt>
        )}
        <Button
          variant={aiOpen ? 'secondary' : 'primary'}
          label="Plan with AI"
          onPress={() => (aiOpen ? actions.closeAI() : actions.openAI())}
          icon={<Icon name="magic" size={14} color={aiOpen ? N.ink : N.onInk} />}
        />
        <AccountButton />
      </View>
  );

  const toolbar = (
      <View style={[styles.bar, styles.toolbar]}>
        <Press onPress={(e) => actions.openPicker(underTarget(e))} hoverBg={N.hover} accessibilityRole="button" aria-label={`Showing ${title}. Pick a date`} style={styles.periodBtn}>
          <Txt style={styles.period} numberOfLines={1}>
            {title}
          </Txt>
          <Icon name="arrow-down" size={14} color={N.muted} />
        </Press>
        <View style={styles.navGroup}>
          <Button variant="ghost" onPress={() => actions.step(-1)} accessibilityLabel={prevLabel} icon={<Icon name="arrow-left" size={16} color={N.ink2} />} style={styles.navBtn} />
          <Button variant="ghost" onPress={() => actions.step(1)} accessibilityLabel={nextLabel} icon={<Icon name="arrow-right" size={16} color={N.ink2} />} style={styles.navBtn} />
          <Button variant="secondary" label="Today" onPress={actions.goToday} style={styles.today} />
        </View>

        <View style={styles.spacer} />

        {/* Week | Day scopes Insights too, so it stays on both pages. */}
        <View style={styles.seg} accessibilityRole="tablist" aria-label="Calendar view">
          {VIEWS.map((v) => {
            const on = state.view === v.key;
            return (
              <Press
                key={v.key}
                onPress={() => actions.setView(v.key)}
                accessibilityRole="tab"
                aria-selected={on}
                style={[styles.segItem, on && [styles.segOn, SHADOW.sm]]}>
                <Txt style={[styles.segTxt, on && styles.segTxtOn]}>{v.label}</Txt>
              </Press>
            );
          })}
        </View>
        {page === 'planner' && (
          <>
            <Button
              variant="secondary"
              label="New"
              onPress={() => actions.openCompose(null)}
              icon={<Icon name="add" size={14} color={N.ink2} />}
            />
            <Press
              onPress={(e) => onShow(underTarget(e, 340))}
              hoverBg={N.hover}
              accessibilityRole="button"
              aria-label="Show, hours and calendars"
              style={styles.navBtn}>
              <Icon name="eye" size={16} color={N.ink2} />
            </Press>
          </>
        )}
      </View>
  );

  if (part === 'app') return appBar;
  if (part === 'tools') return toolbar;
  return (
    <View>
      {appBar}
      {toolbar}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: N.line,
    backgroundColor: N.surface,
  },
  barPhone: { paddingHorizontal: 12, gap: 4 },
  toolbar: { height: 60, borderBottomWidth: 0, gap: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 20 },
  mark: { width: 28, height: 28, borderRadius: R.sm, backgroundColor: N.ink, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: SANS, ...T.title, color: N.ink },

  pages: { flexDirection: 'row', gap: 2 },
  page: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: R.lg },
  pageOn: { backgroundColor: N.sunken },
  pageTxt: { fontFamily: SANS, fontSize: 14, lineHeight: 20, fontWeight: '500', color: N.muted },
  pageTxtOn: { color: N.ink },
  badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: N.ink, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { fontFamily: SANS, fontSize: 11, lineHeight: 14, fontWeight: '600', color: N.onInk },

  spacer: { flex: 1 },
  periodBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6, height: 36, borderRadius: R.md, minWidth: 0, flexShrink: 1 },
  period: { fontFamily: SANS, ...T.period, color: N.ink },
  periodPhone: { fontSize: 17, lineHeight: 22 },
  navGroup: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  navBtn: { width: 34, height: 34 },
  today: { height: 32, marginLeft: 6 },

  seg: { flexDirection: 'row', padding: 3, gap: 2, borderRadius: R.lg, backgroundColor: N.sunken },
  segItem: { height: 28, paddingHorizontal: 14, borderRadius: R.md, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: N.surface },
  segTxt: { fontFamily: SANS, ...T.body, color: N.muted },
  segTxtOn: { color: N.ink },

  sync: { fontFamily: SANS, fontSize: 12, color: N.faint, marginRight: 4 },
  syncErr: { color: N.accentInk },
});
