import { NextRequest, NextResponse } from "next/server";
import { seed, DEMO_USER_ID } from "@/server/store/seed";
import { getStore, listBy } from "@/server/store/db";
import type { CalendarEvent } from "@/lib/types";

export async function GET() {
  seed();
  const store = getStore();
  const events = listBy(store.events, DEMO_USER_ID);
  return NextResponse.json({ events });
}

export async function POST(req: NextRequest) {
  seed();
  const store = getStore();
  const body = await req.json();
  const now = new Date().toISOString();
  const id = `evt_${crypto.randomUUID()}`;
  const event: CalendarEvent = {
    id,
    userId: DEMO_USER_ID,
    calendarId: null,
    connectedAccountId: null,
    description: null,
    location: null,
    allDay: false,
    timezone: "Europe/Berlin",
    itemType: "event",
    category: "other",
    projectId: null,
    taskId: null,
    status: "confirmed",
    origin: "manual",
    isDraft: false,
    draftBatchId: null,
    suggestionId: null,
    flexibility: "flexible",
    requiresFocus: false,
    reminders: [{ minutesBefore: 10, channel: "in-app" }],
    createdAt: now,
    updatedAt: now,
    ...body,
  };
  store.events.set(id, event);
  return NextResponse.json({ event }, { status: 201 });
}
