import { StyleSheet, View } from 'react-native';

import { Icon } from '../Icon';
import type { CalActions, CalState, ViewKind } from '../state';
import { C, R, T, w } from '../tokens';
import { Press, Txt } from '../ui';
import { useResponsive } from '../useResponsive';

const VIEWS: { key: ViewKind; label: string }[] = [
  { key: 'month', label: 'Month' },
  { key: 'week', label: 'Week' },
  { key: 'day', label: 'Day' },
];

export function Toolbar({
  state,
  actions,
  eyebrow,
  title,
  sub,
}: {
  state: CalState;
  actions: CalActions;
  eyebrow: string;
  title: string;
  sub: string;
}) {
  const { isDesktop, isPhone, isWide } = useResponsive();

  return (
    <View style={[styles.wrap, isWide && styles.wrapRow]}>
      <View style={styles.headBlock}>
        <View style={styles.eyebrowRow}>
          <View style={styles.eyebrowDot} />
          <Txt style={styles.eyebrow}>{eyebrow}</Txt>
        </View>
        <Press
          disabled={isDesktop}
          onPress={actions.openPicker}
          style={styles.titleBtn}
          accessibilityRole="button">
          <Txt style={[styles.title, isPhone ? T.xl2 : T.xl3]}>{title}</Txt>
          {!isDesktop && <Icon name="arrow-down" size={18} color={w(0.4)} />}
        </Press>
        <Txt style={styles.sub}>{sub}</Txt>
      </View>

      <View style={styles.controls}>
        <View style={styles.group}>
          <Press
            onPress={() => actions.step(-1)}
            hoverBg={w(0.1)}
            style={styles.navIcon}
            accessibilityRole="button"
            aria-label="Previous period">
            <Icon name="arrow-left" size={18} color={w(0.6)} />
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
            <Icon name="arrow-right" size={18} color={w(0.6)} />
          </Press>
        </View>

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
                <Txt style={[styles.tabTxt, on && styles.tabTxtOn]}>{v.label}</Txt>
              </Press>
            );
          })}
        </View>

        {!isPhone && (
          <Press
            onPress={() => actions.openCompose(null)}
            hoverBg={w(0.1)}
            style={styles.newBtn}
            accessibilityRole="button">
            <Icon name="add" size={18} color={w(0.7)} />
            <Txt style={styles.newTxt}>New event</Txt>
          </Press>
        )}

        <Press onPress={() => actions.openAI()} hoverBg={C.limeHover} style={styles.findBtn} accessibilityRole="button">
          <Icon name="magic" size={16} color={C.surface} />
          <Txt style={styles.findTxt}>Find time</Txt>
        </Press>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 20, gap: 16 },
  wrapRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  headBlock: { flexShrink: 1, minWidth: 0 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  eyebrowDot: {
    height: 6,
    width: 6,
    borderRadius: 3,
    backgroundColor: C.lime,
    shadowColor: C.lime,
    shadowOpacity: 0.9,
    shadowRadius: 12,
  },
  eyebrow: { color: C.lime, fontSize: 12, textTransform: 'uppercase', letterSpacing: 2.56 },
  titleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: '#fff', fontWeight: '500', letterSpacing: -0.6 },
  sub: { marginTop: 8, color: w(0.55), fontSize: 14, lineHeight: 20, maxWidth: 560 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: w(0.1),
    backgroundColor: w(0.05),
    padding: 4,
  },
  navIcon: { height: 32, width: 32, alignItems: 'center', justifyContent: 'center', borderRadius: R.md },
  today: { height: 32, borderRadius: R.md, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  todayTxt: { color: '#fff', fontSize: 12 },
  tab: { height: 32, borderRadius: R.md, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  tabOn: {
    backgroundColor: C.lime,
    shadowColor: C.lime,
    shadowOpacity: 0.35,
    shadowRadius: 16,
  },
  tabTxt: { color: w(0.55), fontSize: 12 },
  tabTxtOn: { color: C.surface, fontWeight: '500' },
  newBtn: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: w(0.1),
    backgroundColor: w(0.05),
    paddingHorizontal: 12,
  },
  newTxt: { color: w(0.7), fontSize: 12 },
  findBtn: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: R.lg,
    backgroundColor: C.lime,
    paddingHorizontal: 16,
    shadowColor: C.lime,
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  findTxt: { color: C.surface, fontSize: 12, fontWeight: '500' },
});
