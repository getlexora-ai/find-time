import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Line as SvgLine, Pattern, Rect, Circle, LinearGradient, Stop } from 'react-native-svg';

import { useCalTheme } from '../theme-context';
import { useResponsive } from '../useResponsive';
import { C } from '../tokens';

/**
 * The canvas the near-black panels float on (spec §4):
 *   blue ground + 135° depth gradient · 20px dot grid · 45° hatch overlay ·
 *   fixed inset frame border · faint crosshair · four lime corner brackets.
 * Only the ground moves with the background theme.
 */
export function Frame() {
  const { theme } = useCalTheme();
  const { isPhone, isTablet } = useResponsive();
  const inset = isPhone ? 12 : isTablet ? 20 : 28;
  const angleRad = (theme.gradAngle * Math.PI) / 180;
  // express the CSS gradient angle as x2/y2 on a unit square
  const x2 = 0.5 + Math.cos(angleRad - Math.PI / 2) * 0.5;
  const y2 = 0.5 + Math.sin(angleRad - Math.PI / 2) * 0.5;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.ground }]} pointerEvents="none">
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="ftGrad" x1={0.5 - (x2 - 0.5)} y1={1 - (0.5 + (y2 - 0.5))} x2={x2} y2={y2}>
            <Stop offset="0" stopColor={theme.gradTop} />
            <Stop offset="1" stopColor={theme.gradBottom} />
          </LinearGradient>
          <Pattern id="ftDots" width={20} height={20} patternUnits="userSpaceOnUse">
            <Circle cx={1} cy={1} r={1} fill={theme.dot} />
          </Pattern>
          <Pattern id="ftHatch" width={9} height={9} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <SvgLine x1={0} y1={0} x2={0} y2={9} stroke="rgba(255,255,255,0.025)" strokeWidth={1} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#ftGrad)" />
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#ftDots)" />
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#ftHatch)" opacity={0.7} />
      </Svg>

      {/* inset frame + crosshair + brackets */}
      <View style={[styles.frame, { left: inset, right: inset, top: inset, bottom: inset }]}>
        <View style={styles.vCross} />
        <View style={styles.hCross} />
        <View style={[styles.bracket, styles.tl]} />
        <View style={[styles.bracket, styles.tr]} />
        <View style={[styles.bracket, styles.bl]} />
        <View style={[styles.bracket, styles.br]} />
      </View>
    </View>
  );
}

const B = 2;
const styles = StyleSheet.create({
  frame: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  vCross: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.05)' },
  hCross: { position: 'absolute', top: '50%', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.05)' },
  bracket: { position: 'absolute', width: 20, height: 20, borderColor: C.lime },
  tl: { left: 0, top: 0, borderLeftWidth: B, borderTopWidth: B },
  tr: { right: 0, top: 0, borderRightWidth: B, borderTopWidth: B },
  bl: { left: 0, bottom: 0, borderLeftWidth: B, borderBottomWidth: B },
  br: { right: 0, bottom: 0, borderRightWidth: B, borderBottomWidth: B },
});
