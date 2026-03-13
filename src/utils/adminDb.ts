/**
 * Admin database stub — returns empty data for all queries.
 *
 * TODO: Admin functionality needs dedicated Express API endpoints.
 * Once built, these components should be rewired to use the proper
 * typed functions from src/api/client.ts
 *
 * @see src/api/client.ts for the production API client
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chainable: any = {
  select: () => chainable,
  insert: () => chainable,
  update: () => chainable,
  delete: () => chainable,
  upsert: () => chainable,
  eq: () => chainable,
  neq: () => chainable,
  in: () => chainable,
  is: () => chainable,
  gte: () => chainable,
  lte: () => chainable,
  like: () => chainable,
  ilike: () => chainable,
  or: () => chainable,
  not: () => chainable,
  filter: () => chainable,
  order: () => chainable,
  limit: () => chainable,
  range: () => chainable,
  single: () => chainable,
  maybeSingle: () => chainable,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  then: (resolve: (val: any) => any) =>
    Promise.resolve(resolve({ data: null, error: null, count: 0 })),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: any = {
  from: (_table: string) => chainable,
  functions: {
    invoke: (_name: string, _opts?: unknown) =>
      Promise.resolve({ data: null, error: null }),
  },
  auth: {
    getUser: () =>
      Promise.resolve({ data: { user: null }, error: null }),
    getSession: () =>
      Promise.resolve({ data: { session: null }, error: null }),
    signOut: () => Promise.resolve({ error: null }),
    onAuthStateChange: () => ({
      data: { subscription: { unsubscribe: () => {} } },
    }),
  },
  channel: (_name: string) => ({
    on: (_event: string, _opts: unknown, _cb: () => void) => ({
      subscribe: () => ({ unsubscribe: () => {} }),
    }),
  }),
  removeChannel: (_channel: unknown) => {},
};
