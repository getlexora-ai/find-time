import { NextRequest, NextResponse } from "next/server";
import { seed, DEMO_USER_ID } from "@/server/store/seed";
import { getStore, listBy } from "@/server/store/db";
import type { Task } from "@/lib/types";

export async function GET() {
  seed();
  const store = getStore();
  const tasks = listBy(store.tasks, DEMO_USER_ID);
  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  seed();
  const store = getStore();
  const body = await req.json();
  const now = new Date().toISOString();
  const id = `task_${crypto.randomUUID()}`;
  const task: Task = {
    id,
    userId: DEMO_USER_ID,
    projectId: null,
    notes: null,
    status: "backlog",
    durationMin: 30,
    durationIsEstimate: true,
    actualDurationMin: null,
    dueBy: null,
    preferBy: null,
    priority: "medium",
    requiresFocus: false,
    preferredWindow: null,
    splittable: false,
    minChunkMin: 30,
    category: "general",
    labels: [],
    scheduledEventId: null,
    sourceType: "native",
    sourceAccountId: null,
    sourceExternalId: null,
    sourceSignalId: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    ...body,
  };
  store.tasks.set(id, task);
  return NextResponse.json({ task }, { status: 201 });
}
