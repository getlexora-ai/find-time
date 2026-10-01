# Calendar — Nexus spec

The calendar's look and behaviour, written down once so the build follows it
instead of improvising. Visual source: `nexus-ai-data-pipeline-2.html` and the
**B · Nexus — Calendar** artboard (Trust Redesign canvas). Branch: `nexus-calendar`.

Scope is the calendar surface only: the week and day grids, tiles, creating,
moving and resizing, calendars, hours. Landing and phone chrome come later.

Decisions agreed 2026-10-01: the recommended option in every case.

---

## 1. Design system

One light theme. The seven switchable dark themes, the theme menu and the lime
accent go. Every value below lives in `src/design/tokens.ts`; components never
hard-code a colour, shadow or size.

### 1.1 Colour — monochrome, one meaning each

| Token | Value | Used for |
|---|---|---|
| `ground` | `#FAFAFA` + 45° hatch at 2% | page behind the frame |
| `frame` | `rgba(255,255,255,.6)` | the framed column the app sits in |
| `surface` | `#FFFFFF` | grid columns, cards, buttons |
| `ink` | `#171717` | text, primary buttons, focus tiles |
| `ink2` | `#525252` | secondary text on white |
| `muted` | `#737373` | captions, day names |
| `faint` | `#A3A3A3` | mono labels, hour numbers, brackets |
| `line` | `rgba(229,229,229,.9)` | every divider and hour line |
| `lineSoft` | `rgba(229,229,229,.45)` | half-hour lines |
| `hatch` | `rgba(0,0,0,.05)` 1px / 5px gap | routine & break tiles, off-hours |
| `accent` | `#EA580C` | 1px strokes and text only: proposal outline, now-line |

No coloured fills anywhere. Category colour is deliberately absent for now and
comes back later as one more token per category (`CATS[k].color`) without
touching any component.

**Orange (decided: A).** B uses orange for three things: the proposal tile's fill,
its dashed border, and the now-line with its time chip. The fill goes either
way. Options:
- **A (recommended):** orange survives only as a 1px stroke and text — the
  proposal's dashed outline and the now-line hairline. The now-time chip
  becomes ink with white text. No orange area anywhere.
- **B:** no orange at all — proposals are dashed ink outlines, the now-line is ink.

### 1.2 Type

- **Google Sans Flex** 400/500/600 for everything readable.
- **JetBrains Mono** 400/500 for times, dates, labels in caps, counts — tabular
  figures so 09:00 and 11:30 line up column to column.

| Role | Size / line | Weight | Font |
|---|---|---|---|
| KPI value | 30 / 30, −3% tracking | 600 | Sans |
| Section title | 15 / 20, −2% | 600 | Sans |
| Body, buttons | 13 / 18 | 500 | Sans |
| Tile title | 12 / 16 | 500 | Sans |
| Caption | 12 / 16 | 400 | Sans, `muted` |
| Tile meta, hours | 10 / 13 | 400 | Mono |
| Label (CAPS) | 10 / 14, +4% | 500 | Mono, `faint` |

### 1.3 Shape, depth, space

