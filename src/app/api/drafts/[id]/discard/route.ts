import { NextRequest, NextResponse } from "next/server";
import { seed } from "@/server/store/seed";
import { getStore } from "@/server/store/db";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  seed();
  const { id } = await params;
  const store = getStore();
  const draft = store.planDrafts.get(id);
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });

  for (const event of Array.from(store.events.values())) {
    if (event.draftBatchId === id) store.events.delete(event.id);
  }
  for (const suggestion of store.aiSuggestions.values()) {
    if (suggestion.draftId === id) {
      store.aiSuggestions.set(suggestion.id, { ...suggestion, status: "rejected" });
    }
  }

  const updated = { ...draft, status: "discarded" as const };
  store.planDrafts.set(id, updated);

  return NextResponse.json({ draft: updated });
}
