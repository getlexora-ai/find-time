import { NextResponse } from "next/server";
import { seed, DEMO_USER_ID } from "@/server/store/seed";
import { getStore, listBy } from "@/server/store/db";

export async function GET() {
  seed();
  const store = getStore();
  const signals = listBy(store.signals, DEMO_USER_ID).sort(
    (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
  );
  return NextResponse.json({ signals });
}
