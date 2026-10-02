-- find_time — 023 imported Google events keep no content.
--
-- Since this change, sync stores only when an imported event is (times,
-- free/busy, your RSVP, guest count, ids); title, notes, location and video
-- link are read live from Google per request (src/server/google/live-details.ts)
-- and never written. This scrubs what earlier syncs stored. The next sync would
-- blank each row anyway; this does it now, for rows sync may never touch again.
--
-- Apply together with the deploy that ships live-details.ts: an older build
-- reading these rows would show empty titles.

update calendar_events
   set title = '', description = null, location = null, conference_url = null
 where origin = 'imported'
   and (title <> '' or description is not null or location is not null or conference_url is not null);
