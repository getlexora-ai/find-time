import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { useCalTheme } from '../theme-context';
import { CHROME_BLUR, MONO } from '../ui';

const COPY =
  'Calendar synced  //  03 focus blocks protected this week  //  06h 40m free on thursday  //  AI scheduler online  //';

/** Telemetry ticker. translateX at ~-0.35px/frame, resets at half the scroll
 *  width (calendar.html `animateMarquee`). Keeps moving under reduced-motion by
 *  design (spec §5). `copy` overrides the calendar string for the landing page. */
export function Marquee({ copy = COPY }: { copy?: string }) {
  const { theme } = useCalTheme();
  const [x] = useState(() => new Animated.Value(0));
  const [spanW, setSpanW] = useState(0);

  useEffect(() => {
    if (!spanW) return;
    const duration = (spanW / 0.35) * (1000 / 60);
    x.setValue(0);
    const anim = Animated.loop(
      Animated.timing(x, {
        toValue: -spanW,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [spanW, x]);

  return (
    <View style={[styles.bar, CHROME_BLUR, { backgroundColor: theme.chrome }]}>
      <Animated.View style={[styles.track, { transform: [{ translateX: x }] }]}>
        <View onLayout={(e) => setSpanW(e.nativeEvent.layout.width)}>
          <Span copy={copy} />
        </View>
        <Span copy={copy} />
      </Animated.View>
    </View>
  );
}

function Span({ copy }: { copy: string }) {
  return (
    <Animated.Text numberOfLines={1} style={styles.span}>
      {copy + '   '}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  bar: {
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.10)',
    paddingVertical: 8,
    zIndex: 50,
  },
  track: { flexDirection: 'row', width: 100000 },
  span: {
    fontFamily: MONO,
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(204,255,0,0.8)',
    textTransform: 'uppercase',
    letterSpacing: 2.88,
  },
});
