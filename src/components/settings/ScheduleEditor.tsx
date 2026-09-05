"use client";

import { Field, Select, Switch } from "@/components/ui/Field";
import { RangeSlider } from "@/components/settings/RangeSlider";
import type { SchedulerProfile } from "@/lib/types";

type DayKey = keyof SchedulerProfile["workHours"];

const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2)
    .toString()
    .padStart(2, "0");
  const minute = i % 2 === 0 ? "00" : "30";
  return `${hour}:${minute}`;
});

const TIMEZONES = [
  "Europe/Berlin",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "UTC",
];

/**
 * Shared work-hours + timezone + buffer editor, bound to a SchedulerProfile.
 * Used by both `/onboarding/schedule` and `/app/settings/schedule` — same
 * data, same controls, per PLAN.md §3.7.
 */
export function ScheduleEditor({
  profile,
  onPatch,
}: {
  profile: SchedulerProfile;
  onPatch: (patch: Partial<SchedulerProfile>) => void;
}) {
  function setDayTime(day: DayKey, field: "start" | "end", value: string) {
    const current = profile.workHours[day] ?? { start: "09:00", end: "17:00" };
    onPatch({ workHours: { ...profile.workHours, [day]: { ...current, [field]: value } } });
  }

  function toggleDay(day: DayKey, working: boolean) {
    onPatch({
      workHours: { ...profile.workHours, [day]: working ? { start: "09:00", end: "17:00" } : null },
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-widest text-white/55">Working hours</p>
        <div className="flex flex-col gap-2">
          {DAYS.map(({ key, label }) => {
            const day = profile.workHours[key];
            return (
              <div
                key={key}
                className="flex flex-wrap items-center gap-3 rounded-control border border-white/10 bg-white/5 px-3 py-2.5"
              >
                <Switch checked={!!day} onCheckedChange={(v) => toggleDay(key, v)} />
                <span className="w-9 shrink-0 font-mono text-xs text-white/70">{label}</span>
                {day ? (
                  <div className="flex flex-1 items-center gap-2">
                    <Select
                      className="h-9"
                      value={day.start}
                      onChange={(e) => setDayTime(key, "start", e.target.value)}
                    >
                      {TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                    <span className="font-mono text-xs text-white/30">–</span>
                    <Select
                      className="h-9"
                      value={day.end}
                      onChange={(e) => setDayTime(key, "end", e.target.value)}
                    >
                      {TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : (
                  <span className="flex-1 font-mono text-xs text-white/30">Off</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Timezone">
          <Select value={profile.timezone} onChange={(e) => onPatch({ timezone: e.target.value })}>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </Field>
        <RangeSlider
          label="Buffer between events"
          min={0}
          max={60}
          step={5}
          value={profile.defaultBufferMin}
          onChange={(v) => onPatch({ defaultBufferMin: v })}
        />
      </div>
    </div>
  );
}
