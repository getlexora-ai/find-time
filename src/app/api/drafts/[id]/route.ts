import { NextRequest, NextResponse } from "next/server";
import { seed } from "@/server/store/seed";
import { getStore } from "@/server/store/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  seed();
  const { id } = await params;
  const store = getStore();
  const draft = store.planDrafts.get(id);
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const suggestions = Array.from(store.aiSuggestions.values())
    .filter((s) => s.draftId === id)
    .sort((a, b) => a.index - b.index);
  return NextResponse.json({ draft, suggestions });
}
