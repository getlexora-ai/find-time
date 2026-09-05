import { NextRequest, NextResponse } from "next/server";
import { seed } from "@/server/store/seed";
import { getStore } from "@/server/store/db";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  seed();
  const { id } = await params;
  const store = getStore();
  const signal = store.signals.get(id);
  if (!signal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  store.signals.set(id, { ...signal, status: "ignored", reviewedAt: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
