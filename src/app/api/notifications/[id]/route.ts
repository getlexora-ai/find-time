import { NextRequest, NextResponse } from "next/server";
import { seed } from "@/server/store/seed";
import { getStore } from "@/server/store/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  seed();
  const { id } = await params;
  const store = getStore();
  const existing = store.notifications.get(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const patch = await req.json();
  const updated = { ...existing, ...patch };
  store.notifications.set(id, updated);
  return NextResponse.json({ notification: updated });
}
