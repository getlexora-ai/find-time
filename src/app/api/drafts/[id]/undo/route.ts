import { NextRequest, NextResponse } from "next/server";
import { seed } from "@/server/store/seed";
import { getStore } from "@/server/store/db";

/** Reverses a just-applied draft back to draft state — the single undo after apply-all. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  seed();
  const { id } = await params;
  const store = getStore();
  const draft = store.planDrafts.get(id);
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date().toISOString();

  for (const event of store.events.values()) {
    if (event.draftBatchId === id) {
      store.events.set(event.id, { ...event, isDraft: true, updatedAt: now });
    }
  }
  for (const suggestion of store.aiSuggestions.values()) {
    if (suggestion.draftId === id) {
      store.aiSuggestions.set(suggestion.id, { ...suggestion, status: "pending" });
    }
  }

  const updated = { ...draft, status: "pending" as const, appliedAt: null, undoneAt: now };
  store.planDrafts.set(id, updated);

  return NextResponse.json({ draft: updated });
}
