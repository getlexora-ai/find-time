# Find time — Calendar design spec

**Files**
- `calendar.html` — working, responsive, self-contained implementation
- `calendar-design-board.html` — annotated static mockups of every surface
- `calendar-design-spec.md` — this document

**Stack (fixed — matches `landing.html` / `new dashboard.html`)**

```html
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://code.iconify.design/iconify-icon/2.1.0/iconify-icon.min.js"></script>
```

No build step, no third CDN, no external stylesheet. `font-family:'JetBrains Mono',monospace`
declared inline on `<body>` (no webfont is loaded in the reference files either — the platform
mono is the intended fallback). Base size `text-xs`, `antialiased`,
`selection:bg-[#ccff00] selection:text-[#121212]`. Icons are `solar:*` line icons at
`stroke-width="1.5"`.

---

## 1. Tokens

### 1.1 Colour

| Token | Value | Used for |
|---|---|---|
| Canvas | `#2047e6` | Page background (never a panel background) |
| Canvas gradient | `linear-gradient(135deg,rgba(9,26,102,.12),rgba(32,71,230,.96))` | Depth on the canvas |
| Marquee bar | `#173abf` @ 90% + `backdrop-blur-xl` | Top ticker |
| Mobile nav bar | `#142d99` @ 95% + `backdrop-blur-xl` | Bottom nav |
| **Surface / black** | `#121212` | Every calendar grid, card, popover, sheet |
| Surface recessed | `#0e0e0e` | Header rows, hour gutter, week-number gutter, card footers |
| Surface other-month | `#0d0d0d` | Out-of-month day tiles |
| Surface input | `#1d1d1d` | `<select>` backgrounds (native menus need an opaque bg) |
| **Surface / light** | `#f4f4f4` | Day-agenda body only |
| Light card | `#ffffff` | Event cards inside the agenda |
| Light recessed | `#ececec` | Free-gap and break rows inside the agenda |
| **Accent / lime** | `#ccff00` | Today, primary CTA, AI, active tab, focus ring |
| Accent glow | `shadow-[0_0_16px_rgba(204,255,0,.55)]` | Today chip, selected day pill |
| CTA glow | `shadow-[0_8px_24px_rgba(204,255,0,.16)]` | Lime buttons |
| **Alert / orange** | `#ff4400` | Conflicts, current-time line, destructive actions, unread dot |
| Alert on light | `#cc3600` | The same alert, as *text* on `#ffffff` / `#f4f4f4` (see §6) |
| Scrim | `#07123f` @ 70% + `backdrop-blur-sm` | Behind modals and sheets |
| Hairline | `rgba(255,255,255,.10)` | Grid seams and all borders |
| Hover fill | `#1a1a1a` (dark) / `#fafafa` (light) | Tile and row hover |

Text ramp on dark: `text-white` → `text-white/85` (chip titles) → `text-white/55` (body)
→ `text-white/45` (labels) → `text-white/35` (times) → `text-white/25` (gutters)
→ `text-white/20` (other-month dates).
On light: `text-[#121212]` → `/70` → `/60` (descriptions, metadata, time gutter)
→ `/50` (duplicated / decorative values only).

> The dashboard uses `/45` and `/40` for agenda metadata. Those measure 2.98:1 and 2.61:1 —
> below AA. This spec deliberately deviates to `/60` (4.77–4.88:1) on the day agenda, which
> is the densest reading surface in the product. The shift is small enough to be invisible
> next to `new dashboard.html` and is the one intentional divergence from it.

### 1.2 Category colours

| Key | Label | Hex | Block fill | Chip on light |
|---|---|---|---|---|
| `deep` | Deep work | `#ccff00` | `rgba(204,255,0,.16)` | `bg-[#ccff00]/70` |
| `design` | Design | `#c8c8ff` | `rgba(200,200,255,.16)` | `bg-[#c8c8ff]/70` |
| `research` | Research | `#ffb39a` | `rgba(255,179,154,.16)` | `bg-[#ffb39a]/70` |
| `sync` | Meetings | `#ffd600` | `rgba(255,214,0,.16)` | `bg-[#ffd600]/70` |
| `admin` | Admin | `#ff7040` | `rgba(255,112,64,.16)` | `bg-[#ff7040]/70` |

