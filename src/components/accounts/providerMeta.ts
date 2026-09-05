import type { AccountProvider } from "@/lib/types";

export interface ProviderMeta {
  label: string;
  icon: string;
  description: string;
  soon?: boolean;
  /** Scopes previewed in `OAuthConsentDialog` before the (simulated) OAuth redirect. */
  scopes: string[];
}

export const PROVIDER_META: Record<AccountProvider, ProviderMeta> = {
  google: {
    label: "Google",
    icon: "solar:letter-linear",
    description: "Gmail + Google Calendar",
    scopes: [
      "Read and send email on your behalf",
      "View and edit events on your calendars",
      "View your basic profile info (name, email, avatar)",
    ],
  },
  microsoft: {
    label: "Microsoft",
    icon: "solar:widget-4-linear",
    description: "Outlook + Microsoft 365 Calendar",
    soon: true,
    scopes: [
      "Read and send email on your behalf",
      "View and edit events on your calendars",
      "View your basic profile info (name, email, avatar)",
    ],
  },
  imap: {
    label: "IMAP / SMTP",
    icon: "solar:server-linear",
    description: "Any custom mail server",
    scopes: ["Read and send email using the credentials you provide"],
  },
  todoist: {
    label: "Todoist",
    icon: "solar:checklist-minimalistic-linear",
    description: "Import your to-do list",
    soon: true,
    scopes: ["Read your tasks and projects"],
  },
  "google-tasks": {
    label: "Google Tasks",
    icon: "solar:clipboard-check-linear",
    description: "Import your task list",
    soon: true,
    scopes: ["Read and update your task lists"],
  },
  notion: {
    label: "Notion",
    icon: "solar:notebook-linear",
    description: "Import a database view",
    soon: true,
    scopes: ["Read content from the database you select"],
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
