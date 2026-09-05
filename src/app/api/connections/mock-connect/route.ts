import { NextRequest, NextResponse } from "next/server";
import { seed, DEMO_USER_ID } from "@/server/store/seed";
import { getStore, listBy } from "@/server/store/db";
import type { AccountProvider, Calendar, ConnectedAccount } from "@/lib/types";

/**
 * Day-one simulated OAuth/connect flow: no real provider handshake happens
 * here, we just fabricate a realistic ConnectedAccount (and its primary
 * Calendar, for mail+calendar providers) and add it to the seeded store so it
 * shows up through the normal `GET /api/connections` the rest of the app
 * already reads from.
 */

const ACCENT_ORDER: ConnectedAccount["accentColor"][] = [
  "lime",
  "periwinkle",
  "ember",
  "amber",
  "white",
];

const KIND_BY_PROVIDER: Record<AccountProvider, ConnectedAccount["kind"]> = {
  google: "mail+calendar",
  microsoft: "mail+calendar",
  imap: "mail",
  todoist: "tasks",
  "google-tasks": "tasks",
  notion: "tasks",
};

function nextId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export async function POST(req: NextRequest) {
  seed();
  const store = getStore();
  const body = await req.json().catch(() => ({}));
  const provider = (body.provider as AccountProvider) ?? "google";
  const existing = listBy(store.connectedAccounts, DEMO_USER_ID);

  const now = new Date().toISOString();
  const kind = KIND_BY_PROVIDER[provider] ?? "mail";
  const account: ConnectedAccount = {
    id: nextId("acct"),
    userId: DEMO_USER_ID,
    provider,
    kind,
    authType: provider === "imap" ? "password" : "oauth",
    email: body.email ?? `account-${existing.length + 1}@example.com`,
    displayName: body.displayName ?? provider,
    accentColor: ACCENT_ORDER[existing.length % ACCENT_ORDER.length],
    isPrimary: existing.length === 0,
    order: existing.length,
    scopes: provider === "google" ? ["gmail.readonly", "calendar.events", "userinfo.email"] : [],
    syncStatus: "live",
    syncError: null,
    lastSyncAt: now,
    messageCount: Math.floor(180 + Math.random() * 2200),
    createdAt: now,
  };
  store.connectedAccounts.set(account.id, account);

  let calendar: Calendar | null = null;
  if (kind === "mail+calendar") {
    calendar = {
      id: nextId("cal"),
      connectedAccountId: account.id,
      userId: DEMO_USER_ID,
      providerCalendarId: "primary",
      name: account.displayName,
      color: account.accentColor,
      isPrimary: existing.length === 0,
      readEnabled: true,
      writeEnabled: existing.length === 0,
      isWriteTarget: existing.length === 0,
      timezone: "Europe/Berlin",
    };
    store.calendars.set(calendar.id, calendar);
  }

  return NextResponse.json({ account, calendar });
}
