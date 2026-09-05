import type { CalendarEvent } from "../../types/event";
import type { Constraint, ScheduleItem, ScheduleRequest } from "../../types/ai";
import type { Task } from "../../types/task";
import type { SchedulerProfile } from "../../types/user";

type WorkHours = SchedulerProfile["workHours"];

const DEFAULT_WORK_HOURS: WorkHours = {
  mon: { start: "09:00", end: "17:00" },
  tue: { start: "09:00", end: "17:00" },
  wed: { start: "09:00", end: "17:00" },
  thu: { start: "09:00", end: "17:00" },
  fri: { start: "09:00", end: "17:00" },
  sat: null,
  sun: null,
};

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

export function buildProfile(
  overrides: Omit<Partial<SchedulerProfile>, "workHours"> & { workHours?: Partial<WorkHours> } = {}
): SchedulerProfile {
  const { workHours, ...rest } = overrides;
  return {
    userId: "u1",
    timezone: "UTC",
    workHours: { ...DEFAULT_WORK_HOURS, ...workHours },
    focusWindows: [],
    defaultBufferMin: 0,
    minFocusBlockMin: 30,
    maxDailyFocusMin: 120,
    energyCurve: [
      { hour: 9, level: 0.9 },
      { hour: 13, level: 0.5 },
      { hour: 16, level: 0.3 },
    ],
    weights: {
      preferredWindow: 1,
      focusAlignment: 1,
      priority: 1,
      fragmentation: 1,
      deadlineUrgency: 1,
    },
    durationBias: {},
    autonomy: "draft-daily",
    dailyPlanAt: "07:00",
    planningHorizonDays: 7,
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...rest,
  };
}

export function buildEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: nextId("evt"),
    userId: "u1",
    calendarId: "cal-1",
    connectedAccountId: null,
    title: "Busy",
    description: null,
    location: null,
    start: "2026-09-07T09:00:00.000",
    end: "2026-09-07T10:00:00.000",
    allDay: false,
    timezone: "UTC",
    itemType: "event",
    category: "meeting",
    projectId: null,
    taskId: null,
    status: "confirmed",
    origin: "manual",
    isDraft: false,
    draftBatchId: null,
    suggestionId: null,
    flexibility: "fixed",
    requiresFocus: false,
    reminders: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

export function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: nextId("task"),
    userId: "u1",
    projectId: null,
    title: "Task",
    notes: null,
    status: "backlog",
    durationMin: 60,
    durationIsEstimate: false,
    actualDurationMin: null,
    dueBy: null,
    preferBy: null,
    priority: "medium",
    requiresFocus: false,
    preferredWindow: null,
    splittable: false,
    minChunkMin: 60,
    category: "other",
    labels: [],
    scheduledEventId: null,
    sourceType: "native",
    sourceAccountId: null,
    sourceExternalId: null,
    sourceSignalId: null,
    completedAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

export function buildItem(overrides: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    refId: nextId("item"),
    title: "Untitled",
    durationMin: 60,
    ...overrides,
  };
}

export function buildRequest(items: ScheduleItem[], constraints: Constraint[] = []): ScheduleRequest {
  return {
    intent: "plan",
    items,
    constraints,
    ambiguities: [],
    confidence: 1,
  };
}
