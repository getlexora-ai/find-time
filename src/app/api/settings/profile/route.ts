import { NextRequest, NextResponse } from "next/server";
import { seed, DEMO_USER_ID } from "@/server/store/seed";
import { getStore } from "@/server/store/db";

export async function GET() {
  seed();
  const user = getStore().users.get(DEMO_USER_ID);
  return NextResponse.json({ user });
}

export async function PATCH(req: NextRequest) {
  seed();
  const store = getStore();
  const existing = store.users.get(DEMO_USER_ID);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const patch = await req.json();
  const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  store.users.set(DEMO_USER_ID, updated);
  return NextResponse.json({ user: updated });
}
