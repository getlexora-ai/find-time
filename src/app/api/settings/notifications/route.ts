import { NextRequest, NextResponse } from "next/server";
import { seed, DEMO_USER_ID } from "@/server/store/seed";
import { getStore } from "@/server/store/db";

export async function GET() {
  seed();
  const prefs = getStore().notificationPrefs.get(DEMO_USER_ID);
  return NextResponse.json({ notificationPrefs: prefs });
}

export async function PATCH(req: NextRequest) {
  seed();
  const store = getStore();
  const existing = store.notificationPrefs.get(DEMO_USER_ID);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const patch = await req.json();
  const updated = { ...existing, ...patch };
  store.notificationPrefs.set(DEMO_USER_ID, updated);
  return NextResponse.json({ notificationPrefs: updated });
}
