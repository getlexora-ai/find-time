import { HOURS, CSS_HOUR_HEIGHT_VAR } from "@/lib/calendar/constants";

/**
 * Absolutely-positioned hairline rows: solid white/10 on the hour, dotted
 * white/5 on the half-hour. Sized off the `--ft-hour-height` CSS var (set by
 * the parent) so a later density setting only needs to change one value.
 * Pure background — events render in a sibling layer on top of this.
 */
export function HourGrid({ hourHeight }: { hourHeight: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ height: `calc(var(${CSS_HOUR_HEIGHT_VAR}) * 24)` }}
      aria-hidden
    >
      {HOURS.map((hour) => (
        <div
          key={`h-${hour}`}
          className="absolute inset-x-0 border-t border-white/10"
          style={{ top: `calc(var(${CSS_HOUR_HEIGHT_VAR}) * ${hour})` }}
        />
      ))}
      {HOURS.map((hour) => (
        <div
          key={`hh-${hour}`}
          className="absolute inset-x-0 border-t border-dotted border-white/5"
          style={{ top: `calc(var(${CSS_HOUR_HEIGHT_VAR}) * ${hour} + ${hourHeight / 2}px)` }}
        />
      ))}
    </div>
  );
}
