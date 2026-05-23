import { sql } from 'drizzle-orm';
import { getDatabase, getCurrentDialect } from './client';
import { logger } from '../utils/logger';

/**
 * SQLite epoch-ms expression: seconds + fractional milliseconds → integer.
 * e.g. CAST(strftime('%s','now') || substr(strftime('%f','now'),instr(strftime('%f','now'),'.')+1,3) AS INTEGER)
 */
const SQLITE_EPOCH_MS = `CAST(strftime('%s','now') || substr(strftime('%f','now'),instr(strftime('%f','now'),'.')+1,3) AS INTEGER)`;

/**
 * Creates the database triggers that automatically set `updated_at` on
 * every INSERT and UPDATE to the `request_usage` table.
 *
 * This runs at startup after schema migrations, because Drizzle ORM cannot
 * express triggers in its schema definitions. The triggers are created with
 * idempotent SQL (IF NOT EXISTS / CREATE OR REPLACE) so this function is
 * safe to call multiple times.
 *
 * Existing rows that predate this column have `updated_at = 0` (the column
 * default), which correctly indicates "unknown — predates tracking".
 */
export async function ensureUpdatedAtTriggers(): Promise<void> {
  const db = getDatabase();
  const dialect = getCurrentDialect();

  logger.debug(`Creating request_usage updated_at triggers (${dialect})`);

  if (dialect === 'sqlite') {
    // SQLite: AFTER triggers that UPDATE the row's updated_at column.
    // IF NOT EXISTS makes this idempotent.
    await db.run(
      sql.raw(`
      CREATE TRIGGER IF NOT EXISTS trg_request_usage_ins_updated_at
      AFTER INSERT ON request_usage
      FOR EACH ROW
      BEGIN
        UPDATE request_usage SET updated_at = ${SQLITE_EPOCH_MS} WHERE id = NEW.id;
      END
    `)
    );
    await db.run(
      sql.raw(`
      CREATE TRIGGER IF NOT EXISTS trg_request_usage_upd_updated_at
      AFTER UPDATE ON request_usage
      FOR EACH ROW
      BEGIN
        UPDATE request_usage SET updated_at = ${SQLITE_EPOCH_MS} WHERE id = NEW.id;
      END
    `)
    );
  } else {
    // Postgres: BEFORE triggers that modify NEW.updated_at directly.
    // CREATE OR REPLACE FUNCTION makes the function idempotent;
    // IF NOT EXISTS makes the triggers idempotent.
    await db.execute(
      sql.raw(`
      CREATE OR REPLACE FUNCTION trg_request_usage_set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `)
    );
    await db.execute(
      sql.raw(`
      CREATE TRIGGER IF NOT EXISTS trg_request_usage_ins_updated_at
        BEFORE INSERT ON request_usage
        FOR EACH ROW
        EXECUTE FUNCTION trg_request_usage_set_updated_at()
    `)
    );
    await db.execute(
      sql.raw(`
      CREATE TRIGGER IF NOT EXISTS trg_request_usage_upd_updated_at
        BEFORE UPDATE ON request_usage
        FOR EACH ROW
        EXECUTE FUNCTION trg_request_usage_set_updated_at()
    `)
    );
  }

  logger.debug('request_usage updated_at triggers created');
}
