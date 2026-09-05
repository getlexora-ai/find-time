import { NextResponse } from "next/server";
import { seed, DEMO_USER_ID } from "@/server/store/seed";
import { getStore, listBy } from "@/server/store/db";

export async function GET() {
  seed();
  const store = getStore();
  const accounts = listBy(store.connectedAccounts, DEMO_USER_ID).sort((a, b) => a.order - b.order);
  const calendars = listBy(store.calendars, DEMO_USER_ID);
  return NextResponse.json({ accounts, calendars });
}
