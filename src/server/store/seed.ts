import { addDays, addMinutes, setHours, setMinutes, startOfWeek, subDays } from "date-fns";
import { getStore, isSeeded, markSeeded } from "@/server/store/db";
import type {
  User,
  SchedulerProfile,
  NotificationPrefs,
  ConnectedAccount,
  Calendar,
  CalendarEvent,
  Task,
  Project,
  EmailSignal,
  Notification,
} from "@/lib/types";

const USER_ID = "u1";
let idCounter = 0;
function id(prefix: string) {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

function at(dayOffset: number, hour: number, minute = 0) {
  const base = startOfWeek(new Date(), { weekStartsOn: 1 });
  return setMinutes(setHours(addDays(base, dayOffset), hour), minute).toISOString();
}

function plusMin(iso: string, minutes: number) {
  return addMinutes(new Date(iso), minutes).toISOString();
}

export function seed() {
  if (isSeeded()) return;
  const store = getStore();
  const now = new Date().toISOString();

  const user: User = {
    id: USER_ID,
    email: "ajay@findtime.ai",
    name: "Ajay",
    avatarColor: "lime",
    timezone: "Europe/Berlin",
    locale: "en",
    clock12h: false,
    createdAt: now,
    updatedAt: now,
    onboardingCompletedAt: now,
  };
  store.users.set(user.id, user);

  const schedulerProfile: SchedulerProfile = {
    userId: USER_ID,
    timezone: "Europe/Berlin",
    workHours: {
      mon: { start: "09:00", end: "18:00" },
      tue: { start: "09:00", end: "18:00" },
      wed: { start: "09:00", end: "18:00" },
      thu: { start: "09:00", end: "18:00" },
      fri: { start: "09:00", end: "17:00" },
      sat: null,
      sun: null,
    },
    focusWindows: [
      { day: 1, start: "09:00", end: "11:30" },
      { day: 3, start: "09:00", end: "11:30" },
    ],
    defaultBufferMin: 10,
    minFocusBlockMin: 45,
    maxDailyFocusMin: 240,
    energyCurve: [
      { hour: 8, level: 0.7 },
      { hour: 9, level: 0.95 },
      { hour: 10, level: 1 },
      { hour: 11, level: 0.9 },
      { hour: 13, level: 0.5 },
      { hour: 15, level: 0.75 },
      { hour: 17, level: 0.55 },
    ],
    weights: {
      preferredWindow: 0.3,
      focusAlignment: 0.25,
      priority: 0.25,
      fragmentation: 0.1,
      deadlineUrgency: 0.1,
    },
    durationBias: {},
    autonomy: "draft-daily",
    dailyPlanAt: "06:00",
    planningHorizonDays: 7,
    updatedAt: now,
  };
  store.schedulerProfiles.set(USER_ID, schedulerProfile);

  const notificationPrefs: NotificationPrefs = {
    userId: USER_ID,
    channels: {
      "event.reminder": { inApp: true, browser: true, email: false },
      "plan.ready": { inApp: true, browser: true, email: true },
      "plan.applied": { inApp: true, browser: false, email: false },
      "conflict.detected": { inApp: true, browser: true, email: false },
      "task.overdue": { inApp: true, browser: false, email: false },
      "signal.new": { inApp: true, browser: false, email: false },
      "account.error": { inApp: true, browser: true, email: true },
      "focus.complete": { inApp: true, browser: false, email: false },
    },
    defaultReminderMinutes: 10,
    quietHoursStart: "21:00",
    quietHoursEnd: "07:00",
    dailyPlanDeliveryTime: "06:00",
  };
  store.notificationPrefs.set(USER_ID, notificationPrefs);

  // --- Connected accounts: the multi-Gmail core ---
  const acctPersonal: ConnectedAccount = {
    id: id("acct"),
    userId: USER_ID,
    provider: "google",
    kind: "mail+calendar",
    authType: "oauth",
    email: "ajay.personal@gmail.com",
    displayName: "Personal",
    accentColor: "lime",
    isPrimary: true,
    order: 0,
    scopes: ["gmail.readonly", "calendar.events", "userinfo.email"],
    syncStatus: "live",
    syncError: null,
    lastSyncAt: now,
    messageCount: 1842,
    createdAt: now,
  };
  const acctWork: ConnectedAccount = {
    id: id("acct"),
    userId: USER_ID,
    provider: "google",
    kind: "mail+calendar",
    authType: "oauth",
    email: "ajay@findtime.ai",
    displayName: "Work",
    accentColor: "periwinkle",
    isPrimary: false,
    order: 1,
    scopes: ["gmail.readonly", "calendar.events", "userinfo.email"],
    syncStatus: "live",
    syncError: null,
    lastSyncAt: now,
    messageCount: 3021,
    createdAt: now,
  };
  const acctImap: ConnectedAccount = {
    id: id("acct"),
    userId: USER_ID,
    provider: "imap",
    kind: "mail",
    authType: "password",
    email: "ajay@customdomain.dev",
    displayName: "Custom",
    accentColor: "amber",
    isPrimary: false,
    order: 2,
    scopes: [],
    syncStatus: "error",
    syncError: "Authentication failed — check app password",
    lastSyncAt: subDays(new Date(), 2).toISOString(),
    messageCount: 412,
    createdAt: now,
  };
  [acctPersonal, acctWork, acctImap].forEach((a) => store.connectedAccounts.set(a.id, a));

  const calPersonal: Calendar = {
    id: id("cal"),
    connectedAccountId: acctPersonal.id,
    userId: USER_ID,
    providerCalendarId: "primary",
    name: "Personal",
    color: "lime",
    isPrimary: true,
    readEnabled: true,
    writeEnabled: true,
    isWriteTarget: true,
    timezone: "Europe/Berlin",
  };
  const calWork: Calendar = {
    id: id("cal"),
    connectedAccountId: acctWork.id,
    userId: USER_ID,
    providerCalendarId: "primary",
    name: "Work",
    color: "periwinkle",
    isPrimary: false,
    readEnabled: true,
    writeEnabled: false,
    isWriteTarget: false,
    timezone: "Europe/Berlin",
  };
  const calCustom: Calendar = {
    id: id("cal"),
    connectedAccountId: acctImap.id,
    userId: USER_ID,
    providerCalendarId: "custom",
    name: "Custom",
    color: "amber",
    isPrimary: false,
    readEnabled: true,
    writeEnabled: false,
    isWriteTarget: false,
    timezone: "Europe/Berlin",
  };
  [calPersonal, calWork, calCustom].forEach((c) => store.calendars.set(c.id, c));

  // --- Projects ---
  const projLaunch: Project = {
    id: id("proj"),
    userId: USER_ID,
    name: "Q3 Launch",
    color: "lime",
    description: "Ship the Q3 product launch.",
    status: "active",
    targetDate: addDays(new Date(), 18).toISOString(),
    order: 0,
    createdAt: now,
  };
  const projHiring: Project = {
    id: id("proj"),
    userId: USER_ID,
    name: "Hiring",
    color: "periwinkle",
    description: "Fill the two open design reqs.",
    status: "active",
    targetDate: addDays(new Date(), 30).toISOString(),
    order: 1,
    createdAt: now,
  };
  const projPersonal: Project = {
    id: id("proj"),
    userId: USER_ID,
    name: "Personal",
    color: "amber",
    description: null,
    status: "active",
    targetDate: null,
    order: 2,
    createdAt: now,
  };
  [projLaunch, projHiring, projPersonal].forEach((p) => store.projects.set(p.id, p));

  // --- Events: ~35 across last week, this week, next week ---
  const eventDefs: Array<
    Omit<CalendarEvent, "id" | "userId" | "createdAt" | "updatedAt" | "reminders"> & {
      reminders?: CalendarEvent["reminders"];
    }
  > = [];

  const pushEvent = (
    dayOffset: number,
    hour: number,
    minute: number,
    durationMin: number,
    title: string,
    category: CalendarEvent["category"],
    opts: Partial<CalendarEvent> = {},
  ) => {
    const start = at(dayOffset, hour, minute);
    eventDefs.push({
      calendarId: calPersonal.id,
      connectedAccountId: acctPersonal.id,
      title,
      description: null,
      location: null,
      start,
      end: plusMin(start, durationMin),
      allDay: false,
      timezone: "Europe/Berlin",
      itemType: "event",
      category,
      projectId: null,
      taskId: null,
      status: "confirmed",
      origin: "manual",
      isDraft: false,
      draftBatchId: null,
      suggestionId: null,
      flexibility: "flexible",
      requiresFocus: category === "deep-work",
      ...opts,
    });
  };

  // last week
  for (let d = -7; d < 0; d++) {
    pushEvent(d, 9, 0, 45, "Morning standup", "meeting", { flexibility: "fixed" });
    if (d % 2 === 0) pushEvent(d, 10, 30, 90, "Deep work — Q3 deck", "deep-work", { projectId: projLaunch.id, flexibility: "protected" });
  }

  // this week — the richer, "live" data
  pushEvent(0, 9, 0, 45, "Design review", "meeting", { flexibility: "fixed", connectedAccountId: acctWork.id, calendarId: calWork.id });
  pushEvent(0, 10, 30, 90, "Q3 deck — deep work", "deep-work", { projectId: projLaunch.id, flexibility: "protected" });
  pushEvent(0, 12, 15, 15, "Recovery break", "break", { flexibility: "flexible", itemType: "break" });
  pushEvent(0, 13, 0, 20, "Inbox batch", "admin", { flexibility: "flexible" });
  pushEvent(0, 8, 0, 35, "Spanish practice", "learning", { flexibility: "flexible" });

  pushEvent(1, 9, 30, 60, "1:1 with manager", "meeting", { flexibility: "fixed", connectedAccountId: acctWork.id, calendarId: calWork.id });
  pushEvent(1, 11, 0, 120, "Interview — Design candidate", "meeting", { projectId: projHiring.id, flexibility: "fixed", connectedAccountId: acctWork.id, calendarId: calWork.id });
  pushEvent(1, 14, 0, 90, "Deep work — onboarding flow", "deep-work", { projectId: projLaunch.id, flexibility: "protected" });

  pushEvent(2, 9, 0, 45, "Design review", "meeting", { flexibility: "fixed", connectedAccountId: acctWork.id, calendarId: calWork.id });
  pushEvent(2, 10, 0, 120, "Deep work — launch copy", "deep-work", { projectId: projLaunch.id, flexibility: "protected" });
  pushEvent(2, 15, 0, 60, "Dentist", "other", { flexibility: "fixed", connectedAccountId: acctPersonal.id, calendarId: calPersonal.id, projectId: projPersonal.id });

  pushEvent(3, 9, 30, 60, "Interview — Backend candidate", "meeting", { projectId: projHiring.id, flexibility: "fixed", connectedAccountId: acctWork.id, calendarId: calWork.id });
  pushEvent(3, 11, 0, 90, "Deep work — pricing page", "deep-work", { projectId: projLaunch.id, flexibility: "protected" });
  pushEvent(3, 13, 30, 30, "Sync with growth", "meeting", { flexibility: "flexible", connectedAccountId: acctWork.id, calendarId: calWork.id });

  pushEvent(4, 9, 0, 30, "Weekly planning", "admin", { flexibility: "fixed" });
  pushEvent(4, 10, 0, 90, "Deep work — launch retro prep", "deep-work", { projectId: projLaunch.id, flexibility: "protected" });
  pushEvent(4, 16, 0, 45, "Coffee with Mike", "other", { flexibility: "flexible", connectedAccountId: acctPersonal.id, calendarId: calPersonal.id });

  // next week — lighter, mostly AI-flagged as flexible
  for (let d = 7; d < 12; d++) {
    pushEvent(d, 9, 0, 45, "Standup", "meeting", { flexibility: "fixed" });
  }
  pushEvent(8, 10, 0, 120, "Launch dry run", "deep-work", { projectId: projLaunch.id, flexibility: "protected" });
  pushEvent(9, 13, 0, 60, "All-hands", "meeting", { flexibility: "fixed", connectedAccountId: acctWork.id, calendarId: calWork.id });

  eventDefs.forEach((def) => {
    const event: CalendarEvent = {
      id: id("evt"),
      userId: USER_ID,
      createdAt: now,
      updatedAt: now,
      reminders: def.reminders ?? [{ minutesBefore: 10, channel: "in-app" }],
      ...def,
    };
    store.events.set(event.id, event);
  });

  // --- Tasks (18) ---
  const taskDefs: Array<Partial<Task> & { title: string; durationMin: number }> = [
    { title: "Finalize launch pricing copy", durationMin: 60, priority: "high", dueBy: at(2, 18, 0), projectId: projLaunch.id, requiresFocus: true },
    { title: "Review onboarding flow prototype", durationMin: 45, priority: "medium", projectId: projLaunch.id },
    { title: "Write launch announcement email", durationMin: 90, priority: "high", dueBy: at(4, 18, 0), projectId: projLaunch.id, requiresFocus: true },
    { title: "Prep Q3 deck slides", durationMin: 120, priority: "high", dueBy: at(1, 18, 0), projectId: projLaunch.id, requiresFocus: true, status: "scheduled" },
    { title: "Source 3 more design candidates", durationMin: 45, priority: "medium", projectId: projHiring.id },
    { title: "Write interview scorecard", durationMin: 30, priority: "medium", projectId: projHiring.id },
    { title: "Schedule final-round interviews", durationMin: 20, priority: "low", projectId: projHiring.id },
    { title: "Renew passport", durationMin: 30, priority: "medium", projectId: projPersonal.id, preferBy: at(20, 18, 0) },
    { title: "Book flights for offsite", durationMin: 30, priority: "medium", projectId: projPersonal.id },
    { title: "Reply to legal re: contract redlines", durationMin: 20, priority: "high", dueBy: at(1, 18, 0), sourceType: "signal" },
    { title: "Send follow-up to design agency", durationMin: 15, priority: "low", sourceType: "signal" },
    { title: "Review Q3 budget spreadsheet", durationMin: 45, priority: "medium" },
    { title: "Update team on launch timeline", durationMin: 20, priority: "medium", projectId: projLaunch.id },
    { title: "Plan offsite agenda", durationMin: 60, priority: "low", projectId: projPersonal.id },
    { title: "Read competitor launch retro", durationMin: 30, priority: "low" },
    { title: "1:1 prep notes", durationMin: 15, priority: "medium", status: "scheduled" },
    { title: "Clean up design system tokens doc", durationMin: 45, priority: "low", projectId: projLaunch.id },
    { title: "Call insurance about claim", durationMin: 20, priority: "medium", projectId: projPersonal.id, sourceType: "signal" },
  ];

  taskDefs.forEach((def) => {
    const task: Task = {
      id: id("task"),
      userId: USER_ID,
      projectId: null,
      notes: null,
      status: "backlog",
      durationIsEstimate: true,
      actualDurationMin: null,
      dueBy: null,
      preferBy: null,
      priority: "medium",
      requiresFocus: false,
      preferredWindow: null,
      splittable: false,
      minChunkMin: 30,
      category: "general",
      labels: [],
      scheduledEventId: null,
      sourceType: "native",
      sourceAccountId: null,
      sourceExternalId: null,
      sourceSignalId: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      ...def,
    };
    store.tasks.set(task.id, task);
  });

  // --- Signals (12) ---
  const signalDefs: Array<Partial<EmailSignal> & { subject: string; extractedTitle: string }> = [
    {
      from: "sarah@legalpartners.com",
      fromName: "Sarah Chen",
      subject: "Re: Contract redlines",
      snippet: "Can you review the redlines and get back to us by Monday?",
      sourceQuote: "get back to us by Monday",
      kind: "deadline",
      extractedTitle: "Reply to legal re: contract redlines",
      suggestedDurationMin: 20,
      confidence: 0.91,
      connectedAccountId: acctWork.id,
    },
    {
      from: "studio@designagency.com",
      fromName: "Nina at Studio",
      subject: "Following up on brand assets",
      snippet: "Just checking in — did you get a chance to look at the brand assets we sent?",
      sourceQuote: "did you get a chance to look at the brand assets",
      kind: "follow-up",
      extractedTitle: "Send follow-up to design agency",
      suggestedDurationMin: 15,
      confidence: 0.74,
      connectedAccountId: acctWork.id,
    },
    {
      from: "claims@insureco.com",
      fromName: "InsureCo Claims",
      subject: "Action needed on your claim",
      snippet: "Please call us at your earliest convenience to complete your claim.",
      sourceQuote: "call us at your earliest convenience",
      kind: "task",
      extractedTitle: "Call insurance about claim",
      suggestedDurationMin: 20,
      confidence: 0.68,
      connectedAccountId: acctPersonal.id,
    },
    {
      from: "alex@findtime.ai",
      fromName: "Alex (Growth)",
      subject: "Sync this week?",
      snippet: "Can we grab 30 min this week to align on growth metrics for launch?",
      sourceQuote: "grab 30 min this week to align",
      kind: "meeting-request",
      extractedTitle: "Sync with growth",
      suggestedDurationMin: 30,
      confidence: 0.85,
      connectedAccountId: acctWork.id,
      status: "converted",
    },
    {
      from: "recruiting@talentco.com",
      fromName: "TalentCo",
      subject: "3 new design candidates",
      snippet: "We've shortlisted 3 candidates matching your design req — let us know who to schedule.",
      sourceQuote: "shortlisted 3 candidates matching your design req",
      kind: "task",
      extractedTitle: "Source 3 more design candidates",
      suggestedDurationMin: 45,
      confidence: 0.72,
      connectedAccountId: acctWork.id,
    },
    {
      from: "no-reply@airline.com",
      fromName: "Airline Bookings",
      subject: "Your offsite travel options",
      snippet: "Fares for your requested dates are holding steady — book soon to lock in price.",
      sourceQuote: "book soon to lock in price",
      kind: "task",
      extractedTitle: "Book flights for offsite",
      suggestedDurationMin: 30,
      confidence: 0.55,
      connectedAccountId: acctPersonal.id,
    },
    {
      from: "passport-renewal@gov.example",
      fromName: "Passport Office",
      subject: "Renewal reminder",
      snippet: "Your passport expires in 6 months. Renew now to avoid delays.",
      sourceQuote: "expires in 6 months",
      kind: "deadline",
      extractedTitle: "Renew passport",
      suggestedDurationMin: 30,
      dueBy: at(20, 18, 0),
      confidence: 0.8,
      connectedAccountId: acctPersonal.id,
    },
    {
      from: "newsletter@producthunt.com",
      fromName: "Product Hunt Digest",
      subject: "Today's top launches",
      snippet: "See what shipped today across the community.",
      sourceQuote: "See what shipped today",
      kind: "ignore",
      extractedTitle: "Product Hunt digest",
      suggestedDurationMin: null,
      confidence: 0.3,
      connectedAccountId: acctPersonal.id,
      status: "ignored",
    },
    {
      from: "board@findtime.ai",
      fromName: "Board Ops",
      subject: "Board deck due",
      snippet: "Reminder: board deck is due end of next week.",
      sourceQuote: "due end of next week",
      kind: "deadline",
      extractedTitle: "Prep Q3 deck slides",
      suggestedDurationMin: 120,
      dueBy: at(1, 18, 0),
      confidence: 0.88,
      connectedAccountId: acctWork.id,
      status: "converted",
    },
    {
      from: "finance@findtime.ai",
      fromName: "Finance",
      subject: "Q3 budget — please review",
      snippet: "Please review the attached budget before Friday's close.",
      sourceQuote: "review the attached budget before Friday",
      kind: "task",
      extractedTitle: "Review Q3 budget spreadsheet",
      suggestedDurationMin: 45,
      confidence: 0.77,
      connectedAccountId: acctWork.id,
    },
    {
      from: "hr@findtime.ai",
      fromName: "People Team",
      subject: "Interview scorecards due",
      snippet: "Please submit scorecards within 24 hours of each interview.",
      sourceQuote: "submit scorecards within 24 hours",
      kind: "task",
      extractedTitle: "Write interview scorecard",
      suggestedDurationMin: 30,
      confidence: 0.7,
      connectedAccountId: acctWork.id,
    },
    {
      from: "assistant@customdomain.dev",
      fromName: "Ops Assistant",
      subject: "Offsite agenda draft",
      snippet: "Can you take a first pass at the offsite agenda this week?",
      sourceQuote: "take a first pass at the offsite agenda",
      kind: "task",
      extractedTitle: "Plan offsite agenda",
      suggestedDurationMin: 60,
      confidence: 0.6,
      connectedAccountId: acctImap.id,
    },
  ];

  signalDefs.forEach((def, i) => {
    const signal: EmailSignal = {
      id: id("sig"),
      userId: USER_ID,
      connectedAccountId: acctPersonal.id,
      messageId: `msg_${i}`,
      threadId: `thread_${i}`,
      from: "",
      fromName: "",
      receivedAt: subDays(new Date(), i).toISOString(),
      snippet: "",
      sourceQuote: "",
      kind: "task",
      suggestedDurationMin: null,
      dueBy: null,
      confidence: 0.5,
      status: "new",
      createdTaskId: null,
      createdEventId: null,
      reviewedAt: null,
      createdAt: now,
      ...def,
    };
    store.signals.set(signal.id, signal);
  });

  // --- Notifications (4) ---
  const notificationDefs: Array<Partial<Notification> & { type: Notification["type"]; title: string; body: string }> = [
    {
      type: "plan.ready",
      title: "Your daily plan is ready",
      body: "4 changes proposed for today. Review and apply when ready.",
      actionLabel: "Review",
      actionHref: "/app/plan",
    },
    {
      type: "signal.new",
      title: "3 new signals from Work",
      body: "AI found 3 new commitments in your inbox.",
      actionLabel: "Review",
      actionHref: "/app/signals",
      read: true,
      readAt: now,
    },
    {
      type: "conflict.detected",
      title: "Thursday is over capacity",
      body: "Thursday needs 9h 15m against 7h 30m of capacity.",
      actionLabel: "Resolve",
      actionHref: "/app/calendar/week",
    },
    {
      type: "account.error",
      title: "Custom account needs attention",
      body: "Authentication failed for ajay@customdomain.dev.",
      actionLabel: "Reconnect",
      actionHref: "/app/settings/accounts",
    },
  ];

  notificationDefs.forEach((def) => {
    const notification: Notification = {
      id: id("notif"),
      userId: USER_ID,
      read: false,
      readAt: null,
      actionLabel: null,
      actionHref: null,
      createdAt: now,
      ...def,
    };
    store.notifications.set(notification.id, notification);
  });

  markSeeded();
}

export const DEMO_USER_ID = USER_ID;
