export type EventCategory = 'focus' | 'meeting' | 'admin' | 'personal';

export type CalendarEvent = {
  id: string;
  title: string;
  /** ISO 8601 start time */
  start: string;
  /** ISO 8601 end time */
  end: string;
  category: EventCategory;
  /** true when the block was proposed by the planner and not yet confirmed */
  draft?: boolean;
};

export const CATEGORY_COLOR: Record<EventCategory, string> = {
  focus: '#6366f1',
  meeting: '#f97316',
  admin: '#64748b',
  personal: '#10b981',
};

export const CATEGORY_LABEL: Record<EventCategory, string> = {
  focus: 'Deep work',
  meeting: 'Meeting',
  admin: 'Admin',
  personal: 'Personal',
};
