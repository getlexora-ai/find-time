/**
 * Self-check for src/server/google/map.ts.
 *   node src/server/google/map.check.mjs
 */
import assert from 'node:assert/strict';

const { toRow, detailsOf } = await import('./map.ts');
const ctx = { userId: 'g_1', calendarId: 'cal_1', connectedAccountId: 'acct_1' };

// timed event
const timed = toRow(
  {
    id: 'ev1',
    status: 'confirmed',
    summary: '  Standup  ',
    start: { dateTime: '2026-09-09T09:00:00+02:00', timeZone: 'Europe/Berlin' },
    end: { dateTime: '2026-09-09T09:15:00+02:00' },
    etag: '"abc"',
    sequence: 3,
    updated: '2026-09-08T12:00:00.000Z',
  },
  ctx,
);
assert.equal(timed.deleted, false);
assert.equal(detailsOf({ summary: '  Standup  ' }).title, 'Standup');
// nothing about what the event is reaches the database row
for (const k of ['title', 'description', 'location', 'conference_url']) assert.ok(!(k in timed.row), k);
assert.equal(timed.row.all_day, false);
// Google's instant is re-stamped as the event's LOCAL clock with a Z, matching
// the wall-clock convention the client reads (src/calendar/api-adapter.ts).
// Storing the raw +02:00 here made a 09:00 Berlin meeting render at 07:00.
assert.equal(timed.row.start_at, '2026-09-09T09:00:00.000Z');
assert.equal(timed.row.end_at, '2026-09-09T09:15:00.000Z');
assert.equal(timed.row.time_zone, 'Europe/Berlin');
assert.equal(timed.row.status, 'confirmed');
assert.equal(timed.row.provider_event_id, 'ev1');
assert.equal(timed.row.provider_etag, '"abc"');
assert.equal(timed.row.provider_sequence, 3);
assert.equal(timed.row.rrule, null);
assert.equal(timed.row.recurrence_unsupported, false);

// all-day event: start inclusive, end exclusive, both preserved
const allday = toRow(
  { id: 'ev2', start: { date: '2026-09-10' }, end: { date: '2026-09-11' } },
  ctx,
);
assert.equal(allday.row.all_day, true);
assert.equal(allday.row.start_at, '2026-09-10T00:00:00.000Z');
assert.equal(allday.row.end_at, '2026-09-11T00:00:00.000Z');
assert.equal(allday.row.status, 'confirmed'); // default when absent

// all-day with no end -> +1 day
const allday1 = toRow({ id: 'ev3', start: { date: '2026-12-31' } }, ctx);
assert.equal(allday1.row.end_at, '2027-01-01T00:00:00.000Z');

// recurring master -> rrule stored, marked unsupported
const rec = toRow(
  {
    id: 'ev4',
    summary: 'Weekly sync',
    start: { dateTime: '2026-09-09T10:00:00Z' },
    end: { dateTime: '2026-09-09T10:30:00Z' },
    recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=WE', 'EXDATE;TZID=UTC:20260916T100000'],
  },
  ctx,
);
assert.equal(rec.row.rrule, 'FREQ=WEEKLY;BYDAY=WE');
assert.equal(rec.row.recurrence_unsupported, true);

// cancelled -> delete marker, no row
const cancelled = toRow({ id: 'ev5', status: 'cancelled' }, ctx);
assert.equal(cancelled.deleted, true);
assert.equal(cancelled.providerEventId, 'ev5');
assert.ok(!('row' in cancelled));

// empty summary -> placeholder, never empty title (NOT NULL column)
assert.equal(detailsOf({ id: 'ev6' }).title, '(no title)');


// v2: times land in the USER's zone, not the organiser's.
const ny = toRow(
  {
    id: 'ev_ny',
    summary: 'NY standup',
    start: { dateTime: '2026-10-05T09:00:00-04:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-10-05T09:30:00-04:00', timeZone: 'America/New_York' },
  },
  { ...ctx, userZone: 'Europe/Berlin' },
);
assert.equal(ny.row.start_at, '2026-10-05T15:00:00.000Z');
assert.equal(ny.row.end_at, '2026-10-05T15:30:00.000Z');

// DST: the same 09:00 New York meeting after Europe's switch but before the US's.
const dst = toRow(
  {
    id: 'ev_dst',
    summary: 'gap week',
    start: { dateTime: '2026-10-26T09:00:00-04:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-10-26T10:00:00-04:00', timeZone: 'America/New_York' },
  },
  { ...ctx, userZone: 'Europe/Berlin' },
);
assert.equal(dst.row.start_at, '2026-10-26T14:00:00.000Z');

// v2: free/busy, your RSVP, the video link, attendees.
const invite = toRow(
  {
    id: 'ev_inv',
    summary: 'Offsite planning',
    start: { dateTime: '2026-10-05T10:00:00+02:00' },
    end: { dateTime: '2026-10-05T11:00:00+02:00' },
    transparency: 'transparent',
    hangoutLink: 'https://meet.google.com/abc-defg-hij',
    attendees: [
      { email: 'a@x.com', responseStatus: 'accepted' },
      { email: 'me@x.com', self: true, responseStatus: 'declined' },
      { email: 'room@x.com', resource: true, responseStatus: 'accepted' },
    ],
  },
  ctx,
);
assert.equal(invite.row.transparency, 'transparent');
assert.equal(invite.row.response_status, 'declined');
assert.equal(detailsOf({ hangoutLink: 'https://meet.google.com/abc-defg-hij' }).conference_url, 'https://meet.google.com/abc-defg-hij');
assert.equal(invite.row.attendee_count, 2);
assert.equal(timed.row.transparency, 'opaque');
assert.equal(timed.row.response_status, null);

console.log('map.check: ok');
