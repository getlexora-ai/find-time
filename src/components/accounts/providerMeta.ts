import type { AccountProvider } from "@/lib/types";

export interface ProviderMeta {
  label: string;
  icon: string;
  description: string;
  soon?: boolean;
}

export const PROVIDER_META: Record<AccountProvider, ProviderMeta> = {
  google: {
    label: "Google",
    icon: "solar:letter-linear",
    description: "Gmail + Google Calendar",
  },
  microsoft: {
    label: "Microsoft",
    icon: "solar:widget-4-linear",
    description: "Outlook + Microsoft 365 Calendar",
    soon: true,
  },
  imap: {
    label: "IMAP / SMTP",
    icon: "solar:server-linear",
    description: "Any custom mail server",
  },
  todoist: {
    label: "Todoist",
    icon: "solar:checklist-minimalistic-linear",
    description: "Import your to-do list",
    soon: true,
  },
  "google-tasks": {
    label: "Google Tasks",
    icon: "solar:clipboard-check-linear",
    description: "Import your task list",
    soon: true,
  },
  notion: {
    label: "Notion",
    icon: "solar:notebook-linear",
    description: "Import a database view",
    soon: true,
  },
};

/** Deterministic-feeling pool of fake identities for the simulated OAuth connect flow. */
const MOCK_EMAIL_POOL: Partial<Record<AccountProvider, string[]>> = {
  google: [
    "jordan.kim@gmail.com",
    "morgan.lee@gmail.com",
    "sam.rivera@gmail.com",
    "casey.ng@gmail.com",
  ],
};

export function pickMockEmail(provider: AccountProvider, index: number) {
  const pool = MOCK_EMAIL_POOL[provider] ?? [`${provider}-account@example.com`];
  return pool[index % pool.length];
}