Five categories, deliberately. Every one is drawn from the reference palette, and
`#ff4400` is held back so orange always and only means *conflict*.

**Event kinds** are orthogonal to category and are drawn with shape, not hue:

| Kind | Treatment | Glyph |
|---|---|---|
| `event` | Category tint + 2px category spine | — |
| `focus` | Same, plus `ring-1 ring-[#ccff00]/40` | `solar:shield-check-linear` |
| `ai` | Dashed lime border, `bg-[#ccff00]/10`, lime text | `solar:magic-stick-3-linear` |
| `break` | Dashed `border-white/15`, `bg-white/[0.03]`, muted | `solar:cup-hot-linear` |
| conflict flag | `ring-1 ring-[#ff4400]` on top of any of the above | `solar:danger-triangle-linear` |

### 1.3 Type

| Role | Recipe |
|---|---|
| Page heading | `text-2xl sm:text-3xl font-medium leading-tight tracking-tight` |
| Card heading | `text-lg font-medium tracking-tight` |
| Big number | `text-2xl font-medium tracking-tight` |
| Body | inherited `text-xs` (12px), `leading-relaxed` for prose |
| Eyebrow / label | `uppercase tracking-widest` (`.1em`) or `tracking-[0.16rem]` |
| Marquee | `uppercase tracking-[0.18rem]` |
| Telemetry | `text-[10px] uppercase`, e.g. `DAY.252 / WK.37 / CAP.08H / UTC.14:22` |
| Micro | `text-[10px]` — chip times, week numbers, gutter labels |

Uppercase and wide tracking are reserved for *labels and telemetry*. Headings, event
titles and body copy stay sentence case — same split as the dashboard.

### 1.4 Spacing, radius, elevation

- Page padding `p-4 sm:p-6 lg:p-8`; card padding `p-4 sm:p-5`; sheet padding `p-5`.
- Radii: `rounded-2xl` (grid cards, sheets, popovers) · `rounded-xl` (inner cards, banners)
  · `rounded-lg` (buttons, blocks, inputs) · `rounded-md` (month chips, day numbers)
  · `rounded-full` (pills, dots, toggles).
- Elevation is `shadow-2xl` + a 1px `border-white/10` on a near-black panel — no mid-grey
  drop shadows. Glass panels use `bg-white/[0.05–0.07] + backdrop-blur-md`.
- **Time rhythm:** `ROW = 56px` per hour; day window `07:00–21:00`; snap `15 min`.

### 1.5 Canvas / frame / marquee recipes (copy verbatim)

```html
<!-- body -->
<body class="min-h-screen overflow-x-hidden bg-[#2047e6] text-xs text-white antialiased
             selection:bg-[#ccff00] selection:text-[#121212]"
      style="font-family:'JetBrains Mono',monospace;
             background-image:radial-gradient(rgba(255,255,255,0.14) 1px,transparent 1px),
                              linear-gradient(135deg,rgba(9,26,102,0.12),rgba(32,71,230,0.96));
             background-size:20px 20px,cover;">

<!-- 45° hatch overlay -->
<div class="pointer-events-none fixed inset-0 z-0 opacity-70"
     style="background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.025) 0,
            rgba(255,255,255,.025) 1px,transparent 1px,transparent 9px);"></div>

<!-- frame: crosshair + four lime corner brackets -->
<div class="pointer-events-none fixed inset-3 z-0 border border-white/10 sm:inset-5 lg:inset-7">
  <div class="absolute left-1/2 top-0 h-full w-px bg-white/5"></div>
  <div class="absolute left-0 top-1/2 h-px w-full bg-white/5"></div>
  <div class="absolute left-0  top-0    h-5 w-5 border-l-2 border-t-2 border-[#ccff00]"></div>
  <div class="absolute right-0 top-0    h-5 w-5 border-r-2 border-t-2 border-[#ccff00]"></div>
  <div class="absolute bottom-0 left-0  h-5 w-5 border-b-2 border-l-2 border-[#ccff00]"></div>
  <div class="absolute bottom-0 right-0 h-5 w-5 border-b-2 border-r-2 border-[#ccff00]"></div>
</div>

<!-- marquee: two identical spans, translateX loop at -0.35px/frame -->
<div class="relative z-50 overflow-hidden border-b border-white/10 bg-[#173abf]/90 py-2 backdrop-blur-xl">
  <div id="marquee" class="flex w-max whitespace-nowrap uppercase tracking-[0.18rem] text-[#ccff00]/80">
    <span class="pr-16">…phrases separated by //…</span>
    <span class="pr-16">…same phrases again…</span>
  </div>
</div>
```

