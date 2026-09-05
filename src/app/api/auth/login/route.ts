import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { seed, DEMO_USER_ID } from "@/server/store/seed";
import { getStore } from "@/server/store/db";

/**
 * Identity login only — deliberately separate from /api/connections/*.
 * Adding a connected Gmail account must never touch this session.
 */
export async function POST() {
  seed();
  const cookieStore = await cookies();
  cookieStore.set("ft_session", DEMO_USER_ID, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  const user = getStore().users.get(DEMO_USER_ID);
  return NextResponse.json({ user });
}
