import { NextRequest, NextResponse } from "next/server";
import { seed, DEMO_USER_ID } from "@/server/store/seed";
import { getStore } from "@/server/store/db";
import type { Task } from "@/lib/types";

/** Accepting a signal turns it into a task — the signal → task → schedule chain. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  seed();
  const { id } = await params;
  const store = getStore();
  const signal = store.signals.get(id);
  if (!signal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date().toISOString();
  const taskId = `task_${crypto.randomUUID()}`;
  const task: Task = {
    id: taskId,
    userId: DEMO_USER_ID,
    projectId: null,
    notes: `From email: "${signal.sourceQuote}"`,
    status: "backlog",
    durationMin: signal.suggestedDurationMin ?? 30,
    durationIsEstimate: true,
    actualDurationMin: null,
    dueBy: signal.dueBy,
    preferBy: null,
    priority: signal.kind === "deadline" ? "high" : "medium",
    requiresFocus: false,
    preferredWindow: null,
    splittable: false,
    minChunkMin: 30,
    category: "general",
    labels: [],
    scheduledEventId: null,
    sourceType: "signal",
    sourceAccountId: signal.connectedAccountId,
    sourceExternalId: null,
    sourceSignalId: signal.id,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    title: signal.extractedTitle,
  };
  store.tasks.set(taskId, task);

  store.signals.set(id, {
    ...signal,
    status: "converted",
    createdTaskId: taskId,
    reviewedAt: now,
  });

  return NextResponse.json({ task });
}