Marquee copy is *calendar telemetry*, not a slogan:
`Calendar synced // 03 focus blocks protected this week // 06h 40m free on thursday // AI scheduler online //`

---

## 2. Component inventory

### 2.1 Tile grid (the month surface)

```html
<div class="grid gap-px bg-white/10" style="grid-template-columns:2.25rem repeat(7,minmax(0,1fr))">
```
The parent's background shows through the 1px gaps — the seams *are* the grid lines.
Same trick as the landing page's feature grid (`gap-px` on `bg-white/15`). Every child
must paint its own opaque background or the seam swallows it.

### 2.2 Day tile

```html
<div class="daytile group relative flex min-h-[8.75rem] cursor-pointer flex-col gap-1 p-2
            bg-[#121212] transition hover:-translate-y-px hover:bg-[#1a1a1a]">
```
- Other-month: `bg-[#0d0d0d]`, date `text-white/20`.
- Date numeral: `flex h-6 min-w-[1.5rem] items-center justify-center px-1 text-white/55`.
- **Today:** `rounded-md bg-[#ccff00] px-1 font-medium text-[#121212] shadow-[0_0_16px_rgba(204,255,0,.55)]`.
- A `+` button appears on `group-hover` in the top-right corner.
- Maximum 3 chips, then `+N more` pinned with `mt-auto`.

### 2.3 Event chip (month)

```html
<button class="evt flex w-full items-center gap-1.5 rounded-md bg-white/[0.06] px-1.5 py-1
               text-left transition hover:bg-white/[0.12]">
  <span class="h-1.5 w-1.5 shrink-0 rounded-full" style="background:{category}"></span>
  <span class="min-w-0 flex-1 truncate text-white/85">{title}</span>
  <!-- optional shield -->
  <span class="hidden shrink-0 text-[10px] text-white/35 2xl:inline">{start}</span>
</button>
```
Colour is a 6px dot, never a fill — three chips stacked in a 140px column still read as text.
Conflict adds `ring-1 ring-[#ff4400]/70`. The time is dropped below `2xl` to protect the title.

### 2.4 Time grid + hour lines

Hour lines are two stacked repeating gradients on the column itself, so 14 hours × 7 days
costs zero DOM nodes:

```css
background-image:
  repeating-linear-gradient(to bottom, rgba(255,255,255,.09) 0 1px, transparent 1px 56px),
  repeating-linear-gradient(to bottom, transparent 0 28px, rgba(255,255,255,.035) 28px 29px, transparent 29px 56px);
```

### 2.5 Time gutter

`4rem` of `#0e0e0e`; each hour is a `relative` box of `height:56px` with the label
`absolute right-2 -top-1.5`, so the numeral straddles its own hour line and reads as a
boundary rather than a row label.

### 2.6 Week / day block

```html
<button class="evt absolute overflow-hidden rounded-lg border border-white/10 p-2 text-left
               transition hover:-translate-y-px hover:border-white/25"
        style="top:{(start−07:00)/60×56}px; height:{dur/60×56 − 2}px;
               left:calc({col×(100/cols)}% + 2px); width:calc({100/cols}% − 4px);
               background:rgba(R,G,B,.16); border-left:2px solid {category}">
```
Blocks under 46px tall drop their time line and show the title only.
Overlap layout: sort by start, group into clusters of mutually-overlapping events, greedily
assign the first column whose last end ≤ this start, then divide 100% by the cluster's
column count.

### 2.7 Current-time line

