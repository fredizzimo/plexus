/**
 * The subset of test files that exercise the database layer directly.
 * These are the only tests that need to run against both the SQLite and
 * Postgres projects.  All other tests mock the DB and only need one run.
 */
export const DB_TEST_FILES = [
  'src/db/**/*.test.ts',
  'src/routes/management/__tests__/usage-records.test.ts',
  'src/routes/management/__tests__/usage-summary.test.ts',
  'src/services/__tests__/usage-storage-performance.test.ts',
  'src/services/quota/__tests__/quota-enforcer.test.ts',
  'src/services/quota/__tests__/quota-scheduler.test.ts',
  // Trigger tests must run against both SQLite and Postgres
  'src/db/__tests__/request-usage-triggers.test.ts',
  'src/db/__tests__/trigger-migration.test.ts',
] as const;
