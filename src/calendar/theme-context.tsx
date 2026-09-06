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
 *  sync (HANDOFF.md C1 "persists (AsyncStorage, mirroring ft-theme)").
 *
 *  `forceTheme` pins the ground and opts out of persistence entirely — no read,
 *  no write. The landing page is always the `electric` blue of landing.html and
 *  must never inherit (or clobber) the ground the user picked in the calendar. */
export function CalendarThemeProvider({
  children,
  forceTheme,
}: {
  children: React.ReactNode;
  forceTheme?: ThemeKey;
}) {
  const [storedKey, setKey] = useState<ThemeKey>(DEFAULT_THEME);
  const themeKey = forceTheme ?? storedKey;

  useEffect(() => {
    if (forceTheme) return;
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (alive && v && v in THEME_BY_KEY) setKey(v as ThemeKey);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [forceTheme]);

  const setTheme = useCallback(
    (k: ThemeKey) => {
      if (forceTheme) return;
      setKey(k);
      AsyncStorage.setItem(STORAGE_KEY, k).catch(() => {});
    },
    [forceTheme],
  );

  const value = useMemo<Ctx>(
    () => ({ theme: THEME_BY_KEY[themeKey], themeKey, setTheme }),
    [themeKey, setTheme],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useCalTheme = () => useContext(ThemeCtx);