```html
<div class="pointer-events-none absolute left-0 right-0 z-20" style="top:{minutes→px}">
  <div class="relative h-px bg-[#ff4400]">
    <span class="absolute -left-1 -top-[3px] h-[7px] w-[7px] rounded-full bg-[#ff4400] shadow-[0_0_10px_#ff4400]"></span>
    <span class="absolute -top-2 right-2 rounded bg-[#ff4400] px-1.5 py-0.5 text-[10px] text-[#121212]">14:22</span>
  </div>
</div>
```
Rendered **only inside today's column**, so it can never be mistaken for a divider. The
time chip appears in day view only (in week view seven chips would be noise).

### 2.8 View switcher (segmented control)

```html
<div class="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1 backdrop-blur-md" role="tablist">
  <button role="tab" aria-selected="true"
          class="h-8 rounded-md px-3 bg-[#ccff00] font-medium text-[#121212] shadow-[0_0_16px_rgba(204,255,0,.35)]">Month</button>
  <button role="tab" aria-selected="false"
          class="h-8 rounded-md px-3 text-white/55 transition hover:bg-white/10 hover:text-white">Week</button>
</div>
```
Date nav (`‹ Today ›`) uses the identical shell so the two controls read as siblings.

### 2.9 Mini-month (sidebar)

`grid grid-cols-7` inside a `rounded-xl border border-white/10 bg-[#121212]/70` card.
Cells are `h-7`, `text-[11px]`. Today = solid lime; selected = `ring-1 ring-[#ccff00]/60`;
any day with events gets a 2px lime dot at `bottom-0.5`. It navigates the calendar without
changing the current view grain.

### 2.10 Day pill (mobile week strip)

```html
<button class="flex min-w-[3.6rem] flex-col items-center gap-1 rounded-xl border px-2 py-2.5
               border-[#ccff00] bg-[#ccff00] text-[#121212] shadow-[0_0_16px_rgba(204,255,0,.35)]">
  <span class="uppercase tracking-widest">Wed</span>
  <span class="text-sm font-medium">9</span>
  <span class="flex h-1 items-center gap-0.5"><!-- up to 3 dots --></span>
  <span class="text-[10px]">6 evts</span>
</button>
```
Unselected: `border-white/10 bg-white/5 text-white/60`. The row is
`overflow-x-auto` with `no-scrollbar`. 58px tall — a comfortable thumb target.

### 2.11 Agenda row (light card)

```html
<div class="grid grid-cols-[3.25rem_minmax(0,1fr)] sm:grid-cols-[4.5rem_minmax(0,1fr)]">
  <div class="border-r border-[#121212]/10 px-3 py-5 text-right text-[#121212]/40 sm:px-4">09:00</div>
  <div class="p-3 sm:p-4"><!-- card --></div>
</div>
```
Event card: `flex gap-3 rounded-xl border border-[#121212]/10 bg-white p-4 shadow-sm
hover:-translate-y-0.5 hover:shadow-md`, with a `w-1 self-stretch rounded-full` spine in the
category colour. Free gap: `border-dashed border-[#121212]/20 bg-[#ececec]` labelled
`free — 45m` and clickable to create.

> **Gotcha, learned the hard way:** the agenda card must **not** carry `overflow-hidden`.
> `overflow:hidden` makes the card a scroll container, and the `sticky top-16` date header
> then pins 64px below the card's own top, opening a visible gap. Round the corners on the
> children (`rounded-t-2xl` on the header, `overflow-hidden rounded-b-2xl` on the body) instead.

### 2.12 Event popover (desktop, ≥1024px)

`fixed z-[85] w-[21rem] overflow-hidden rounded-2xl border border-white/10 bg-[#121212] shadow-2xl`,
opening with a 4px full-bleed bar in the category colour. Positioned from the trigger's
`getBoundingClientRect()`: 12px to its right, flipping left and clamping vertically when it
would leave the viewport. Read-only — Edit and Reschedule are explicit second steps.

### 2.13 Bottom sheet (mobile) / modal (desktop)

