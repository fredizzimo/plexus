import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, getSchema, initializeDatabase } from '../client';
import { runMigrations } from '../migrate';
import { ensureUpdatedAtTriggers } from '../trigger-migration';
import { eq } from 'drizzle-orm';

/**
 * Minimal row for inserting into request_usage without specifying updatedAt.
 */
function usageRow(overrides: { requestId: string } & Partial<Record<string, unknown>>) {
  const now = Date.now();
  return {
    date: new Date(now).toISOString(),
    startTime: now,
    durationMs: 100,
    isStreamed: 0,
    isPassthrough: 0,
    tokensEstimated: 0,
    attemptCount: 1,
    createdAt: now,
    ...overrides,
  };
}

describe('ensureUpdatedAtTriggers', () => {
  let db: ReturnType<typeof getDatabase>;
  let schema: any;

  beforeEach(async () => {
    await closeDatabase();
    process.env.DATABASE_URL = process.env.PLEXUS_TEST_DB_URL ?? process.env.DATABASE_URL;
    initializeDatabase(process.env.DATABASE_URL);
    await runMigrations();

    db = getDatabase();
    schema = getSchema();
    await db.delete(schema.requestUsage);
  });

  afterEach(async () => {
    await closeDatabase();
  });

  it('creates triggers that set updatedAt on INSERT', async () => {
    await ensureUpdatedAtTriggers();

    const beforeInsert = Date.now();
    await db
      .insert(schema.requestUsage)
      .values([usageRow({ requestId: 'trigger-migration-insert' })]);

    const rows = await db
      .select({ updatedAt: schema.requestUsage.updatedAt })
      .from(schema.requestUsage)
      .where(eq(schema.requestUsage.requestId, 'trigger-migration-insert'));

    expect(rows).toHaveLength(1);
    const updatedAt = rows[0]!.updatedAt;
    expect(updatedAt).toBeGreaterThanOrEqual(beforeInsert);
    expect(updatedAt).toBeLessThanOrEqual(beforeInsert + 5000);
  });

  it('creates triggers that update updatedAt on UPDATE', async () => {
    await ensureUpdatedAtTriggers();

    await db
      .insert(schema.requestUsage)
      .values([usageRow({ requestId: 'trigger-migration-update' })]);

    const rowsAfterInsert = await db
      .select({ updatedAt: schema.requestUsage.updatedAt })
      .from(schema.requestUsage)
      .where(eq(schema.requestUsage.requestId, 'trigger-migration-update'));

    const updatedAtAfterInsert = rowsAfterInsert[0]!.updatedAt;

    await new Promise((resolve) => setTimeout(resolve, 50));

    await db
      .update(schema.requestUsage)
      .set({ provider: 'anthropic' })
      .where(eq(schema.requestUsage.requestId, 'trigger-migration-update'));

    const rowsAfterUpdate = await db
      .select({ updatedAt: schema.requestUsage.updatedAt })
      .from(schema.requestUsage)
      .where(eq(schema.requestUsage.requestId, 'trigger-migration-update'));

    expect(rowsAfterUpdate[0]!.updatedAt).toBeGreaterThan(updatedAtAfterInsert);
  });

  it('is idempotent — calling it twice does not throw', async () => {
    await ensureUpdatedAtTriggers();
    // Second call should succeed without error (IF NOT EXISTS / CREATE OR REPLACE)
    await expect(ensureUpdatedAtTriggers()).resolves.toBeUndefined();
  });

  it('is idempotent — triggers still work after second call', async () => {
    await ensureUpdatedAtTriggers();
    await ensureUpdatedAtTriggers();

    const beforeInsert = Date.now();
    await db.insert(schema.requestUsage).values([usageRow({ requestId: 'idempotent-trigger' })]);

    const rows = await db
      .select({ updatedAt: schema.requestUsage.updatedAt })
      .from(schema.requestUsage)
      .where(eq(schema.requestUsage.requestId, 'idempotent-trigger'));

    expect(rows[0]!.updatedAt).toBeGreaterThanOrEqual(beforeInsert);
  });
});