- Radius: 4 (chips, tiles' inner marks), 6 (tiles, buttons), 8 (popovers), 12 (sheets). Nothing round except dots.
- Shadows — the three from `beautiful-shadows`, nothing else:
  `sm` controls, meeting tiles, chips · `md` primary button, popovers · `lg` a tile while it is dragged, sheets.
- Frame: 1px `line` side rules, 14px corner brackets in `faint` on the outer
  frame only, 8px mini-brackets on the KPI strip. Not on every panel.
- Spacing: 4px base. Grid gutters 4px inside a column, 16/20/24 for panels.

### 1.4 Motion

160ms for presses and hovers, 200ms for popovers opening, 0 for drag (the tile
follows the pointer exactly), 180ms settle when a dropped tile snaps. Easing
`cubic-bezier(.2,.8,.2,1)`. Reduced motion: no transitions, same states.

---

## 2. The surface

```
┌ header: logo · Week | Day · ‹ › Today · 21 – 27 SEP 2026 · + New ┐
├ KPI strip: PLANNED · FOCUS PROTECTED · OPEN CAPACITY · PLAN HEALTH ┤
├ day header row: Mon 21 … Sun 27   (today = ink cell, white text)   ┤
├ all-day lane: all-day events + tasks with no time                  ┤
├ time grid: gutter 06:00 … 21:00 · columns · tiles · now-line       ┤
└ legend (mono): FOCUS · EVENT · TASK · ROUTINE · PROPOSED           ┘
```

The right-hand Ask panel stays as it is functionally; restyling it is out of
this scope.

---

## 3. Tiles

### 3.1 Kind decides the shape

Colour is not available as a channel, so every kind must be told apart by
fill, edge and glyph alone. That also means they survive greyscale and print.

| Kind | Fill | Edge | Text | Glyph | Reads as |
|---|---|---|---|---|---|
| `focus` | `ink` solid | none | white | lock if protected | the heaviest thing on the grid |
| `event` | `surface` | `sm` shadow | ink | — | a commitment with people |
| `task` | `surface` | 1px `line` inset | `ink2` | empty square → ✓ | yours to close |
| `routine` | `#F5F5F5` + hatch | 1px inset 8% | `ink2` | ↻ | backdrop |
| `break` | `#F5F5F5` + hatch | none | `muted` | cup | backdrop, lighter |
| `ai` (proposal) | `surface` | 1px dashed (accent or ink) | ink | ◌ | not real until approved |

The meta line (mono) says what the shape means: `09:00–11:00 · deep work`,
`proposed · needs OK`. Category is printed there, so when colour returns it is
already explained.

### 3.2 Height bands (56px per hour)

| Height | Shows |
|---|---|
| < 24px (15 min) | title only, single line, 10px |
| 24–45px | title + glyph on one row |
| 46–89px | title, meta line |
| ≥ 90px | title wraps to 2 lines, meta, lock/glyph pinned bottom |

### 3.3 States

| State | Treatment |
|---|---|
| hover | lift 1px, `sm` → `md` |
| selected (detail open) | 2px ink ring, 2px offset |
| keyboard focus | same ring |
| dragging | `lg` shadow, 96% opacity, follows pointer; origin keeps a dashed ghost |
| past (ended before now) | 55% opacity, still clickable |
| clash | a warning glyph + double outline, no fill change |
| read-only (from Google) | no resize handle, `not-allowed` cursor on drag, small source mark |
| saving | normal look; on failure snaps back and a toast says why |

### 3.4 Overlaps

Side-by-side columns (existing `laidOut`). At most 3 columns render; a fourth
collapses to a `+2` chip in the last column that opens a list popover. 4px gap
between neighbours so a packed day still reads as separate tiles.

---

## 4. Calendars — tiles from different sources

Today the database knows which calendar every event belongs to
(`calendar_events.calendar_id`), each calendar's Google colour (`calendars.color`)
and which calendar new events go to (`is_write_target`). The screen receives none
of it: `ApiEvent` has no `calendarId` or `allDay`. Fixing that is step 1 of this
section.

Rules:
- **Own blocks** (made in Find Time): fully editable, draggable, resizable.
- **Imported from Google**: Google owns title, time and existence; sync overwrites
  local changes. So they are read-only in the grid — no drag, no resize — and the
  detail popover says "Change this in Google Calendar".
- **Several Google calendars** (Work, Personal, Family…): each can be shown or
  hidden from the calendars list; hidden ones disappear from the grid **and** from
  the KPI numbers.
- **Where new events go**: the write-target calendar. With nothing connected,
  Find Time's own store.
- **How a tile shows its calendar (decided: A).**
  - **A (recommended):** a 6px square in the calendar's own Google colour in the
    tile's meta line, the detail popover and the calendars list. The user picked
    those colours in Google, so it identifies rather than decorates — and it is
    the only colour on the grid.
  - **B:** pure monochrome — the calendar's name in the detail popover only.

---

## 5. Hours — the visible window and working hours

Two different things, kept apart:

- **Your hours** — the window you allow yourself to be scheduled in, e.g.
  06:00–22:00. The grid draws exactly this window; it is the same height every
  week. (Today the grid stretches or shrinks to fit the events, so the page
  jumps from week to week.)
- **Working hours** — per weekday, inside that window (default Mon–Fri 9–18,
  `scheduler_profiles.work_hours`; null = non-working day).

Inside the window but outside working hours is drawn with the hatch, like B's
personal tiles but fainter: free to use, visibly "off". Non-working days are
hatched top to bottom.

| Situation | Behaviour |
|---|---|
| Event inside the window | drawn normally |
| Event starts before / ends after the window (e.g. 05:00 flight) | clipped at the edge with a `↑ 05:00` marker on the tile |
| Event entirely outside the window (23:30 call) | (decided: A) a pinned mono chip at the column's top or bottom edge, `1 after 22:00`, opens it. B: the window grows to include it, as today. |
| Overnight event (22:00 → 02:00) | shown in both days, each part clipped, with a `continues` / `from Mon` marker |
| Drag or resize toward the edge | stops at the edge; a hint reads `Your hours end at 22:00` |
| Drag-create outside working hours (but inside the window) | allowed, no warning — it's your time |
| Typing a time outside the window in the sheet | allowed after one confirm line, since flights and late calls are real |
| Find Time's AI | never places anything outside working hours unless you name the time; never outside the window |
| On open | scrolls to one hour before now on today's week, otherwise to the start of working hours |

The window is a setting (`dayStart`/`dayEnd`), defaulting to 06–22 until the
user sets it; working hours read from the scheduler profile.

---

## 6. Views and navigation

- **Week**: 7 columns while each stays ≥ 88px, otherwise 3 at a time, swiped.
  Decided: show weekends always (hatched when non-working), or default to the
  working days only with a toggle. Recommended: always 7, hatched.
- **Day**: one column, the same tiles, more room for meta.
- No month view. The date picker behind the title jumps to any week.
- Clicking a day header opens that day. Prev / next / Today; the range is shown
  mono, `21 – 27 SEP 2026`.
- Keyboard (web): `←/→` step, `T` today, `W`/`D` view, `N` new event, `Esc`
  closes / cancels a drag.

---

## 7. Creating

| Gesture | Result |
|---|---|
| Click an empty slot | quick-create popover at that time, 30 min, snapped to 15 |
| Drag on empty space | a ghost tile draws from press to pointer, 15-min snap, min 15 min, live label `Tue 10:15–11:30`; release opens quick-create with that range |
| `+ New` / `N` | the full sheet, prefilled with the next free 30 min in working hours |
| Phone | tap = quick-create; long-press then drag = draw |

Quick-create: title field (focused), kind chips (Event · Focus · Task ·
Routine), `Enter` saves, `More` opens the full sheet with the same values. The
tile appears instantly; if the save fails it is removed and a toast says why.

---

## 8. Moving and resizing

- Press and move > 4px on a tile = drag. Less = a click (opens detail).
- Drag moves through time (15-min snap) and, in week view, across days. A label
  rides with the tile: `Thu 10:15–11:00`. The origin keeps a dashed ghost.
- Bottom edge (6px hit area, cursor `ns-resize`) resizes the end; top edge the
  start. Minimum 15 min.
- `Esc` mid-drag puts it back. Release saves optimistically; a toast offers
  `Undo` for 5 s; a failed save snaps it back.
- What may move:

| Tile | Drag / resize |
|---|---|
| own event, task, focus | yes (protection stops the AI, not you) |
| proposal | yes — it stays a proposal at the new time |
| routine (repeats) | yes, then ask: `This one` / `All repeats` |
| imported from Google | no — cursor says why, detail links to Google |
| past | yes, no warning |

- Dropping onto another tile is allowed; the two sit side by side and, if both
  are fixed commitments, get the clash mark.
- Keyboard: focus a tile, `↑/↓` moves 15 min, `Shift+←/→` moves a day,
  `Alt+↑/↓` resizes. Same save and undo.

---

## 9. Other states

- **Loading**: hour grid with three grey placeholder tiles per day, no shimmer.
- **Empty week**: grid stays; one line in the KPI strip says `Nothing planned yet`.
- **Sync error**: a strip above the grid, `Google sync failed · Retry`; imported
  tiles keep showing their last known state.
- **No Google connected**: calendars list shows `Connect Google Calendar`; the
  grid works on Find Time's own blocks.

---

## 10. Build order

Each step is committed and checked (typecheck, lint, web export, screenshot at
1440 and 390) before the next.

1. Tokens + fonts; one theme; remove theme menu and dark themes.
2. Re-skin the frame, header, KPI strip, day header, grid lines, now-line.
3. Tiles: the kind table, height bands, states, overlap cap.
4. Hours: fixed window, working-hours hatch, edge chips, clipping, scroll on open.
5. Calendars: `calendarId` / `allDay` on the wire, all-day lane, show/hide,
   read-only imported tiles, source mark.
6. Create: click and drag-to-draw, quick-create popover.
7. Move and resize: drag, edges, undo, routine scope, keyboard.
8. Pass with `no-ai-design-slop` against the B artboard; fix what it finds.

---

## 11. v2 rules — data that tells the truth, actions you use daily

Added 2026-10-01 after the first build. Server side: `db/019_calendar_v2.sql`
(apply before deploying), `src/server/google/{map,sync,push}.ts`,
`src/server/calendar/settings-repo.ts`, `/api/calendar/settings`.

### 11.1 Time zones
- Every time is shown in **your** zone (`scheduler_profiles.timezone`, detected
  from the device on first run, changeable in settings).
- Google events are converted from the organiser's zone into yours at sync,
  DST-correct. A 09:00 New York meeting is 15:00 on a Berlin calendar.
- Find Time's own blocks are plans in local time: "focus 09:00–11:00" stays at
  09:00 wherever you are.
- Changing zone re-syncs every Google calendar in full.
- If the device's zone differs from your setting, a one-line notice offers to
  switch ("You're in Lisbon — show times in Lisbon?").

### 11.2 Repeats
- Google series arrive as single occurrences: a meeting moved or cancelled for
  one week is exactly that on the grid.
- Find Time repeats: moving, resizing or deleting one occurrence asks
  **This one · This and following · All**.
  - This one: the date joins the series' cancelled dates (`exdates`) and a one-off
    takes its place (linked by `seriesId`). Deleting this one only adds the date.
  - This and following: the series ends the day before (`UNTIL`), a new series
    starts on that date with the change.
  - All: the series' times change (days never change by drag).

### 11.3 Invites and free/busy
- Declined: drawn struck-through and faint; never blocks time, never clashes,
  never counts in planned hours or capacity.
- "Show as free" in Google: drawn with a hollow outline; never clashes; doesn't
  reduce capacity.
- Not yet answered: a small "?" before the title.
- Tentative counts as busy.
- Detail shows: your answer, guests count, location, a Join link for video.

### 11.4 Clashes
- Between two busy blocks as before, **plus** a proposal that would land on a busy
  block: it shows "would clash with …" in its detail and on the tile, before you
  approve it.

### 11.5 Undo and done
- Delete has Undo (5 s), like move and resize. Undoing a delete recreates the
  block with the same fields.
- Tasks tick off: the checkbox on the tile and in the detail. Done tasks are
  struck through, stay where they are, and leave the planned-hours count.

### 11.6 All-day, duplicate, copy
- Create all-day blocks: the all-day lane is clickable; the sheet has an
  All-day switch.
- Dragging a timed block into the all-day lane makes it all-day; dragging an
  all-day chip onto the hours makes it a 1-hour block there.
- Alt-drag (desktop) duplicates instead of moving. "Duplicate" in the detail
  copies to the next day; the copy is selected.

### 11.7 Settings that follow you
Your hours, working hours (editable per day), zone, first day of week, 12/24-hour
clock, weekly hours target and focus goal live in your profile, not the device.
The device keeps a copy for offline start.

### 11.8 Write-back (opt-in)
"Block focus time in Google": one-off protected focus blocks become private,
busy events on your primary Google calendar, so colleagues see you as taken.
Off by default. Needs reconnecting Google once (write permission). Repeating
focus blocks are not written (Google would hand each occurrence back as a
separate event).

### 11.9 Smaller rules
- **Buffers**: "Find a time" leaves your default buffer (profile, 10 min) after
  a meeting. Back-to-back meetings with no gap show a thin notch between them.
- **The past**: creating or moving into the past is allowed; the toast says
  "in the past".
- **Zoom**: compact / comfortable / roomy hour height (40 / 56 / 72 px), per
  device. Shift-drag skips the 15-minute snap (5-minute steps).
- **12/24-hour** clock and **Sunday-first** weeks follow the settings everywhere
  (gutter, tiles, headers, picker).
- **First run**: no Google and no blocks → the grid shows one line and two
  actions: Connect Google Calendar, or Plan my week.
- **Targets**: weekly planned-hours target and focus goal come from settings;
  the defaults (40 h, 14 h) apply until you set them.

## 12. Colour (decided 2026-10-01: "add some nice colours")

The structure stays Nexus: white surfaces, hairlines, ink type, three shadows.
Colour now carries **category**, and kind still carries **shape**. Each category
has three tones in `tokens.ts` `CATS`: `tint` (fill), `line` (edges, marks),
`ink` (text on the tint, AA). Orange stays reserved for proposals and now. Never
a fill.

| Category | tint | line | ink | solid (focus) |
|---|---|---|---|---|
| Deep work | #EAF1FF | #3B82F6 | #1E3A8A | #2563EB |
| Meetings | #EFEEFF | #6366F1 | #312E81 | #4F46E5 |
| Design | #FCEEF5 | #DB2777 | #831843 | #BE185D |
| Research | #E7F6F3 | #0D9488 | #134E4A | #0F766E |
| Admin | #FEF6DC | #CA8A04 | #713F12 | #A16207 |

How kinds use it:
- focus: solid category colour, white text.
- event: the category tint, `sm` shadow, ink text.
- task: white, the category line as the checkbox and hairline.
- routine: the tint with the hatch.
- break: neutral grey hatch, no colour (recovery is not a category).
- proposal: white, dashed orange.

Declined events lose their colour (grey). The KPI planned bar, the legend and the
week's mini-month dots use the same category colours. The Google calendar
square stays the calendar's own colour.