```html
<div class="fixed inset-0 z-[86] hidden items-end justify-center bg-[#07123f]/70 backdrop-blur-sm
            sm:items-center sm:p-5">
  <div class="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-white/10 bg-[#121212] p-5
              shadow-2xl sm:max-w-lg sm:rounded-2xl">
    <div class="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20 sm:hidden"></div>
```
One chassis, four payloads: event detail, create/edit, Ask Find time, month picker.
Dismiss on scrim click and on `Escape`. The AI panel uses the same element but adds
`lg:items-stretch lg:justify-end` + `lg:h-full lg:w-[27rem] lg:rounded-l-2xl` to become a
right-hand drawer on desktop.

### 2.14 Toast

`fixed bottom-28 lg:bottom-8 left-1/2 -translate-x-1/2 rounded-xl border border-white/10
bg-[#121212] px-4 py-3 shadow-2xl`, `role="status" aria-live="polite"`, lime check icon,
fades in for 2.4s. Every mutation confirms in the plan's own vocabulary
("3 changes applied · 0 conflicts", "Time found at 08:00. No conflicts.").

---

## 3. Navigation model

```
state = { view: 'month' | 'week' | 'day', cursor: Date, selected: Date, loading: bool }
```

- **cursor** drives the visible period; **selected** drives the day shown in any agenda.
- `‹ / ›` steps a month, a week or a day depending on the current view.
- Month tile click → day view for that date (desktop) / expands the agenda below (mobile).
- `+N more` → day view for that date.
- Week/day column header click → selects that day.
- Mini-month or picker-sheet click → moves both cursor and selected, keeps the view.
- Every navigation is idempotent: `Today` resets cursor, selected and mini-month together.

---

## 4. Responsive rules

| Breakpoint | What changes | Why |
|---|---|---|
| **< 640px** | Week strip is the default view. Month renders dots instead of chips, with an agenda below. Every modal is a bottom sheet. Bottom nav + FAB. Sidebar, telemetry column and time grids are not rendered. Time gutter narrows to `3.25rem`. | A 50px column cannot hold a readable title, and a 56px-per-hour grid cannot hold a readable block. Below this width the honest primitive is a list. |
| **640 – 1023px** | Same structure; agenda gutter widens to `4.5rem`; compose becomes a centred modal; "New event" returns to the toolbar. | Enough width for a real dialog, not enough for a seven-column time grid. |
| **≥ 1024px (`lg`)** | Sidebar + mini-month appear; **month becomes the default view**; week and day time grids render; event clicks open an anchored popover instead of a sheet; AI panel becomes a right drawer. | A pointer can hit a 24px chip and hover a tile; a sheet would waste the space. |
| **≥ 1280px (`xl`)** | Telemetry column and the day-view right rail appear. | Pure context. Nothing functional is gated behind it. |
| **≥ 1536px (`2xl`)** | Month chips regain their start time. | Only at this width does a chip have room for a dot, a title and a time without truncating the title to nothing. |

Both layouts are always in the DOM, toggled with `hidden lg:block` / `lg:hidden`, so
resizing the window never needs a re-render and never loses state. The only
width check in JS is the initial default view and the popover-vs-sheet decision.

---

## 5. Interaction and motion

