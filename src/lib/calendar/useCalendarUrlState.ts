"use client";

/**
 * Syncs the calendar's anchor date to a `?date=` URL query param so the view
 * is shareable/bookmarkable, alongside the `view` (day/week/month) which is
 * already the dynamic route segment.
 *
 * NOTE: PLAN.md calls for `nuqs`. nuqs v2 requires wrapping the tree in a
 * `NuqsAdapter` at the root layout (`src/app/layout.tsx`), which is a shared
 * file outside this task's edit scope (other agents own the app shell/root
 * layout concurrently). Rather than touch a file I was told not to edit,
 * this hook reaches the same end state — a shareable, query-string-backed
 * date — with plain `next/navigation`, which needs no provider wiring.
 */
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";

const DATE_FORMAT = "yyyy-MM-dd";

export function useCalendarUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const dateParam = searchParams.get("date");
  const date = React.useMemo(() => {
    if (dateParam) {
      try {
        const parsed = parseISO(dateParam);
        if (!Number.isNaN(parsed.getTime())) return parsed;
      } catch {
        // fall through to today
      }
    }
    return new Date();
  }, [dateParam]);

  const setDate = React.useCallback(
    (next: Date) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("date", format(next, DATE_FORMAT));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { date, setDate };
}
