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
