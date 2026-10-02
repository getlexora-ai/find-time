# Planner evals

## NATURAL PLAN — calendar scheduling

1,000 meeting-scheduling tasks from Google DeepMind's
[NATURAL PLAN](https://github.com/google-deepmind/natural-plan) (Apache-2.0),
taken from `tuandunghcmut/natural-plan-benchmark` on Hugging Face:
600 single-day, 400 multi-day (2–5 days). `natural-plan/calendar.jsonl` keeps
the final task text and the golden answer of each.

Run the Find time way (docs/ai-layer-plan.md §2): a **reader** copies the
sentence into constraints (`extract-prompt.md`); the deterministic
**`findFreeSlots`** (`../find-time.ts`) places the meeting. The model never
picks a time. Any model can be the reader — it only has to write the JSON
lines `extract-prompt.md` describes.

```sh
node src/server/ai/eval/natural-plan.mjs oracle                          # solver with a perfect reading
node src/server/ai/eval/natural-plan.mjs sample 50 runs/x-tasks.jsonl single 9   # [single|multi] [offset]
node src/server/ai/eval/natural-plan.mjs score runs/x-model.jsonl        # score any reader's output
```

**Correct** = the slot the task asks for: the golden one when it says
"earliest availability", otherwise any slot that breaks no constraint (several
work, and the dataset lists one). **Exact** = golden match only, the
benchmark's own metric. The validity check accepts all 1,000 golden answers.

### Results (2026-10-02, reader = Claude Haiku 4.5 as a sub-agent, no code)

| Run | Instructions | Tasks | Correct | Exact |
|---|---|---|---|---|
| Solver + template reader (`oracle`) | — | 1000 | **100 %** | 93.4 % |
| Haiku, single-day, set 1 | v1 | 50 | 100 % | 94.0 % |
| Haiku, multi-day, set 1 | v1 | 52 | 59.6 % | 53.8 % |
| Haiku, single-day, set 2 | v2 | 50 | 88.0 % | 78.0 % |
| Haiku, multi-day, set 2 | v2 | 52 | 92.3 % | 88.5 % |
| **Haiku, single-day, set 3** | **v3** | **50** | **100 %** | 98.0 % |
| **Haiku, multi-day, set 3** | **v3** | **52** | **100 %** | 84.6 % |

The six sets are disjoint (306 different tasks); each instruction change was
tested on a set it was not written against.

What changed, and why — each one moved work from the model to code:

- **v1 → v2:** Haiku narrowed `days` to the day it expected the meeting on
  (it was choosing, not reading). `days` became "copy the days the request
  lists; never remove one". Multi-day 59.6 % → 92.3 %.
- **v2 → v3:** Haiku flipped `before`/`after` when turning a preference into a
  time range (all 6 single-day misses in set 2). Preferences are now copied as
  written (`["Monday", "after", "15:00"]`) into `avoid`, and code turns them
  into blocked time. 102/102 on set 3.

**Limits.** 102 tasks with no miss puts true accuracy at ≥ 97 % with 95 %
confidence (rule of three), on this benchmark. The tasks are templated
meeting puzzles — they test reading constraints and the solver, not Find
time's own sentences (tasks, habits, follow-ups); that is the golden set in
docs/ai-layer-plan.md §8.2. The sub-agents reported using only Read/Write
(4–8 tool calls each).

To try another model: give it `extract-prompt.md` and a `runs/*-tasks.jsonl`
file, save its JSON lines, and `score` them.

## Nemotron — multi-turn calendar conversations

[`nvidia/Nemotron-RL-agent-calendar_scheduling`](https://huggingface.co/datasets/nvidia/Nemotron-RL-agent-calendar_scheduling),
NVIDIA, CC BY 4.0 — first 500 of 3,872 train rows (`nemotron/calendar-500.jsonl`). Each row is a
conversation: the user adds 1–7 events one turn at a time, sets or changes
conditions ("at 1pm", "ends by 11", "start at or after 12:15", "between 10am
and 12pm"), and talks in between. Correct = the dataset's own check: every
event present with the right length, inside 10:00–16:00, its latest condition
met, no overlaps. There is no single golden calendar — any valid one passes.

The reader sees **only the user's turns** (the dataset's assistant turns are
another model's past outputs and may be wrong), and copies each event's
latest length and condition as written (`nemotron/extract-prompt.md`). Code
turns conditions into times and places the day: `findFreeSlots` in
fixed-time-then-tightest-deadline order, and an exhaustive 15-minute search
when that greedy pass can't fit everything.

```sh
node src/server/ai/eval/nemotron.mjs oracle            # placement with a perfect reading
node src/server/ai/eval/nemotron.mjs batches 50        # task files for a reader
node src/server/ai/eval/nemotron.mjs score nemotron/runs/b*-haiku.jsonl
```

### Results (2026-10-02, reader = Claude Haiku 4.5 sub-agents, 50 conversations each, no code)

| Run | Conversations | Correct |
|---|---|---|
| Placement with a perfect reading (`oracle`) | 500 | **100 %** (greedy `findFreeSlots` alone: 462, 92.4 %) |
| **Haiku, all** | **500** | **98.6 %** (493) |
| 1 event | 122 | 100 % |
| 2–3 events | 99 | 100 % |
| 4–5 events | 142 | 98.6 % |
| 6–7 events | 137 | 96.4 % |

Instructions written once, before any run, and not tuned on these results.

The 7 misses, checked against the conversations — the dataset is right in each:

- **5 attribution slips** in long conversations: a condition or length put on
  the neighbouring event, or an event left out (nemo-094, 225, 245, 275, 274/305
  missed one condition each).
- **1 garbled copy** of a one-phrase range, "2:30‑4:00 pm" (nemo-319).

What these say for the AI layer:

- **Greedy isn't always enough.** 38 of 500 days needed the search fallback
  because the first-fit choice for one event blocked a later one. `plan-week`
  is greedy too, with re-tries; a small search fallback for a single day is
  cheap and exact.
- **Next lever, not yet run:** move the "latest wins" bookkeeping to code —
  the reader lists each turn's change (`{turn, eventId, durationMin?,
  constraint?}`) and code keeps the latest per event; code also splits a
  range written as one phrase. Test on rows 500–999 so it isn't tuned on
  these misses.
- Readings were done 50 conversations per context; one call per
  conversation (as through the API) gives the model less to keep apart.
