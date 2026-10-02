# e2e — sign up, sign in, onboarding

Playwright tests for `/signup`, `/login`, `/welcome` and the `/app` gate, run
against a real Clerk **development** instance in test mode
(`+clerk_test` emails, code `424242` — no email is sent). Each test user is
deleted afterwards through the Clerk Backend API.

Separate `package.json` on purpose: the app's lockfile never moves for test tooling.

```sh
# 1. the app, wired to a Clerk dev instance (and a DB if you want answers saved)
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_… CLERK_SECRET_KEY=sk_test_… npx expo start --web

# 2. the tests
cd e2e && npm install
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_… CLERK_SECRET_KEY=sk_test_… npm test
```

| env | |
|---|---|
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` | dev instance keys. Without them every spec is skipped. |
| `E2E_BASE_URL` | default `http://localhost:8081` |
| `E2E_CHROMIUM` | path to a Chromium binary, if Playwright's own isn't installed |

Not covered (needs a real Google account): the Google sign-in redirect and the
Calendar connect round trip from onboarding step 2.
