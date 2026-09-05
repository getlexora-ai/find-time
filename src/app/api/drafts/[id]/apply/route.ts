import { NextRequest, NextResponse } from "next/server";
import { seed } from "@/server/store/seed";
import { getStore } from "@/server/store/db";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  seed();
  const { id } = await params;
  const store = getStore();
  const draft = store.planDrafts.get(id);
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date().toISOString();

  for (const event of store.events.values()) {
    if (event.draftBatchId === id) {
      store.events.set(event.id, { ...event, isDraft: false, updatedAt: now });
    }
  }
  for (const suggestion of store.aiSuggestions.values()) {
    if (suggestion.draftId === id) {
      store.aiSuggestions.set(suggestion.id, { ...suggestion, status: "applied" });
    }
  }

  const updated = { ...draft, status: "applied" as const, appliedAt: now };
  store.planDrafts.set(id, updated);

  return NextResponse.json({ draft: updated });
}
