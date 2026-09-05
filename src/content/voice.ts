export const marqueePhrases = {
  marketing: [
    "FIND TIME FOR WHAT MATTERS",
    "AI PLANS YOUR CALENDAR IN ADVANCE",
    "READ-ONLY INBOX ACCESS · NEVER SENDS",
    "CONNECT 2+ GMAIL ACCOUNTS",
    "PROTECT YOUR DEEP WORK",
  ],
  app: (opts: { projectName?: string; tasksProtected?: number }) => [
    "FIND TIME",
    opts.projectName ? `${opts.projectName.toUpperCase()} IN FOCUS` : "DEEP WORK IN FOCUS",
    "AI SCHEDULE ONLINE",
    opts.tasksProtected != null ? `${opts.tasksProtected} TASKS PROTECTED TODAY` : "TASKS PROTECTED TODAY",
  ],
};

export const emptyStates = {
  signals: {
    icon: "solar:inbox-line-linear",
    eyebrow: "No signals yet",
    message: "Connect an account to see AI-extracted context from your inbox.",
    ctaLabel: "Connect account",
  },
  tasks: {
    icon: "solar:checklist-minimalistic-linear",
    eyebrow: "Nothing here",
    message: "Add a task, or let AI pull one out of your inbox.",
    ctaLabel: "Add a task",
  },
  notifications: {
    icon: "solar:bell-linear",
    eyebrow: "All quiet",
    message: "You're caught up. New activity will show up here.",
  },
  projects: {
    icon: "solar:folder-with-files-linear",
    eyebrow: "No projects yet",
    message: "Group related tasks into a project to track progress and plan around a deadline.",
    ctaLabel: "New project",
  },
};

export const aiResponses = {
  thinking: "Checking priorities, energy, and flexible blocks…",
  planFound: (summary: string) => summary,
  samplePlan:
    "I moved email review to your admin batch and reserved 08:00–08:35 for Spanish, when your energy is strongest.",
};

export const heroCopy = {
  eyebrow: "System ready",
  headlineLine1: "Find time for",
  headlineLine2: "what matters.",
  subcopy:
    "Find_time reads your calendars, your inboxes, and your to-dos, then builds the plan around them — so the important work always has a slot.",
};
