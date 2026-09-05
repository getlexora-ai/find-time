"use client";

import * as React from "react";
import { Switch, Field, Select } from "@/components/ui/Field";

interface AppearancePrefs {
  density: "comfortable" | "compact";
  grain: boolean;
  marquee: boolean;
  reducedMotion: boolean;
  weekStartsOn: "mon" | "sun";
  clock: "24h" | "12h";
}

const DEFAULTS: AppearancePrefs = {
  density: "comfortable",
  grain: true,
  marquee: true,
  reducedMotion: false,
  weekStartsOn: "mon",
  clock: "24h",
};

const STORAGE_KEY = "ft-appearance-prefs";

export function AppearanceSettingsTab() {
  const [prefs, setPrefs] = React.useState<AppearancePrefs>(DEFAULTS);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setPrefs({ ...DEFAULTS, ...JSON.parse(stored) });
    } catch {
      // localStorage unavailable — keep defaults
    }
  }, []);

  function patch(next: Partial<AppearancePrefs>) {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // localStorage unavailable — setting just won't persist
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Field label="Density" description="Compact reduces row height in lists and the calendar grid">
        <Select value={prefs.density} onChange={(e) => patch({ density: e.target.value as AppearancePrefs["density"] })}>
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </Select>
      </Field>

      <label className="flex items-center justify-between rounded-control border border-white/10 bg-white/5 px-3 py-2.5">
        <span className="font-mono text-xs text-white/70">Grain overlay</span>
        <Switch checked={prefs.grain} onCheckedChange={(v) => patch({ grain: v })} />
      </label>
      <label className="flex items-center justify-between rounded-control border border-white/10 bg-white/5 px-3 py-2.5">
        <span className="font-mono text-xs text-white/70">Marquee ticker</span>
        <Switch checked={prefs.marquee} onCheckedChange={(v) => patch({ marquee: v })} />
      </label>
      <label className="flex items-center justify-between rounded-control border border-white/10 bg-white/5 px-3 py-2.5">
        <span className="font-mono text-xs text-white/70">Reduced motion</span>
        <Switch checked={prefs.reducedMotion} onCheckedChange={(v) => patch({ reducedMotion: v })} />
      </label>

      <Field label="Week starts on">
        <Select value={prefs.weekStartsOn} onChange={(e) => patch({ weekStartsOn: e.target.value as AppearancePrefs["weekStartsOn"] })}>
          <option value="mon">Monday</option>
          <option value="sun">Sunday</option>
        </Select>
      </Field>
      <Field label="Clock">
        <Select value={prefs.clock} onChange={(e) => patch({ clock: e.target.value as AppearancePrefs["clock"] })}>
          <option value="24h">24-hour</option>
          <option value="12h">12-hour</option>
        </Select>
      </Field>

      <p className="font-mono text-micro text-white/30">
        Appearance preferences are stored on this device only.
      </p>
    </div>
  );
}
