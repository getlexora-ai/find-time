/**
 * Did the person actually say it? The planner needs exact input, and a model
 * asked to fill a form will sometimes fill a gap with a reasonable guess. So
 * code checks that a length, a frequency or a clock time has words behind it
 * in what the person typed. Nothing behind it counts as missing, which means a
 * question, never a default.
 *
 * Deliberately loose about wording (an answer to the app's own question always
 * counts, in any language): this stops invented values, it doesn't read meaning.
 *
 * Pure, so agent.check.mjs runs it directly.
 */

export type Said = {
  /** the person's latest messages, newest last */
  recent: string[];
  /** the app asked something and this message follows it */
  answering: boolean;
};

const LENGTH = /\b\d+(?:[.,]\d+)?\s*(?:h|hrs?|hours?|m|mins?|minutes?|std|stunden?|heures?|horas?|ore|uur|minuten|minuti|minutos)\b|\b(?:hours?|hrs?|minutes?|mins?|stunden?|stündchen|heures?|horas?)\b|^\s*\d+(?:[.,]\d+)?\s*$/i;
const OFTEN = /\d|\b(?:once|twice|thrice|every|each|daily|weekdays?|one|two|three|four|five|six|seven|täglich|jeden?|mal)\b/i;
const CLOCK = /\d|\b(?:noon|midday|midnight|mittag|mitternacht)\b/i;

const has = (re: RegExp, s: Said) => s.answering || s.recent.some((t) => re.test(t));

export const saidLength = (s: Said) => has(LENGTH, s);
export const saidOften = (s: Said) => has(OFTEN, s);
export const saidClock = (s: Said) => has(CLOCK, s);
