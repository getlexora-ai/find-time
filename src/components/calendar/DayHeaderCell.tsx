import { isToday } from "date-fns";
import { cn } from "@/lib/utils/cn";
import { formatDateNum, formatDayHeading } from "@/lib/calendar/time";

export function DayHeaderCell({ date, onClick }: { date: Date; onClick?: () => void }) {
  const today = isToday(date);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 flex-col items-center gap-1 py-2 font-mono"
    >
      <span className="text-micro uppercase tracking-widest text-white/40">{formatDayHeading(date)}</span>
      <span
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full text-sm",
          today ? "bg-lime font-semibold text-ink" : "text-white/80",
        )}
      >
        {formatDateNum(date)}
      </span>
    </button>
  );
}
