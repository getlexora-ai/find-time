# How Find time learns

The agent gets better by being corrected. This document is the contract: which
signals count, what each one is allowed to change, and the guardrails that stop
it learning nonsense.

Code: `src/server/ai/` (`chat.ts`, `scoring.ts`, `learn.ts`, `preferences.ts`,
`repo.ts`), routes in `src/app/api/ai/`, client in `src/calendar/agent-store.ts`.
Schema: `db/015_agent_learning.sql`.

---

## 1. The two changes that made learning possible

Neither was a learning algorithm.

**The proposal is now recorded.** The old `/api/ai/find-time` returned blocks and
the client created events; the proposal itself was never stored. There was no
record of the gap between what the agent suggested and what the user kept — and
that gap is the only real training signal there is. Every proposal now lands in
`plan_drafts` / `ai_suggestions` *before* it reaches the client, and its outcome
is written back against that row.

**Placement is now a scored decision.** `findFreeSlots` was first-fit: walk the
day, take the first hole big enough. First-fit has no preference to learn *into*,
so no amount of feedback could ever change what it did. `rankFreeSlots` scores
every legal candidate and placement becomes `argmax`. Corrections now have
somewhere to land.

Everything below depends on those two. Building the learner first — the usual
mistake — produces a model trained on a log that doesn't exist, ranking a
decision that isn't being made.

---

## 2. Signals, by what they're worth

| Signal | Strength | Why |
|---|---|---|
| **Edit** — proposed Tue 09:00, user took Tue 14:00 | strongest | A labelled pair. The chosen slot *was available* and the scorer ranked it lower. Directly invertible into a weight update. |
| **Reject + reason** | strong | Only with the reason. Bare rejection is ambiguous: the hour, the day, the length, or the task evaporated? |
| **Post-hoc mutation** — kept, then moved days later | strong, delayed | What survives contact with the real week. *Not yet wired — see §7.* |
| **Accept** | weak | People accept to close the panel. |
| **Survival** — reached its start time untouched | weak positive | *Not yet wired.* |
| **Actual vs estimated duration** | strong, narrow | Feeds `duration_bias`. |

The asymmetry is enforced in `SIGNAL_WEIGHT` (`learn.ts`): `edited` 1.0,
`rejected` 0.6, `accepted` 0.15. Getting this wrong is how these systems end up
confidently learning that whatever they already do is correct.

---

## 3. What each signal is allowed to change

Two learned things, kept separate because they fail differently.

**Weights** (`scheduler_profiles.weights`) — how much each factor matters. Seven
non-negative numbers; `score` is their weighted sum over features normalised to
`[0,1]`. Updated by one gradient step:

```
w += lr · (features(chosen) − features(proposed))
```

Since `score = Σ wₖ·fₖ`, that derivative *is* `f_chosen − f_proposed`. No ML
infrastructure, no training pipeline, and the learned state stays a handful of
readable numbers.

**Only an edit moves weights.** A rejection says this slot was wrong but not what
better looks like — one side of a comparison is not a comparison.

**Claims** (`learned_preferences`) — discrete statements: "prefers design work
14:00–16:00", "keeps Fridays clear", "deep work runs 20% long". Each carries a
signed EMA strength, an evidence count, and its own delete button.

**Do not fine-tune a model.** Wrong tool at every level: no data volume, the
model isn't making the placement decision, and it would put personal scheduling
data into a training set — against the privacy positioning.

---

## 4. Hard rules vs soft preferences

The single most important distinction in the system.

|  | **Stated rules** (`constraints`) | **Inferred preferences** (`learned_preferences`) |
|---|---|---|
| Origin | The user said it, in chat or settings | Derived from corrections |
| Effect | **Filter** — removes candidates outright | **Weight** — only reorders legal candidates |
| Evidence needed | One sentence | `MIN_EVIDENCE` = 5, or explicit confirmation |
| Can be wrong | Visibly, and the user fixes it | Quietly — so it must never be hard |

A wrongly-learned *hard* rule is far more damaging than a wrongly-learned soft
one: it silently removes good slots and the user cannot tell why. **Inference
never writes to `constraints`.** Promotion happens only when a user confirms a
claim outright.

