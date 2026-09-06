import { DarkTheme, DefaultTheme, ThemeProvider, Tabs } from 'expo-router';
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
          tabBarActiveTintColor: colors.text,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarStyle: {
            backgroundColor: colors.background,
            borderTopColor: colors.backgroundElement,
          },
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Calendar',
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
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
