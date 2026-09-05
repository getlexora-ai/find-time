import { NextRequest, NextResponse } from "next/server";
import { addDays } from "date-fns";
import { seed, DEMO_USER_ID } from "@/server/store/seed";
import { getStore, listBy } from "@/server/store/db";
import { schedule } from "@/lib/scheduler";
import type { ScheduleItem } from "@/lib/types/ai";
import type { CalendarEvent, EventCategory } from "@/lib/types/event";
import type { PlanDraft, AISuggestion, ConflictReport } from "@/lib/types/ai";
import type { Task } from "@/lib/types/task";

/**
 * `other`'s skin is a near-invisible 6%-opacity fill (by design — it's meant for the rare
 * genuinely-uncategorized item, not a default bucket). Most AI-placed tasks are quick
 * correspondence/admin items, so route anything without a real focus/learning signal to
 * `admin` instead: it's both the better semantic fit and legible at the short durations
 * these tasks usually get.
 */
function categoryForTask(task: Task | null): EventCategory {
  if (!task) return "admin";
  if (task.requiresFocus) return "deep-work";
  if (task.category === "learning") return "learning";
  return "admin";
}

export async function POST(req: NextRequest) {
  seed();
  const store = getStore();
  const body = await req.json().catch(() => ({}));
  const requestedTaskIds: string[] | undefined = body.taskIds;

  const profile = store.schedulerProfiles.get(DEMO_USER_ID);
  if (!profile) return NextResponse.json({ error: "No scheduler profile" }, { status: 404 });

  const allTasks = listBy(store.tasks, DEMO_USER_ID);
  const candidateTasks = requestedTaskIds
    ? allTasks.filter((t) => requestedTaskIds.includes(t.id))
    : allTasks.filter((t) => t.status === "backlog");

  const now = new Date();
  const horizonStart = now.toISOString();
  const horizonDays = profile.planningHorizonDays ?? 7;
  const horizonEnd = addDays(now, horizonDays).toISOString();

  const items: ScheduleItem[] = candidateTasks.map((t) => ({
    refId: t.id,
    taskId: t.id,
    title: t.title,
    durationMin: t.durationMin,
    dueBy: t.dueBy ?? undefined,
    preferBy: t.preferBy ?? undefined,
    priority: t.priority,
    preferredWindow: t.preferredWindow ?? undefined,
  }));

  const calendar = listBy(store.events, DEMO_USER_ID).filter((e) => !e.isDraft);

  const result = schedule(
    calendar,
    profile,
    { intent: "plan", items, constraints: [], ambiguities: [], confidence: 1 },
    { tasks: candidateTasks, now: now.toISOString(), horizonStart, horizonDays },
  );

  const draftId = `draft_${crypto.randomUUID()}`;
  const nowIso = now.toISOString();
  const events: CalendarEvent[] = [];
  const suggestions: AISuggestion[] = [];

  result.plan.blocks.forEach((block, i) => {
    const task = candidateTasks.find((t) => t.id === block.taskId) ?? null;
    const eventId = `evt_${crypto.randomUUID()}`;
    const category = categoryForTask(task);
    const event: CalendarEvent = {
      id: eventId,
      userId: DEMO_USER_ID,
      calendarId: null,
      connectedAccountId: null,
      title: block.title,
      description: null,
      location: null,
      start: block.start,
      end: block.end,
      allDay: false,
      timezone: profile.timezone,
      itemType: "task",
      category,
      projectId: task?.projectId ?? null,
      taskId: task?.id ?? null,
      status: "confirmed",
      origin: "ai",
      isDraft: true,
      draftBatchId: draftId,
      suggestionId: null,
      flexibility: task?.requiresFocus ? "protected" : "flexible",
      requiresFocus: task?.requiresFocus ?? false,
      reminders: [{ minutesBefore: 10, channel: "in-app" }],
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    events.push(event);
    store.events.set(eventId, event);

    const suggestion: AISuggestion = {
      id: `sug_${crypto.randomUUID()}`,
      draftId,
      userId: DEMO_USER_ID,
      index: i + 1,
      kind: "create",
      taskId: task?.id ?? null,
      eventId,
      signalId: null,
      title: block.title,
      proposedStart: block.start,
      proposedEnd: block.end,
      previousStart: null,
      previousEnd: null,
      rationale: block.rationale,
      // `score` is the scheduler's raw weighted ranking score (weights sum to ~1, so an
      // ordinary placement with no bonus factors lands well under 0.5) — not a probability.
      // Rescale it onto a user-facing confidence range so an unremarkable-but-correct
      // placement doesn't read as "13% confidence", which looks broken even though it isn't.
      confidence: 0.5 + 0.5 * Math.max(0, Math.min(1, block.score)),
      score: block.score,
      displacedFocus: block.displacedFocus,
      displacedEventIds: [],
      status: "pending",
    };
    suggestions.push(suggestion);
    store.aiSuggestions.set(suggestion.id, suggestion);
    event.suggestionId = suggestion.id;
  });

  const conflicts: ConflictReport[] = result.conflicts.map((c) => ({
    id: c.id,
    message: c.message,
    fallbacks: c.fallbacks,
  }));

  const draft: PlanDraft = {
    id: draftId,
    userId: DEMO_USER_ID,
    sessionId: null,
    createdAt: nowIso,
    horizonStart,
    horizonEnd,
    status: "pending",
    changeCount: events.length,
    conflictCount: conflicts.length,
    appliedAt: null,
    undoneAt: null,
    conflicts,
  };
  store.planDrafts.set(draftId, draft);

  return NextResponse.json({ draft, suggestions, events, conflicts });
}
