import { DarkTheme, DefaultTheme, Tabs, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, type ColorValue } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

function TabIcon({ emoji, color }: { emoji: string; color: ColorValue }) {
  return <Text style={{ fontSize: 20, color }}>{emoji}</Text>;
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = Colors[isDark ? 'dark' : 'light'];

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: { color: colors.text },
          headerShadowVisible: false,
          sceneStyle: { backgroundColor: colors.background },
          // Bottom nav styled to the Find time chrome (calendar-design-spec.md §1.1).
          tabBarActiveTintColor: '#ccff00',
          tabBarInactiveTintColor: 'rgba(255,255,255,0.45)',
          tabBarStyle: {
            backgroundColor: '#142d99',
            borderTopColor: 'rgba(255,255,255,0.10)',
          },
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Calendar',
            // the calendar screen renders its own sticky header + chrome
            headerShown: false,
            tabBarIcon: ({ color }) => <TabIcon emoji="📅" color={color} />,
          }}
        />
        <Tabs.Screen
          name="plan"
          options={{
            title: 'Plan with AI',
            tabBarIcon: ({ color }) => <TabIcon emoji="✨" color={color} />,
          }}
        />
      </Tabs>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
