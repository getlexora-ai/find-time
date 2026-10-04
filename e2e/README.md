# e2e — sign up, sign in, onboarding

Playwright tests for `/signup`, `/login`, `/welcome` and the `/app` gate, run
against a real Find Time with Better Auth and a database. With
`E2E_FIXED_OTP` set (never in production) every emailed code is that value,
so the tests can type it; without `RESEND_API_KEY` no email is sent. Each test
user is deleted afterwards (sign in, then `DELETE /api/me`).

Separate `package.json` on purpose: the app's lockfile never moves for test tooling.

```sh
# 1. the app, with a database (db/027 applied) and the fixed code
E2E_FIXED_OTP=123456 npx expo start --web

# 2. the tests, with the same code
cd e2e && npm install
E2E_FIXED_OTP=123456 npm test
```

| env | |
|---|---|
| `E2E_FIXED_OTP` | the same 6 digits for the app and the tests. Without it every spec is skipped. |
| `E2E_BASE_URL` | default `http://localhost:8081` |
| `E2E_CHROMIUM` | path to a Chromium binary, if Playwright's own isn't installed |

Not covered (needs a real Google account): the Google sign-in redirect and the
Calendar connect round trip from onboarding step 2.
