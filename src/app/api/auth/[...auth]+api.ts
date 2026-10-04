import { auth } from '@/server/auth/auth';

/**
 * Better Auth's endpoints (sign in / up, email codes, Google callback,
 * session) under `/api/auth/*`. The calendar-connect routes in
 * `api/auth/google/` are more specific and keep winning over this catch-all.
 */
function handler(request: Request): Promise<Response> {
  return auth().handler(request);
}

export { handler as GET, handler as POST };
