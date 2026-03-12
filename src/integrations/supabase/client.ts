/**
 * Supabase client stub — NO-OP replacement.
 *
 * The WheresTheFX platform no longer uses Supabase. All authentication
 * and data access goes through the Express backend (see api/client.ts).
 *
 * This stub exists only so that old admin components that still import
 * `supabase` don't crash the build. Every method returns empty data.
 */

const noopQuery = {
  select: () => noopQuery,
  insert: () => noopQuery,
  update: () => noopQuery,
  delete: () => noopQuery,
  eq: () => noopQuery,
  neq: () => noopQuery,
  in: () => noopQuery,
  is: () => noopQuery,
  gte: () => noopQuery,
  lte: () => noopQuery,
  like: () => noopQuery,
  ilike: () => noopQuery,
  order: () => noopQuery,
  limit: () => noopQuery,
  range: () => noopQuery,
  single: () => noopQuery,
  maybeSingle: () => noopQuery,
  then: (resolve: any) => Promise.resolve(resolve({ data: null, error: null, count: 0 })),
};

export const supabase = {
  from: () => noopQuery,
  auth: {
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    signInWithPassword: () => Promise.resolve({ data: { user: null, session: null }, error: { message: 'Use Express auth' } }),
    signUp: () => Promise.resolve({ data: { user: null, session: null }, error: { message: 'Use Express auth' } }),
    signOut: () => Promise.resolve({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
  channel: () => ({
    on: () => ({ subscribe: () => {} }),
  }),
  removeChannel: () => {},
} as any;