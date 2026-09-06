import { ScrollView, StyleSheet, View } from 'react-native';

import { Frame } from '@/calendar/components/Frame';
import { Marquee } from '@/calendar/components/Marquee';
import { ToastProvider } from '@/calendar/components/Toast';
import { CalendarThemeProvider } from '@/calendar/theme-context';
import { Txt } from '@/design/ui';

/** M0 spike shell — replaced by the real section tree in M1. */
export function LandingScreen() {
  return (
    <CalendarThemeProvider forceTheme="electric">
      <ToastProvider>
        <View style={styles.root}>
          <Frame />
          <Marquee />
          <ScrollView>
            <Txt style={{ padding: 40, fontSize: 24 }}>FIND TIME FOR WHAT MATTERS.</Txt>
          </ScrollView>
        </View>
      </ToastProvider>
    </CalendarThemeProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
