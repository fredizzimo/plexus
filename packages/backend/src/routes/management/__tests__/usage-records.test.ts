import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerUsageRoutes } from '../usage';
import { UsageStorageService } from '../../../services/usage-storage';
import { closeDatabase, getDatabase, getSchema, initializeDatabase } from '../../../db/client';
import { runMigrations } from '../../../db/migrate';
import type { Principal } from '../_principal';

/**
 * Helper to insert a request_usage row with sensible defaults.
 * Only the fields needed for each test are overridden.
 */
function usageRow(overrides: Partial<Record<string, unknown>> & { requestId: string }) {
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

describe('GET /v0/management/usage', () => {
  let fastify: ReturnType<typeof Fastify>;
  let db: ReturnType<typeof getDatabase>;
  let schema: any;

  beforeEach(async () => {
    await closeDatabase();
    process.env.DATABASE_URL = process.env.PLEXUS_TEST_DB_URL ?? process.env.DATABASE_URL;
    initializeDatabase(process.env.DATABASE_URL);
    await runMigrations();

    db = getDatabase();
    schema = getSchema();

    fastify = Fastify();
    const usageStorage = new UsageStorageService();
    await registerUsageRoutes(fastify, usageStorage);
    await db.delete(schema.requestUsage);
  });

  afterEach(async () => {
    await fastify.close();
    await closeDatabase();
  });

  // ── Response shape ──────────────────────────────────────────────────

  it('returns 200 with { data, total } shape', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('total');
    expect(Array.isArray(body.data)).toBe(true);
    expect(typeof body.total).toBe('number');
  });

  it('returns empty data and total 0 when no records exist', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('returns seeded records in the data array', async () => {
    await db
      .insert(schema.requestUsage)
      .values([
        usageRow({ requestId: 'rec-1', provider: 'anthropic' }),
        usageRow({ requestId: 'rec-2', provider: 'openai' }),
      ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total).toBe(2);
    expect(body.data).toHaveLength(2);
  });

  // ── Field types ─────────────────────────────────────────────────────

  it('maps boolean fields correctly from the database', async () => {
    await db
      .insert(schema.requestUsage)
      .values([usageRow({ requestId: 'bool-1', isStreamed: 1, isPassthrough: 0 })]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage',
    });

    const body = response.json();
    const record = body.data[0];
    expect(record.isStreamed).toBe(true);
    expect(record.isPassthrough).toBe(false);
  });

  // ── Pagination ───────────────────────────────────────────────────────

  it('respects the limit query parameter', async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      usageRow({ requestId: `page-${i}`, startTime: Date.now() - i * 1000 })
    );
    await db.insert(schema.requestUsage).values(rows);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?limit=2',
    });

    const body = response.json();
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(5);
  });

  it('respects the offset query parameter', async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      usageRow({ requestId: `offset-${i}`, startTime: Date.now() - i * 1000 })
    );
    await db.insert(schema.requestUsage).values(rows);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?limit=2&offset=2',
    });

    const body = response.json();
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(5);
  });

  it('uses default limit=50 and offset=0 when not specified', async () => {
    // Insert more than 50 records to test default limit
    const rows = Array.from({ length: 55 }, (_, i) =>
      usageRow({ requestId: `default-page-${i}`, startTime: Date.now() - i * 1000 })
    );
    await db.insert(schema.requestUsage).values(rows);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage',
    });

    const body = response.json();
    expect(body.data).toHaveLength(50);
    expect(body.total).toBe(55);
  });

  // ── Sorting ─────────────────────────────────────────────────────────

  it('sorts by date descending by default', async () => {
    await db.insert(schema.requestUsage).values([
      usageRow({
        requestId: 'sort-old',
        date: '2025-01-01T00:00:00.000Z',
        startTime: 1_735_689_600_000,
      }),
      usageRow({
        requestId: 'sort-new',
        date: '2025-06-01T00:00:00.000Z',
        startTime: 1_748_784_000_000,
      }),
    ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage',
    });

    const body = response.json();
    const ids = body.data.map((r: any) => r.requestId);
    expect(ids[0]).toBe('sort-new');
    expect(ids[1]).toBe('sort-old');
  });

  it('sorts by date ascending when sortDir=asc', async () => {
    await db.insert(schema.requestUsage).values([
      usageRow({
        requestId: 'sort-old',
        date: '2025-01-01T00:00:00.000Z',
        startTime: 1_735_689_600_000,
      }),
      usageRow({
        requestId: 'sort-new',
        date: '2025-06-01T00:00:00.000Z',
        startTime: 1_748_784_000_000,
      }),
    ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?sortBy=date&sortDir=asc',
    });

    const body = response.json();
    const ids = body.data.map((r: any) => r.requestId);
    expect(ids[0]).toBe('sort-old');
    expect(ids[1]).toBe('sort-new');
  });

  it('sorts by costTotal descending', async () => {
    await db
      .insert(schema.requestUsage)
      .values([
        usageRow({ requestId: 'cost-low', costTotal: 0.01 }),
        usageRow({ requestId: 'cost-high', costTotal: 5.0 }),
      ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?sortBy=costTotal&sortDir=desc',
    });

    const body = response.json();
    const ids = body.data.map((r: any) => r.requestId);
    expect(ids[0]).toBe('cost-high');
    expect(ids[1]).toBe('cost-low');
  });

  it('sorts by durationMs ascending', async () => {
    await db
      .insert(schema.requestUsage)
      .values([
        usageRow({ requestId: 'dur-long', durationMs: 5000 }),
        usageRow({ requestId: 'dur-short', durationMs: 100 }),
      ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?sortBy=durationMs&sortDir=asc',
    });

    const body = response.json();
    const ids = body.data.map((r: any) => r.requestId);
    expect(ids[0]).toBe('dur-short');
    expect(ids[1]).toBe('dur-long');
  });

  it('falls back to sorting by date desc for invalid sortBy', async () => {
    await db.insert(schema.requestUsage).values([
      usageRow({
        requestId: 'fb-old',
        date: '2025-01-01T00:00:00.000Z',
        startTime: 1_735_689_600_000,
      }),
      usageRow({
        requestId: 'fb-new',
        date: '2025-06-01T00:00:00.000Z',
        startTime: 1_748_784_000_000,
      }),
    ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?sortBy=nonexistent',
    });

    const body = response.json();
    const ids = body.data.map((r: any) => r.requestId);
    // Falls back to date desc
    expect(ids[0]).toBe('fb-new');
    expect(ids[1]).toBe('fb-old');
  });

  it('falls back to desc for invalid sortDir', async () => {
    await db.insert(schema.requestUsage).values([
      usageRow({
        requestId: 'dir-old',
        date: '2025-01-01T00:00:00.000Z',
        startTime: 1_735_689_600_000,
      }),
      usageRow({
        requestId: 'dir-new',
        date: '2025-06-01T00:00:00.000Z',
        startTime: 1_748_784_000_000,
      }),
    ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?sortDir=invalid',
    });

    const body = response.json();
    const ids = body.data.map((r: any) => r.requestId);
    expect(ids[0]).toBe('dir-new');
    expect(ids[1]).toBe('dir-old');
  });

  // ── Field projection ─────────────────────────────────────────────────

  it('returns only requested fields when fields param is provided', async () => {
    await db
      .insert(schema.requestUsage)
      .values([usageRow({ requestId: 'proj-1', provider: 'anthropic', costTotal: 1.5 })]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?fields=requestId,provider',
    });

    const body = response.json();
    expect(body.data).toHaveLength(1);
    const record = body.data[0];
    expect(Object.keys(record).sort()).toEqual(['provider', 'requestId']);
  });

  it('ignores invalid field names in the fields param', async () => {
    await db
      .insert(schema.requestUsage)
      .values([usageRow({ requestId: 'proj-2', provider: 'openai' })]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?fields=requestId,nonexistentField,provider',
    });

    const body = response.json();
    expect(body.data).toHaveLength(1);
    const record = body.data[0];
    // nonexistentField should be filtered out by USAGE_FIELDS allowlist
    expect(Object.keys(record).sort()).toEqual(['provider', 'requestId']);
  });

  it('returns all fields when fields param is not provided', async () => {
    await db.insert(schema.requestUsage).values([usageRow({ requestId: 'proj-3' })]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage',
    });

    const body = response.json();
    expect(body.data).toHaveLength(1);
    const record = body.data[0];
    // Should have many fields, not just a few
    expect(Object.keys(record).length).toBeGreaterThan(10);
    expect(record).toHaveProperty('requestId');
    expect(record).toHaveProperty('provider');
    expect(record).toHaveProperty('date');
  });

  it('preserves total count when field projection is active', async () => {
    await db
      .insert(schema.requestUsage)
      .values([usageRow({ requestId: 'proj-total-1' }), usageRow({ requestId: 'proj-total-2' })]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?fields=requestId',
    });

    const body = response.json();
    expect(body.total).toBe(2);
    expect(body.data).toHaveLength(2);
  });

  // ── Filters ─────────────────────────────────────────────────────────

  it('filters by startDate', async () => {
    await db
      .insert(schema.requestUsage)
      .values([
        usageRow({ requestId: 'start-old', date: '2025-01-01T00:00:00.000Z' }),
        usageRow({ requestId: 'start-new', date: '2025-06-15T00:00:00.000Z' }),
      ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?startDate=2025-06-01',
    });

    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.data[0].requestId).toBe('start-new');
  });

  it('filters by endDate', async () => {
    await db
      .insert(schema.requestUsage)
      .values([
        usageRow({ requestId: 'end-old', date: '2025-01-01T00:00:00.000Z' }),
        usageRow({ requestId: 'end-new', date: '2025-06-15T00:00:00.000Z' }),
      ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?endDate=2025-02-01',
    });

    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.data[0].requestId).toBe('end-old');
  });

  // ── startTime / endTime filters (epoch ms on startTime column) ────

  it('filters by startTime with epoch millisecond value', async () => {
    await db
      .insert(schema.requestUsage)
      .values([
        usageRow({ requestId: 'st-old', startTime: 1_735_689_600_000 }),
        usageRow({ requestId: 'st-new', startTime: 1_748_784_000_000 }),
      ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?startTime=1740000000000',
    });

    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.data[0].requestId).toBe('st-new');
  });

  it('includes records at the exact startTime boundary', async () => {
    const boundary = 1_748_784_000_000;
    await db
      .insert(schema.requestUsage)
      .values([
        usageRow({ requestId: 'st-before', startTime: boundary - 1 }),
        usageRow({ requestId: 'st-exact', startTime: boundary }),
        usageRow({ requestId: 'st-after', startTime: boundary + 1 }),
      ]);

    const response = await fastify.inject({
      method: 'GET',
      url: `/v0/management/usage?startTime=${boundary}`,
    });

    const body = response.json();
    expect(body.total).toBe(2);
    const ids = body.data.map((r: any) => r.requestId);
    expect(ids).toContain('st-exact');
    expect(ids).toContain('st-after');
  });

  it('filters by endTime with epoch millisecond value', async () => {
    await db
      .insert(schema.requestUsage)
      .values([
        usageRow({ requestId: 'et-old', startTime: 1_735_689_600_000 }),
        usageRow({ requestId: 'et-new', startTime: 1_748_784_000_000 }),
      ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?endTime=1740000000000',
    });

    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.data[0].requestId).toBe('et-old');
  });

  it('includes records at the exact endTime boundary', async () => {
    const boundary = 1_748_784_000_000;
    await db
      .insert(schema.requestUsage)
      .values([
        usageRow({ requestId: 'et-before', startTime: boundary - 1 }),
        usageRow({ requestId: 'et-exact', startTime: boundary }),
        usageRow({ requestId: 'et-after', startTime: boundary + 1 }),
      ]);

    const response = await fastify.inject({
      method: 'GET',
      url: `/v0/management/usage?endTime=${boundary}`,
    });

    const body = response.json();
    expect(body.total).toBe(2);
    const ids = body.data.map((r: any) => r.requestId);
    expect(ids).toContain('et-before');
    expect(ids).toContain('et-exact');
  });

  it('combines startTime and endTime for a range', async () => {
    await db
      .insert(schema.requestUsage)
      .values([
        usageRow({ requestId: 'range-before', startTime: 1_735_689_600_000 }),
        usageRow({ requestId: 'range-inside', startTime: 1_740_000_000_000 }),
        usageRow({ requestId: 'range-after', startTime: 1_748_784_000_000 }),
      ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?startTime=1735689600000&endTime=1740000000000',
    });

    const body = response.json();
    expect(body.total).toBe(2);
    const ids = body.data.map((r: any) => r.requestId);
    expect(ids).toContain('range-before');
    expect(ids).toContain('range-inside');
  });

  it('combines startTime/endTime with responseStatus filter', async () => {
    await db.insert(schema.requestUsage).values([
      usageRow({
        requestId: 'combo-st-1',
        startTime: 1_740_000_000_000,
        responseStatus: 'success',
      }),
      usageRow({
        requestId: 'combo-st-2',
        startTime: 1_740_000_000_000,
        responseStatus: 'error',
      }),
      usageRow({
        requestId: 'combo-st-3',
        startTime: 1_748_784_000_000,
        responseStatus: 'success',
      }),
    ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?startTime=1735000000000&endTime=1741000000000&responseStatus=success',
    });

    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.data[0].requestId).toBe('combo-st-1');
  });

  it('returns 400 when both startDate and startTime are provided', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?startDate=2025-06-01&startTime=1740000000000',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/startDate.*startTime/i);
  });

  it('returns 400 when both endDate and endTime are provided', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?endDate=2025-06-01&endTime=1740000000000',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/endDate.*endTime/i);
  });

  it('filters by apiKey with substring match by default', async () => {
    await db
      .insert(schema.requestUsage)
      .values([
        usageRow({ requestId: 'key-alpha', apiKey: 'alpha-key-prod' }),
        usageRow({ requestId: 'key-beta', apiKey: 'beta-key-dev' }),
      ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?apiKey=alpha',
    });

    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.data[0].requestId).toBe('key-alpha');
  });

  it('filters by incomingApiType with exact match', async () => {
    await db
      .insert(schema.requestUsage)
      .values([
        usageRow({ requestId: 'type-chat', incomingApiType: 'chat' }),
        usageRow({ requestId: 'type-embed', incomingApiType: 'embeddings' }),
      ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?incomingApiType=chat',
    });

    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.data[0].requestId).toBe('type-chat');
  });

  it('filters by provider with substring match', async () => {
    await db
      .insert(schema.requestUsage)
      .values([
        usageRow({ requestId: 'prov-anthropic', provider: 'anthropic' }),
        usageRow({ requestId: 'prov-openai', provider: 'openai' }),
      ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?provider=anthr',
    });

    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.data[0].requestId).toBe('prov-anthropic');
  });

  it('filters by responseStatus with exact match', async () => {
    await db
      .insert(schema.requestUsage)
      .values([
        usageRow({ requestId: 'status-ok', responseStatus: 'success' }),
        usageRow({ requestId: 'status-err', responseStatus: 'error' }),
      ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?responseStatus=error',
    });

    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.data[0].requestId).toBe('status-err');
  });

  it('filters by minDurationMs', async () => {
    await db
      .insert(schema.requestUsage)
      .values([
        usageRow({ requestId: 'dur-fast', durationMs: 50 }),
        usageRow({ requestId: 'dur-slow', durationMs: 5000 }),
      ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?minDurationMs=1000',
    });

    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.data[0].requestId).toBe('dur-slow');
  });

  it('filters by maxDurationMs', async () => {
    await db
      .insert(schema.requestUsage)
      .values([
        usageRow({ requestId: 'max-fast', durationMs: 50 }),
        usageRow({ requestId: 'max-slow', durationMs: 5000 }),
      ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?maxDurationMs=1000',
    });

    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.data[0].requestId).toBe('max-fast');
  });

  it('combines multiple filters', async () => {
    await db.insert(schema.requestUsage).values([
      usageRow({
        requestId: 'combo-1',
        provider: 'anthropic',
        responseStatus: 'success',
        durationMs: 200,
      }),
      usageRow({
        requestId: 'combo-2',
        provider: 'anthropic',
        responseStatus: 'error',
        durationMs: 200,
      }),
      usageRow({
        requestId: 'combo-3',
        provider: 'openai',
        responseStatus: 'success',
        durationMs: 200,
      }),
    ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?provider=anthropic&responseStatus=success',
    });

    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.data[0].requestId).toBe('combo-1');
  });

  // ── Limited-user scoping ────────────────────────────────────────────

  it('force-scopes to the limited user api key with exact match', async () => {
    // Register a hook that simulates the authenticate preHandler setting
    // request.principal for a limited user. In production this is done by the
    // management route scope, but registerUsageRoutes() alone doesn't add it.
    fastify.addHook('onRequest', async (request: any) => {
      request.principal = {
        role: 'limited',
        keyName: 'my-limited-key',
        allowedProviders: [],
        allowedModels: [],
        excludedProviders: [],
        excludedModels: [],
      } satisfies Principal;
    });

    await db.insert(schema.requestUsage).values([
      usageRow({ requestId: 'scope-mine', apiKey: 'my-limited-key' }),
      usageRow({ requestId: 'scope-other', apiKey: 'other-key' }),
      // apiKey containing 'my-limited-key' as a substring — exact match should exclude it
      usageRow({ requestId: 'scope-prefix', apiKey: 'prefix-my-limited-key-suffix' }),
    ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage',
    });

    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.data[0].requestId).toBe('scope-mine');
  });

  it('overrides client-supplied apiKey filter for limited users', async () => {
    fastify.addHook('onRequest', async (request: any) => {
      request.principal = {
        role: 'limited',
        keyName: 'my-limited-key',
        allowedProviders: [],
        allowedModels: [],
        excludedProviders: [],
        excludedModels: [],
      } satisfies Principal;
    });

    await db
      .insert(schema.requestUsage)
      .values([
        usageRow({ requestId: 'override-mine', apiKey: 'my-limited-key' }),
        usageRow({ requestId: 'override-other', apiKey: 'other-key' }),
      ]);

    // Even though the client asks for 'other-key', the limited-user scoping
    // should force the filter to 'my-limited-key' with exact match.
    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage?apiKey=other-key',
    });

    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.data[0].requestId).toBe('override-mine');
  });
});
