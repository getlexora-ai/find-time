import { describe, expect, it } from "vitest";
import { schedule } from "../index";
import { buildEvent, buildItem, buildProfile, buildRequest, buildTask } from "./fixtures";

// All fixtures anchor to 2026-09-07 (a Monday) / 2026-09-08 (a Tuesday).
const MON_8AM = "2026-09-07T08:00:00.000";
const TUE_8AM = "2026-09-08T08:00:00.000";

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart).getTime() < new Date(bEnd).getTime() && new Date(aEnd).getTime() > new Date(bStart).getTime();
}

describe("schedule()", () => {
  it("places a simple task into free time within the horizon", () => {
    const profile = buildProfile();
    const item = buildItem({ refId: "a", title: "Write report", durationMin: 60 });
    const request = buildRequest([item]);

    const result = schedule([], profile, request, { now: MON_8AM, horizonStart: MON_8AM, horizonDays: 1 });

    expect(result.conflicts).toHaveLength(0);
    expect(result.plan.blocks).toHaveLength(1);
    const block = result.plan.blocks[0];
    expect(block.refId).toBe("a");
    const start = new Date(block.start);
    const end = new Date(block.end);
    expect(start.getHours()).toBeGreaterThanOrEqual(9);
    expect(end.getHours()).toBeLessThanOrEqual(17);
    expect((end.getTime() - start.getTime()) / 60_000).toBe(60);
  });

  it("never places a block outside declared work hours, skipping the weekend entirely", () => {
    // Tue–Fri give 4 workdays of 8h (480min) each before the weekend; a 5th 480min item
    // must land on the following Monday, not Saturday/Sunday even though those days are
    // chronologically available within the horizon.
    const profile = buildProfile();
    const items = [0, 1, 2, 3, 4].map((i) => buildItem({ refId: `day-${i}`, title: `Full day ${i}`, durationMin: 480 }));
    const request = buildRequest(items);

    const result = schedule([], profile, request, { now: TUE_8AM, horizonStart: TUE_8AM, horizonDays: 7 });

    expect(result.conflicts).toHaveLength(0);
    expect(result.plan.blocks).toHaveLength(5);
    for (const block of result.plan.blocks) {
      const start = new Date(block.start);
      const end = new Date(block.end);
      expect(start.getDay()).not.toBe(0); // Sunday
      expect(start.getDay()).not.toBe(6); // Saturday
      expect(start.getHours()).toBeGreaterThanOrEqual(9);
      expect(end.getHours()).toBeLessThanOrEqual(17);
    }
  });

  it("treats an existing protected/fixed calendar event as a hard block it will not overlap", () => {
    const profile = buildProfile();
    const protectedEvent = buildEvent({
      title: "All-day workshop",
      start: "2026-09-08T09:00:00.000",
      end: "2026-09-08T17:00:00.000",
      flexibility: "protected",
      status: "confirmed",
    });
    const item = buildItem({ refId: "a", title: "Follow-up", durationMin: 60 });
    const request = buildRequest([item]);

    const result = schedule([protectedEvent], profile, request, {
      now: TUE_8AM,
      horizonStart: TUE_8AM,
      horizonDays: 2, // Tuesday (fully booked) + Wednesday
    });

    expect(result.conflicts).toHaveLength(0);
    expect(result.plan.blocks).toHaveLength(1);
    const block = result.plan.blocks[0];
    expect(overlaps(block.start, block.end, protectedEvent.start, protectedEvent.end)).toBe(false);
    // With Tuesday fully consumed, the only remaining work-hours capacity is Wednesday.
    expect(new Date(block.start).getDate()).toBe(9);
  });

  it("lets a hard deadline displace a soft focus window, and records that it did", () => {
    // Work hours *are* the focus window on Monday — the only way to hit the noon deadline
    // is to use focus time, which is only allowed because the deadline is hard.
    const profile = buildProfile({
      workHours: { mon: { start: "09:00", end: "11:00" } },
      focusWindows: [{ day: 1, start: "09:00", end: "11:00" }],
    });
    const item = buildItem({ refId: "a", title: "Send hard-deadline reply", durationMin: 60, dueBy: "2026-09-07T11:00:00.000" });
    const request = buildRequest([item]);

    const result = schedule([], profile, request, { now: MON_8AM, horizonStart: MON_8AM, horizonDays: 1 });

    expect(result.conflicts).toHaveLength(0);
    expect(result.plan.blocks).toHaveLength(1);
    const block = result.plan.blocks[0];
    expect(block.displacedFocus).toBe(true);
    expect(block.rationale.toLowerCase()).toContain("focus");
    expect(new Date(block.end).getTime()).toBeLessThanOrEqual(new Date(item.dueBy!).getTime());
  });

  it("returns a structured conflict instead of silently splitting a non-splittable task that doesn't fit", () => {
    const profile = buildProfile(); // 8h/day capacity
    const item = buildItem({ refId: "a", title: "Huge non-splittable task", durationMin: 600 }); // > one day's capacity
    const request = buildRequest([item]);

    const result = schedule([], profile, request, { now: TUE_8AM, horizonStart: TUE_8AM, horizonDays: 1 });

    expect(result.plan.blocks).toHaveLength(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].refId).toBe("a");
    expect(result.conflicts[0].fallbacks.length).toBeGreaterThan(0);
    expect(result.conflicts[0].fallbacks.some((f) => f.action.startsWith("allow-split:"))).toBe(true);
  });

  it("splits a splittable task across two chunks, each honoring minChunkMin", () => {
    // Two isolated 90-minute windows (Tue and Wed mornings); neither fits a single 120min
    // block, but two 60min chunks (the task's minChunkMin) fit one per window.
    const profile = buildProfile({
      workHours: {
        mon: null,
        tue: { start: "09:00", end: "10:30" },
        wed: { start: "09:00", end: "10:30" },
        thu: null,
        fri: null,
      },
    });
    const task = buildTask({ id: "t1", durationMin: 120, splittable: true, minChunkMin: 60 });
    const item = buildItem({ refId: "a", taskId: "t1", title: task.title, durationMin: 120 });
    const request = buildRequest([item]);

    const result = schedule([], profile, request, {
      now: TUE_8AM,
      horizonStart: TUE_8AM,
      horizonDays: 3,
      tasks: [task],
    });

    expect(result.conflicts).toHaveLength(0);
    expect(result.plan.blocks).toHaveLength(2);
    expect(result.plan.blocks.every((b) => b.chunkCount === 2)).toBe(true);
    expect(new Set(result.plan.blocks.map((b) => b.chunkIndex))).toEqual(new Set([0, 1]));
    for (const block of result.plan.blocks) {
      const minutes = (new Date(block.end).getTime() - new Date(block.start).getTime()) / 60_000;
      expect(minutes).toBeGreaterThanOrEqual(task.minChunkMin);
    }
    const totalMinutes = result.plan.blocks.reduce(
      (sum, b) => sum + (new Date(b.end).getTime() - new Date(b.start).getTime()) / 60_000,
      0
    );
    expect(totalMinutes).toBe(120);
    // The two chunks land on different days (one per isolated window).
    const days = new Set(result.plan.blocks.map((b) => new Date(b.start).getDate()));
    expect(days.size).toBe(2);
  });

  it("incremental re-plan recomputes only the affected neighborhood, leaving other blocks untouched", () => {
    const profile = buildProfile();
    const itemA = buildItem({ refId: "a", title: "Task A", durationMin: 60 });
    const itemB = buildItem({ refId: "b", title: "Task B", durationMin: 60 });
    const request = buildRequest([itemA, itemB]);

    const firstResult = schedule([], profile, request, { now: TUE_8AM, horizonStart: TUE_8AM, horizonDays: 1 });
    expect(firstResult.conflicts).toHaveLength(0);
    expect(firstResult.plan.blocks).toHaveLength(2);
    const originalB = firstResult.plan.blocks.find((b) => b.refId === "b")!;
    const originalA = firstResult.plan.blocks.find((b) => b.refId === "a")!;

    // A new hard conflict appears exactly where "a" used to sit.
    const newBusyEvent = buildEvent({ title: "Surprise meeting", start: originalA.start, end: originalA.end });

    const secondResult = schedule([newBusyEvent], profile, request, {
      now: TUE_8AM,
      horizonStart: TUE_8AM,
      horizonDays: 1,
      previousPlan: firstResult.plan,
      replanOnly: ["a"],
    });

    expect(secondResult.conflicts).toHaveLength(0);
    const newB = secondResult.plan.blocks.find((b) => b.refId === "b")!;
    const newA = secondResult.plan.blocks.find((b) => b.refId === "a")!;

    // "b" is carried over untouched.
    expect(newB.start).toBe(originalB.start);
    expect(newB.end).toBe(originalB.end);
    // "a" was moved to avoid both the new meeting and "b"'s (untouched) slot.
    expect(overlaps(newA.start, newA.end, newBusyEvent.start, newBusyEvent.end)).toBe(false);
    expect(overlaps(newA.start, newA.end, newB.start, newB.end)).toBe(false);
  });
});
