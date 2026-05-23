import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, getSchema, initializeDatabase } from '../client';
import { runMigrations } from '../migrate';
import { ensureUpdatedAtTriggers } from '../trigger-migration';
import { eq } from 'drizzle-orm';

/**
 * Minimal row for inserting into request_usage without specifying updatedAt.
 * The trigger under test should set updatedAt automatically.
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

describe('request_usage updatedAt triggers', () => {
  let db: ReturnType<typeof getDatabase>;
  let schema: any;

  beforeEach(async () => {
    await closeDatabase();
    process.env.DATABASE_URL = process.env.PLEXUS_TEST_DB_URL ?? process.env.DATABASE_URL;
    initializeDatabase(process.env.DATABASE_URL);
    await runMigrations();
    await ensureUpdatedAtTriggers();

    db = getDatabase();
    schema = getSchema();
    await db.delete(schema.requestUsage);
  });

  afterEach(async () => {
    await closeDatabase();
  });

  // ── INSERT trigger ────────────────────────────────────────────────────

  it('sets updatedAt automatically on INSERT', async () => {
    const beforeInsert = Date.now();

    await db.insert(schema.requestUsage).values([usageRow({ requestId: 'trigger-insert' })]);

    const rows = await db
      .select({ updatedAt: schema.requestUsage.updatedAt })
      .from(schema.requestUsage)
      .where(eq(schema.requestUsage.requestId, 'trigger-insert'));

    expect(rows).toHaveLength(1);
    const updatedAt = rows[0]!.updatedAt;

    // Trigger should have set updatedAt to a non-zero epoch-ms timestamp
    expect(typeof updatedAt).toBe('number');
    expect(updatedAt).toBeGreaterThan(0);

    // Timestamp should be within a reasonable window around the insert time
    expect(updatedAt).toBeGreaterThanOrEqual(beforeInsert);
    expect(updatedAt).toBeLessThanOrEqual(beforeInsert + 5000);
  });

  // ── UPDATE trigger ─────────────────────────────────────────────────────

  it('updates updatedAt on UPDATE', async () => {
    await db.insert(schema.requestUsage).values([usageRow({ requestId: 'trigger-update' })]);

    const rowsAfterInsert = await db
      .select({ updatedAt: schema.requestUsage.updatedAt })
      .from(schema.requestUsage)
      .where(eq(schema.requestUsage.requestId, 'trigger-update'));

    const updatedAtAfterInsert = rowsAfterInsert[0]!.updatedAt;
    expect(updatedAtAfterInsert).toBeGreaterThan(0);

    // Wait to ensure a different timestamp
    await new Promise((resolve) => setTimeout(resolve, 50));

    await db
      .update(schema.requestUsage)
      .set({ provider: 'anthropic' })
      .where(eq(schema.requestUsage.requestId, 'trigger-update'));

    const rowsAfterUpdate = await db
      .select({ updatedAt: schema.requestUsage.updatedAt })
      .from(schema.requestUsage)
      .where(eq(schema.requestUsage.requestId, 'trigger-update'));

    const updatedAtAfterUpdate = rowsAfterUpdate[0]!.updatedAt;

    // updatedAt should have increased (or at minimum stayed the same if
    // sub-millisecond, but with 50ms delay it must increase)
    expect(updatedAtAfterUpdate).toBeGreaterThan(updatedAtAfterInsert);
  });

  // ── UPSERT (onConflictDoUpdate) trigger ───────────────────────────────

  it('updates updatedAt on upsert conflict update', async () => {
    // Initial insert
    await db
      .insert(schema.requestUsage)
      .values([usageRow({ requestId: 'trigger-upsert', provider: 'openai' })]);

    const rowsAfterInsert = await db
      .select({ updatedAt: schema.requestUsage.updatedAt })
      .from(schema.requestUsage)
      .where(eq(schema.requestUsage.requestId, 'trigger-upsert'));

    const updatedAtAfterInsert = rowsAfterInsert[0]!.updatedAt;
    expect(updatedAtAfterInsert).toBeGreaterThan(0);

    // Wait to ensure a different timestamp
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Upsert: same requestId → triggers UPDATE path
    await db
      .insert(schema.requestUsage)
      .values([usageRow({ requestId: 'trigger-upsert', provider: 'anthropic' })])
      .onConflictDoUpdate({
        target: schema.requestUsage.requestId,
        set: { provider: 'anthropic' },
      });

    const rowsAfterUpsert = await db
      .select({ updatedAt: schema.requestUsage.updatedAt, provider: schema.requestUsage.provider })
      .from(schema.requestUsage)
      .where(eq(schema.requestUsage.requestId, 'trigger-upsert'));

    const updatedAtAfterUpsert = rowsAfterUpsert[0]!.updatedAt;

    // Verify the upsert actually updated the row
    expect(rowsAfterUpsert[0]!.provider).toBe('anthropic');

    // updatedAt should have increased
    expect(updatedAtAfterUpsert).toBeGreaterThan(updatedAtAfterInsert);
  });
});
