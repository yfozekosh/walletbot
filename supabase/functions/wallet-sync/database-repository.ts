import { config } from "./config.ts";
import type { SyncStats } from "./types.ts";
import sql from "./db.ts";

function sanitize(val: unknown): unknown {
  return val === undefined ? null : val;
}

function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = sanitize(v);
  }
  return out;
}

const ALLOWED_TABLES = new Set([
  "wallet_sync_state",
  "wallet_accounts",
  "wallet_categories",
  "wallet_labels",
  "wallet_budgets",
  "wallet_goals",
  "wallet_records",
]);

function assertTable(table: string): void {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }
}

export class DatabaseRepository {
  async getSyncState(entity: string): Promise<string | null> {
    const rows = await sql`
      SELECT last_synced_at FROM wallet_sync_state WHERE entity = ${entity}
    `;
    if (rows.length === 0) return null;
    const val = rows[0].last_synced_at;
    if (val instanceof Date) return val.toISOString();
    return String(val);
  }

  async setSyncState(entity: string, syncedAt: string): Promise<void> {
    await sql`
      INSERT INTO wallet_sync_state (entity, last_synced_at)
      VALUES (${entity}, ${syncedAt})
      ON CONFLICT (entity) DO UPDATE SET last_synced_at = ${syncedAt}
    `;
  }

  async getExistingIds(table: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    assertTable(table);

    const result = new Set<string>();
    for (let i = 0; i < ids.length; i += config.dbBatchSize) {
      const batch = ids.slice(i, i + config.dbBatchSize);
      const rows = await sql`
        SELECT id FROM ${sql(table)} WHERE id = ANY(${batch})
      `;
      for (const row of rows) {
        result.add(row.id);
      }
    }
    return result;
  }

  async getLocalValues(
    table: string,
    ids: string[],
    fields: string[],
  ): Promise<Map<string, Record<string, unknown>>> {
    if (ids.length === 0) return new Map();
    assertTable(table);

    const result = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < ids.length; i += config.dbBatchSize) {
      const batch = ids.slice(i, i + config.dbBatchSize);
      const rows = await sql`
        SELECT id, ${sql(fields)} FROM ${sql(table)} WHERE id = ANY(${batch})
      `;
      for (const row of rows) {
        result.set(row.id, row);
      }
    }
    return result;
  }

  async upsertRows(
    table: string,
    rows: Record<string, unknown>[],
    preserveLocalFields?: string[],
  ): Promise<SyncStats> {
    const stats: SyncStats = { fetched: rows.length, added: 0, updated: 0 };
    if (rows.length === 0) return stats;
    assertTable(table);

    const ids = rows.map((r) => r.id as string).filter(Boolean);
    const existingIds = await this.getExistingIds(table, ids);

    let finalRows = rows;
    if (preserveLocalFields && preserveLocalFields.length > 0) {
      const localValues = await this.getLocalValues(
        table,
        ids,
        preserveLocalFields,
      );
      finalRows = rows.map((row) => {
        const local = localValues.get(row.id as string);
        if (!local) return row;
        const merged = { ...row };
        for (const field of preserveLocalFields!) {
          if (local[field] !== undefined && local[field] !== row[field]) {
            merged[field] = local[field];
          }
        }
        return merged;
      });
    }

    for (const row of finalRows) {
      const id = row.id as string;
      if (!existingIds.has(id)) {
        stats.added++;
      } else {
        stats.updated++;
      }
    }

    const columns = Object.keys(finalRows[0]);
    const sanitizedRows = finalRows.map(sanitizeRow);
    for (let i = 0; i < sanitizedRows.length; i += config.dbBatchSize) {
      const batch = sanitizedRows.slice(i, i + config.dbBatchSize);

      const placeholders = batch.map((_, bi) =>
        `(${columns.map((_, ci) => `$${bi * columns.length + ci + 1}`).join(", ")})`
      ).join(", ");

      const flatValues = batch.flatMap((row) => columns.map((col) => row[col]));

      await sql.unsafe(
        `INSERT INTO ${table} (${columns.map((c) => `"${c}"`).join(", ")})
         VALUES ${placeholders}
         ON CONFLICT (id) DO UPDATE SET ${
          columns.filter((c) => c !== "id").map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ")
        }`,
        flatValues,
      );
    }

    return stats;
  }

  async getLocalRecordIds(
    windowStart: string,
    windowEnd: string,
  ): Promise<Set<string>> {
    const result = new Set<string>();
    let offset = 0;
    while (true) {
      const rows = await sql`
        SELECT id FROM wallet_records
        WHERE record_date >= ${windowStart} AND record_date <= ${windowEnd}
        ORDER BY id
        LIMIT ${config.dbBatchSize} OFFSET ${offset}
      `;
      for (const row of rows) result.add(row.id);
      if (rows.length < config.dbBatchSize) break;
      offset += config.dbBatchSize;
    }
    return result;
  }

  async deleteRecords(ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i += config.dbBatchSize) {
      const batch = ids.slice(i, i + config.dbBatchSize);
      await sql`
        DELETE FROM wallet_records WHERE id = ANY(${batch})
      `;
    }
  }
}

export function createRepository(): DatabaseRepository {
  return new DatabaseRepository();
}
