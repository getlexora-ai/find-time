# Lessons from FluidCalendar

Reviewed 2026-10-02: [dotnetfactory/fluid-calendar](https://github.com/dotnetfactory/fluid-calendar)
(MIT, "open-source Motion"), commit `b8f5dbe`. Read in full where it touches
planning: `src/services/scheduling/*`, the task API and store, recurrence,
Google / Outlook / CalDAV event sync, settings, focus mode and task-block push.

**Verdict:** a feature checklist, not code to port. Its scheduler is a greedy
7-day slot scorer with no placement tests. What it gets right is the *task
model*; what it gets wrong is a list of traps for §8 of
[planning-agent-plan.md](planning-agent-plan.md). Nothing here is copied code.

## Taken

| Idea | Where it lands for us |
| --- | --- |
| All-day events don't block hours | Done: `blocksTime` in `src/server/ai/find-time.ts`. Refined — an imported all-day event still marked busy (a holiday) does block. |
| Declined / "free" events aren't busy | Done, same function. FluidCalendar stores these flags and never reads them. |
| Task fields: due, priority, duration, lock | Done: `tasks` table + `src/server/tasks-repo.ts`, planned by `plan-week.ts`. "Not before" and postpone are not in the schema yet. |
| A pinned block stays put through re-planning | Done: a non-flexible task block is pinned. Pin-on-drag needs the calendar to mark dragged blocks fixed — not yet. |
| Re-plan everything unpinned | Done, *with* minimal moves: valid future sessions are kept, only broken ones move |
| "Next three" focus queue with postpone 1h / 3h / 1d / 1w | Later; a view over the plan, not the planner |
| Ignore echoes of our own pushed blocks when they sync back | Check when two-way push lands |

## Traps — each one becomes a `.check.mjs` case in the backlog phase

`src/server/ai/plan-week.check.mjs` now covers 1, 2, 5, 6, 7, 8, 9, 15 and 17
(numbers in brackets in the file); 10–14 are calendar-sync concerns and 3 does
not apply (we have one clock). 16 applies once blocks are pushed to Google.

Scoring

1. **Deadline score inverted.** `min(0.99, exp(-daysToDeadline/3))` rises toward
   the deadline and caps *after* it, with the heaviest weight (3.0). For a task
   due in 2 days the best slot is the deadline; a slot a day late (0.818) beats
   tomorrow (0.754). → Deadlines are hard limits; urgency must *fall* as slack grows.
2. **Due date = midnight UTC.** A date picker's `new Date("2026-10-09")` makes
   "due Friday" mean Thursday evening in New York; the due day itself reads as
   overdue. → A due *date* means end of that day in the user's zone.
3. **Preferences read the server clock.** Energy and morning/afternoon use
   `Date#getHours()` on the server, not the user's zone.
4. **Constant factors dilute the score.** Work-hour fit is always 1 after
   filtering; priority is the same for every slot of a task. → A factor that
   can't tell two slots apart doesn't belong in the slot score; priority orders
   *tasks*.
5. **Ordered by best score, not deadline.** Their own TODO: "did not schedule
   high priority tasks first". → Earliest deadline first, then priority, then slack.

Candidate slots

6. **Grid anchored to "now + 15 min", stepping by task length.** A 60-minute
   task scheduled at 14:10 can never start at 09:00 on later days. → Fixed
   15-minute grid from the window start (we already do this).
7. **Work-hour end compared by whole hour.** A block ending 17:59 passes a 17:00 end.
8. **Buffers only scored, never enforced.** Their own TODO admits it.
9. **7-day horizon, silent drop.** Anything that doesn't fit is left unscheduled
   with no message. → Horizon follows the deadline; every miss goes to `unplaced`
   with a reason.

What counts as busy

10. **No calendars selected by default** → a new user's meetings are ignored.
    → Every connected calendar blocks unless the user opts one out.
11. **Completed tasks keep blocking** their old slot.
12. **Postpone ignored by the scheduler** (focus mode only).
13. **Google sync window is 1 Jan to 1 Jan** → in late December the planner sees
    an empty next year and double-books. (Ours has no upper bound — keep it that way.)
14. **CalDAV recurrences expanded from RRULE alone** — EXDATE and moved
    occurrences ignored, expansion in UTC drifts an hour across DST. (Ours lets
    Google expand with `singleEvents` + `showDeleted`.)

Re-planning

15. **Every edit re-plans everything.** Renaming a task can reshuffle the week;
    the run clears all slots first with no transaction. → Minimise moves; re-plan
    only what the change affects; all-or-nothing writes.
16. **Moved blocks never re-pushed.** Re-planning doesn't mark pushed Google
    events dirty, so Google keeps stale times and ghosts of tasks that no longer fit.
17. **A pinned block that was missed stays in the past forever.** → A pin
    expires once its time has passed undone; the block returns to the backlog.
18. **Recurring tasks are a single copy** that rolls forward on completion, so
    "gym three times a week" can't be planned ahead. → Habits are their own entity (§8).

Process

19. **No tests of placement.** The only "autoSchedule" test checks a 12h/24h label.
20. **Design doc ticks off features that don't exist** (complexity assessment,
    duration estimation, per-day work hours, DST handling). → Check claims in code.
