import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useCalTheme } from '../theme-context';

/**
 * The ground the panels sit on: the theme colour and one soft gradient.
 *
 * It used to also carry a 20px dot grid, a 45° hatch pattern, an inset frame
 * border, a full-width crosshair and four lime corner brackets — five SVG
 * pattern fills and six absolutely-positioned views of pure decoration,
 * repainted behind the whole app. With the grid now filling the viewport
 * almost none of it was ever visible, and where it was, it competed with the
 * calendar for attention. The ground's only job here is to recede.
 */
export function Frame() {
  const { theme } = useCalTheme();
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
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#ftGrad)" />
      </Svg>
    </View>
  );
}