| Interaction | Behaviour |
|---|---|
| Tile / card hover | `hover:-translate-y-px` (tiles), `hover:-translate-y-0.5` (cards, buttons) |
| Lime button hover | `hover:-translate-y-0.5 hover:bg-[#d7ff33]` |
| Drag-to-create | Pointer down on empty grid → dashed lime ghost with a live `HH:MM–HH:MM` label, snapping to 15 min, 30 min minimum. Release opens compose pre-filled. A footer states the affordance in words for anyone who won't discover it. |
| Period navigation | 280ms skeleton, then the new period. Skeleton keeps the tile geometry so nothing reflows. |
| View switching | Instant — no skeleton. Changing grain should feel free. |
| AI request | 1300ms "Analysing" skeleton → proposal → Apply mutates state, jumps to the affected week, toasts the result. |
| Marquee | `requestAnimationFrame`, `translateX` at −0.35px/frame, resets at half the scroll width. |
| Time-grid scroll | On render, scrolled to 08:00 rather than 07:00 (deferred one tick — the Tailwind CDN applies `max-height`/`overflow` asynchronously). |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` collapses every animation and transition to 0.001ms, including the skeleton pulse. The marquee keeps translating but at that point it is the only thing moving. |

**Keyboard:** `M` / `W` / `D` switch view · `T` today · `N` new event ·
`←` `→` step the period · `⌘K` search · `Esc` closes any layer.
Shortcuts are suppressed while an input, textarea or select has focus.

---

## 6. Accessibility

- **Contrast** (measured, sRGB relative luminance):

  | Pair | Ratio | Verdict |
  |---|---|---|
  | `#ccff00` on `#121212` | **15.94:1** | AAA |
  | `#121212` on `#ccff00` | 15.94:1 | AAA |
  | `white/55` on `#121212` (body) | 6.18:1 | AA |
  | `white/45` on `#121212` (labels) | 4.55:1 | AA |
  | `#ff4400` on `#121212` | 5.42:1 | AA |
  | `#cc3600` on `#ffffff` | 5.13:1 | AA |
  | `#ff4400` on `#ffffff` | 3.45:1 | **fails — never used** |
  | `#2047e6` on `#ffffff` ("Protected") | 6.76:1 | AA |
  | `#121212/60` on `#f4f4f4` | 4.77:1 | AA |

  Values below `white/45` (`/35` times, `/25` gutters, `/20` other-month dates) are
  decorative or duplicate information carried elsewhere — never a sole carrier.
- **Orange is never body text on white.** `#ff4400` reads 3.45:1 on white, so on light
  surfaces the alert *text* switches to `#cc3600` (5.13:1) while the ring, spine and glyph
  stay `#ff4400`. On `#121212` the text colour stays `#ff4400` at 5.42:1.
- **Never colour alone.** Protected carries a shield, clash a triangle, AI a magic stick,
  break a cup. Category colour always appears next to its written label somewhere in the
  same view (sidebar list, agenda pill, popover eyebrow).
- **Focus.** A single global rule: `outline: 2px solid #ccff00; outline-offset: 2px` on
  `:focus-visible` for every interactive element — visible against both `#121212` and
  `#f4f4f4`.
- **Hit targets.** Mobile month cells 56px, day pills 58px, sheet buttons and inputs 44px,
  bottom-nav items 48px, FAB 44px. Desktop month chips are 24px tall but the entire tile is
  clickable, so a pointer user always has a large target.
- **Semantics.** View switcher is `role="tablist"` with `aria-selected`; the AI toggle is
  `role="switch"` with `aria-checked`; the toast is `role="status" aria-live="polite"`;
  sheets are `role="dialog" aria-modal="true"` with an `aria-label`; the loading grid sets
  `aria-busy="true"`; icon-only buttons all carry `aria-label`.
- **Escape always closes** the topmost layer, and scrim clicks close too — no dead ends.

---

## 7. Judgment calls

1. **Mobile defaults to Week, desktop to Month.** On a phone the useful question is "what is
   today and tomorrow?"; on a desktop it is "how is the month shaped?". The switcher is
   present in both, so the default is a starting point, not a limit.
2. **"Black background" was read as `#121212` panels floating on the blue canvas** — the
   dashboard's own "Plan with AI" card and the landing page's planner window, scaled up to
   hold a grid. The blue and its dot pattern stay visible around every card.
3. **The light `#f4f4f4` card survives in one place only** — the day agenda, where long
   titles, descriptions and metadata need a reading surface. Grids stay black; prose goes
   on white.
4. **Five categories, and `#ff4400` reserved.** Holding one palette colour back for
   conflicts is what lets a clash be unmistakable without a modal.
5. **Colour intensity is inverted from most calendars.** Blocks are 16%-tinted with a solid
   2px spine rather than fully filled, because a week of saturated blocks on a saturated blue
   canvas becomes unreadable. The spine carries the hue; the fill carries the text.
6. **Free time is a component.** "free — 45m" rows and dashed AI windows are drawn, labelled
   and clickable. For a product called Find time, empty space is the feature, so it is never
   rendered as nothing.
