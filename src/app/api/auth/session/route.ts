import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { seed, DEMO_USER_ID } from "@/server/store/seed";
import { getStore } from "@/server/store/db";

export async function GET() {
  seed();
  const cookieStore = await cookies();
  const session = cookieStore.get("ft_session");
  if (!session) return NextResponse.json({ user: null });
  const user = getStore().users.get(DEMO_USER_ID);
  return NextResponse.json({ user: user ?? null });
}
