# What Find time records, and why

`docs/ai-learning.md` describes how the agent improves from corrections. This
document covers the layer underneath it: what gets written down, in what shape,
and what question that shape is meant to answer.

Code: `src/server/ai/capture.ts` (writers), `capture-core.ts` (shaping, pure),
`slotNotes` in `scoring.ts`. Schema: `db/016_training_capture.sql`.

---

## 1. A different question from learning

The learner asks *how should the scorer change?* This layer asks the prior
question: **which factors matter at all** when a person places work on a
calendar — and, once there are beta testers, whether the same factors matter
for everyone.

That is not a training problem, and framing it as one leads to the wrong data.
Training wants volume. Discovering factors wants **contrast**: for each
decision, the option that was picked *and* the options that were passed over.
The rejected options carry the information. This is a discrete choice
experiment, and it says something useful at hundreds of decisions rather than
thousands.

The consequence is the shape of the schema: **one row per candidate slot, not
one row per correction.** A corrections table alone can never answer "does
`fragmentation` predict anything once `hourFit` is controlled for?", because it
does not record what was available and refused.

`ai_suggestions.alternatives` (015) already held a choice set, but as jsonb —
and jsonb cannot be aggregated across candidates, which is the entire question.

---

## 2. The seven factors are hypotheses

`scoring.ts` asserts that `hourFit`, `energy`, `fragmentation`, `dayLoad`,
`backToBack`, `earliness` and `weekdayFit` determine where work should go. None
has been tested against anyone's actual behaviour.

Expect some to be collinear — `energy` and `hourFit` are both functions of the
hour and may be measuring one thing twice — and expect the data to be able to
say *none of these; it's something that isn't modelled*. `hour_of_day`,
`weekday` and `lead_hours` are stored raw for exactly that: they let a factor
nobody has invented yet be tested against rows collected today.

`SCORER_VERSION` guards the boundary. If a feature's definition changes, rows
from before and after are different variables wearing the same name, and
pooling them silently corrupts anything computed across the change.

---

## 3. Two tracks, one switch

Every fact is stored twice where it can be.

| | Track A | Track B |
|---|---|---|
| Content | numbers, enums, timestamps | short text notes |
| Written | always | only at `capture_profile='full'` |
| Example | `hour_fit = 0.55` | `hour_fit_note = '14h/pref9-11'` |
| Carries personal content | no, by construction | the user's own words only |

A bare `0.55` says the scorer was unenthusiastic but not why, and while there
is a single consenting tester the "why" is the point — you cannot tell which
factor deserves to survive until you have watched a few hundred decisions with
the reasoning attached.

**The switch.** `capture_profile` is read per request from `FT_CAPTURE_PROFILE`
and stamped on every occasion. Set it to `anon` before the first beta tester:
the `*_note` columns stop being written, and nothing else changes. No
migration, no backfill, and everything collected solo stays analysable because
Track A is identical under both profiles. It is stored per row rather than
assumed globally so that a corpus spanning the switch stays honest about which
rows have a Track B.

**Two guards keep Track B from becoming a dumping ground.** Every note column
is length-capped in the schema (`varchar(24)`, `varchar(120)` for the user's
own sentence) — a field that cannot hold prose will not accrete it, and
`cap()` trims in code so a long value costs a truncation rather than a failed
insert. And event titles, attendees and descriptions are in **neither track at
any profile**: they are third-party content that no flag unlocks
(`ai-learning.md` §8). The busy blocks in a logged model input are bounds only,
even though titles went into the prompt.

---

## 4. Exploration, and why it could not wait

Without it, every observation is a choice among slots the scorer already
approved of. If it only ever offers mornings, nobody ever picks an afternoon,
and "afternoons don't work" is indistinguishable from "we never offered an
afternoon" — the scorer's own bias baked into the evidence that is supposed to
correct it.

So `EXPLORE_RATE` (0.15) of occasions draw their runners-up with
`strategy: 'spread'`: the same legal candidates, taken across the whole ranked
range instead of off the top. `randomised` and `strategy` are recorded, so
analysis can lean on exactly those rows.

Nothing illegal is ever shown — hard rules have already filtered the ranking
before `selectSlots` runs — and the top option is always included, so an
exploring turn never reads as the agent having got worse.

Two deliberate choices:

- **The rate is a constant, not a setting.** It only means anything if it is
  stable across the corpus; a rate that drifts with configuration cannot be
  corrected for afterwards.
- **`spreadPick` is deterministic.** The *decision* to explore is a coin flip
  and is recorded; once it comes up heads, which slots get offered must be
  reproducible from the ranking alone, or a logged occasion cannot be replayed.

This is the one piece that cannot be added retroactively, which is why it ships
with the capture rather than after it.

---

## 5. Corrections

| Source | What it is |
|---|---|
| `block` | a proposed block was moved, resized or refused |
| `chat` | the user corrected the agent in words |
| `rule` | the user stated a standing rule outright |
| `preference` | a learned preference was deleted or confirmed |

`fault` is the field that matters and it is **not set by the capture layer**.
Only `agent` is training signal: a user who changed their mind is not evidence
the agent was wrong, and mixing the two teaches the scorer to chase noise. The
capture layer genuinely does not know which it was, so it writes `unknown` and
a human decides in review.

**Corrections made in words** are caught by letting the model label its own
turn. Every reply is already a forced function call, so `revisesPrevious` and
`correctionKind` cost one field each, and the model — having just read both
turns — is better placed than any classifier bolted on afterwards. It is never
shown internal ids: *which* proposal is being revised is resolved server-side
from the session. Its label lands `unreviewed` like everything else; it is a
suggestion for the review queue, never a verdict.

---

## 6. Capture never breaks scheduling

Every writer in `capture.ts` swallows its own errors and returns `null` or
`false`. Callers do not try/catch. A missing table (016 not applied), a dead
connection or a bad value costs an observation and a console line — never a
user's edit.

This is why `recordOccasion` tolerates a null `turnId`, and why `markChosen`
leaves every row unchosen when the user drags a block to a time that was never
a candidate. That last case is the honest record: the choice happened outside
the offered set, and attributing it to a slot we never proposed would invent a
comparison that did not take place.

---

## 7. What is deliberately not built yet

- **The review surface.** `fault`, `label_status` and `split` exist and are
  written with defaults; nothing sets them yet. One admin page — a list of
  occasions with buttons — is the next thing worth building, because the
  alternative is hand-writing SQL every time, which means nobody looks.
- **Export.** The flat per-candidate table (`choices.csv`, one row per
  candidate) is what any analysis tool wants. Derivable from the log whenever.
- **The rulebook.** Recurring corrections distilled into do's and don'ts,
  approved by a human, injected into the prompt. The fastest payoff available
  and it needs no training at all.
- **Eval replay.** `ai_turns.input` is stored complete enough to re-run a turn
  against a different model; the harness that does so is not written.

Splits are unassigned on purpose: once set they must be frozen, and assigning
them before there is anything to hold out is how eval sets quietly leak.
