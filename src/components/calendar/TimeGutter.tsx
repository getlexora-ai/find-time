import { HOURS } from "@/lib/calendar/constants";
import { formatHourLabel } from "@/lib/calendar/time";

/**
 * Hour-label column. Row height matches HourGrid exactly via the same
 * hourHeight prop — labels sit centered on the hour line, offset by half a
 * line-height so "09:00" aligns with the 09:00 hairline in HourGrid.
 */
export function TimeGutter({ hourHeight }: { hourHeight: number }) {
  return (
    <div className="relative w-14 shrink-0" style={{ height: 24 * hourHeight }}>
      {HOURS.map((hour) => (
        <div
          key={hour}
          className="absolute right-2 -translate-y-1/2 font-mono text-micro text-white/35"
          style={{ top: hour * hourHeight }}
        >
          {hour === 0 ? "" : formatHourLabel(hour)}
        </div>
      ))}
    </div>
  );
}
