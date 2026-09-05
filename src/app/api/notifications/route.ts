import { NextResponse } from "next/server";
import { seed, DEMO_USER_ID } from "@/server/store/seed";
import { getStore, listBy } from "@/server/store/db";

export async function GET() {
  seed();
  const store = getStore();
  const notifications = listBy(store.notifications, DEMO_USER_ID).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return NextResponse.json({ notifications });
}
