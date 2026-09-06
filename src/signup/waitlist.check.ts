/**
 * Runnable check for the one piece of non-trivial logic here (ponytail rule).
 * No framework, no node imports: `npx tsx src/signup/waitlist.check.ts`.
 * Fold into a `test` script when a runner is picked (plan §10 Q13).
 */
import { normalizeEmail, validateEmail } from './waitlist';

let failures = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  if (actual !== expected) {
    failures++;
    console.error(`FAIL ${msg} — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  }
}

const valid = ['a@b.co', 'jane.doe@example.com', 'x+tag@sub.domain.io', 'USER@EXAMPLE.COM', '  padded@example.com  '];
const invalid = ['', 'nope', 'a@b', 'a b@c.com', 'two@@at.com', 'x@y.', '@no-local.com'];

for (const e of valid) eq(validateEmail(e), true, `valid: ${JSON.stringify(e)}`);
for (const e of invalid) eq(validateEmail(e), false, `invalid: ${JSON.stringify(e)}`);

eq(normalizeEmail('  Jane.Doe@Example.COM '), 'jane.doe@example.com', 'normalize trims + lowercases');
eq(validateEmail('a'.repeat(250) + '@x.com'), false, 'over 254 chars rejected');

if (failures) throw new Error(`waitlist.check: ${failures} failure(s)`);
console.log('waitlist.check: ok');
