# Extraction instructions (any model)

Each task is what one user said to a calendar assistant, in order, over a
conversation. You copy the calendar requests into JSON. You do **not** choose
times — a separate program places the events. Copy; don't compute.

For each task, output one JSON object on one line:

```json
{"id": "<task id>", "events": [{"id": 0, "durationMin": 90, "constraint": ["after", "12:15 pm"]}, {"id": 1, "durationMin": 30, "constraint": ["between", "10am", "12pm"]}, {"id": 2, "durationMin": 30, "constraint": null}]}
```

- `events`: every event the user asked to add, one entry each, using the
  `event id` the user gave.
- `durationMin`: the event's length in minutes ("90-minute" = 90, "an hour" = 60).
  If the user later changes the length, use the **latest** one.
- `constraint`: the event's time condition, copied as written, or `null` if it
  has none. Use the **latest** condition the user gave for that event — a new
  condition replaces the old one.
  - "at 11:15 am" / "start at 11:15" → `["at", "11:15 am"]`
  - "before 11 am" / "end by 11" / "finish no later than 11am" → `["before", "11 am"]`
  - "after 2 pm" / "start at or after 2pm" / "no earlier than 2 pm" → `["after", "2 pm"]`
  - "between 10am and 12pm" / "from 10 to 12" → `["between", "10am", "12pm"]`
  - Copy the time words as the user wrote them (keep am/pm). Do not convert
    them or turn them into a start time.
- Ignore small talk; it adds nothing.

Output only the JSON lines, one per task, in the order given. No prose.
