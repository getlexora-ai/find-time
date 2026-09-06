import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { DEFAULT_THEME, STORAGE_KEY, THEME_BY_KEY, type Theme, type ThemeKey } from './themes';

type Ctx = { theme: Theme; themeKey: ThemeKey; setTheme: (k: ThemeKey) => void };

const ThemeCtx = createContext<Ctx>({
  theme: THEME_BY_KEY[DEFAULT_THEME],
  themeKey: DEFAULT_THEME,
  setTheme: () => {},
});

/** Background-theme provider. Persists the choice to AsyncStorage under the same
 *  key the web prototype uses (`ft-theme`), so a build sharing storage stays in
 *  sync (HANDOFF.md C1 "persists (AsyncStorage, mirroring ft-theme)"). */
export function CalendarThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeKey, setKey] = useState<ThemeKey>(DEFAULT_THEME);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (alive && v && v in THEME_BY_KEY) setKey(v as ThemeKey);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const setTheme = useCallback((k: ThemeKey) => {
    setKey(k);
    AsyncStorage.setItem(STORAGE_KEY, k).catch(() => {});
  }, []);

  const value = useMemo<Ctx>(
    () => ({ theme: THEME_BY_KEY[themeKey], themeKey, setTheme }),
    [themeKey, setTheme],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useCalTheme = () => useContext(ThemeCtx);
