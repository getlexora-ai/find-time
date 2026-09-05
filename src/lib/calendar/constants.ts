/**
 * Calendar grid geometry constants.
 *
 * `DEFAULT_HOUR_HEIGHT` is the single source of truth for row density (px per
 * hour). It backs the `--ft-hour-height` CSS variable that every grid
 * component writes onto its own root so a later Appearance/density setting
 * can override it without touching this file.
 */
export type CalendarView = "day" | "week" | "month";

export const DEFAULT_HOUR_HEIGHT = 64;

/** Drag/resize snap increment, in minutes. */
export const SNAP_MINUTES = 15;

/** Floor for resize so an event can never be dragged to zero/negative duration. */
export const MIN_EVENT_DURATION_MINUTES = 15;

/** Grid covers a full real day: hour rows 0..23. */
export const HOURS: number[] = Array.from({ length: 24 }, (_, i) => i);

export const CSS_HOUR_HEIGHT_VAR = "--ft-hour-height";
