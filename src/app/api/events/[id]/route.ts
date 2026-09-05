import { NextRequest, NextResponse } from "next/server";
import { seed } from "@/server/store/seed";
import { getStore } from "@/server/store/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  seed();
  const { id } = await params;
  const event = getStore().events.get(id);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ event });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  seed();
  const { id } = await params;
  const store = getStore();
  const existing = store.events.get(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const patch = await req.json();
  const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  store.events.set(id, updated);
  return NextResponse.json({ event: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  seed();
  const { id } = await params;
  const store = getStore();
  if (!store.events.has(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  store.events.delete(id);
  return NextResponse.json({ ok: true });
}
