import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { emailOTP } from 'better-auth/plugins';

import { pool, queryOne } from '@/server/db';
import { codeMail, existingAccountMail, sendMail } from '@/server/email';

/**
 * Better Auth — sign in / sign up / sessions, run inside our own API
 * (`src/app/api/auth/[...auth]+api.ts`) on our own Postgres. Its tables are
 * `auth_user`, `auth_session`, `auth_account`, `auth_verification` (db/027);
 * `users` stays the thin row the calendar tables FK to, keyed by the same id.
 *
 *   email + password  sign-up is verified with a 6-digit emailed code
 *                     (email-OTP plugin), then signed in automatically
 *   password reset    a 6-digit code + new password
 *   Google            `signIn.social` → /api/auth/callback/google
 *   native            the Expo plugin: session cookie kept in SecureStore,
 *                     `findtime://` deep links trusted
 *
 * `onboarded` on the user is what `/app` gates on (set by /api/onboarding).
 * `BETA_INVITE_ONLY=1` refuses sign-ups whose email hasn't been invited
 * (`waitlist.invited_at`, set by scripts/invite-beta.mjs).
 *
 * Created lazily: importing this must not need DATABASE_URL.
 * Server-only — never import from the app bundle.
 */

const SITE = (process.env.EXPO_PUBLIC_SITE_URL || 'https://www.usefindtime.com').replace(/\/$/, '');

function google() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { google: { clientId, clientSecret, prompt: 'select_account' as const } } : {};
}

function makeAuth() {
  return betterAuth({
    appName: 'Find Time',
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: pool(),
    trustedOrigins: [
      SITE,
      'findtime://',
      ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:8081', 'exp://']),
    ],
    user: {
      modelName: 'auth_user',
      additionalFields: {
        onboarded: { type: 'boolean', defaultValue: false, input: false },
      },
    },
    session: { modelName: 'auth_session' },
    account: { modelName: 'auth_account', accountLinking: { enabled: true, trustedProviders: ['google'] } },
    verification: { modelName: 'auth_verification' },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      revokeSessionsOnPasswordReset: true,
      // The page can't say "that email has an account" without telling anyone
      // who has one — so the inbox owner is told instead.
      async onExistingUserSignUp({ user }) {
        await sendMail(existingAccountMail(user.email, SITE));
      },
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      sendOnSignIn: true,
    },
    socialProviders: google(),
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600, // the page says "works for 10 minutes"
        sendVerificationOnSignUp: true,
        overrideDefaultEmailVerification: true,
        disableSignUp: true, // codes never create accounts — sign-up is email + password or Google
        // e2e only (e2e/README.md): every code is E2E_FIXED_OTP. Never in production.
        generateOTP: () =>
          process.env.E2E_FIXED_OTP && process.env.NODE_ENV !== 'production' ? process.env.E2E_FIXED_OTP : undefined,
        async sendVerificationOTP({ email, otp, type }) {
          await sendMail(codeMail(email, otp, type));
        },
      }),
      expo(),
    ],
    databaseHooks: {
      user: {
        create: {
          async before(user) {
            if (process.env.BETA_INVITE_ONLY !== '1') return { data: user };
            const invited = await queryOne(
              `select 1 from waitlist where email = $1 and invited_at is not null`,
              [user.email],
            );
            if (!invited) {
              throw new APIError('FORBIDDEN', {
                code: 'NOT_INVITED',
                message: 'Find Time is invite-only for now. Join the waitlist and we’ll email you.',
              });
            }
            return { data: user };
          },
        },
      },
    },
    advanced: {
      cookiePrefix: 'ft',
    },
  });
}

let instance: ReturnType<typeof makeAuth> | undefined;

export function auth(): ReturnType<typeof makeAuth> {
  return (instance ??= makeAuth());
}

export function authConfigured(): boolean {
  return Boolean(process.env.BETTER_AUTH_SECRET && process.env.DATABASE_URL);
}