This is also why "never book me before 10" is handled by `record_rule` and takes
effect immediately from one sentence, rather than waiting for the learner to
notice a pattern. Most of what a user *means* by "the app learned" is this, and
it needs no statistics at all.

---

## 5. Guardrails

Each of these is a specific failure mode, with where it's handled.

**Confounding.** Most rejections aren't about the time. `not-needed` (the task
evaporated) and `other` produce **no claims at all** — `claimsFrom` returns `[]`,
and there's a test pinning it. Reason chips exist to turn an unlabelled rejection
into a labelled one; they shipped *before* weight learning for this reason.

**No exploration.** If the agent only ever proposes mornings, it never observes
that 4pm works — it learns from a self-selected sample. Fixed by offering ranked
runners-up (`selectSlots` → `alternatives`) and making the user's *choice among
them* the signal. This gets exploration without ever showing a deliberately worse
slot.

**Runaway.** `MAX_STEP` 0.15 caps any single correction; weights clamp to
`[0.05, 2.5]`. One chaotic week cannot rewrite a profile built over months.

**Drift.** `DECAY` 0.02 pulls toward the cold-start defaults on every update, so
evidence that stops being reinforced fades instead of persisting forever.

**Cold start.** `MIN_EVIDENCE` 5 before an inferred claim affects placement, and
a claim with one observation is never announced. Three data points is a
coincidence. Defaults (`DEFAULT_WEIGHTS`) are deliberately opinionated rather
than uniform — early randomness is what makes people stop trusting an adaptive
scheduler before it has any data.

**Re-learning what was deleted.** Deleting an inferred preference marks it
`rejected`, not gone. `mergeClaim` refuses to update a rejected claim, so the
next few corrections don't re-derive the thing the user just removed.

**Small drags aren't preferences.** A move under an hour is tidying; `claimsFrom`
ignores it.

**Attribution.** Claims are scoped per category — "afternoons for design" is a
different claim from "afternoons for admin". `ai_suggestions.category` exists so
corrections land in the right bucket instead of blurring into one.

---

## 6. The learned model is a page, not a hidden vector

`GET /api/ai/preferences` returns everything the agent believes, in plain
sentences, each with its evidence count and a delete button. `DELETE` forgets
one; `PATCH …{verdict:'confirmed'}` pins one past the evidence gate.

Three reasons this is not optional:

1. **Trust.** Nobody accepts a scheduler that changes its mind for reasons it
   won't show.
2. **Debuggability.** It's the only surface where a wrong inference gets
   corrected instead of quietly compounding.
3. **Privacy.** It makes the positioning concrete: the agent learns in the open,
   and you can read and erase what it knows.

Enforced in code: `describeClaim` returns `null` for anything it cannot say in
one sentence, and such claims are not shown. A preference that can't be explained
has no business acting on the calendar.

---

## 7. What is deliberately not built yet

- **Post-hoc mutation tracking.** Needs an event-history log (the user moving an
  agent-created block two days later). Highest-value remaining signal.
- **Energy curve learning.** `scheduler_profiles.energy_curve` is read but only
  ever written with the default. Wants the counting statistics over
  (category × hour × weekday) that `ai_suggestions` now makes possible.
- **Replaying the log.** Outcomes are recorded even when nothing is learned from
  them, so a better learner can be back-fitted later. The log is the durable
  asset; the update rule is replaceable.
- **`/api/ai/find-time`** still exists and is unchanged, as the zero-config
  single-shot fallback. It does not learn.

---

## 8. Privacy notes

Only a **structured** preference card reaches the model: categories and hours,
never event titles, attendees, or free text (`preferenceCard` in
`chat+api.ts`). A free-text "memory" blob would leak more and would quietly
accrete contradictions nobody can debug.

Calendar contents are passed to the model fenced and labelled as data, and the
system prompt states that event titles are written by other people and must never
be followed as instructions. Every model reply is a forced function call, so
untrusted calendar text cannot come back out as an unframed instruction.

See the agent pivot roadmap for the tokenisation layer this should sit behind
once sensitive tools land.
