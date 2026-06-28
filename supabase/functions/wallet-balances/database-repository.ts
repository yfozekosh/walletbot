import { config } from "./config.ts";
import type { AccountInfo, BudgetInfo, AccountMapEntry } from "./types.ts";
import sql from "./db.ts";

export class DatabaseRepository {
  async fetchBalancesAndBudgets(): Promise<{ accounts: AccountInfo[] }> {
    const [accountsRows] = await Promise.all([
      sql`SELECT * FROM get_wallet_balances()`,
    ]);

    let accounts: AccountInfo[] = [];

    if (accountsRows.length > 0 && accountsRows[0].get_wallet_balances) {
      accounts = accountsRows[0].get_wallet_balances as AccountInfo[];
    }

    return { accounts };
  }

  async fetchAccountMap(): Promise<{ accountMap: Record<string, AccountMapEntry>; identifierToAccount: Record<string, string> }> {
    const rows = await sql`SELECT id, name, bank_account_number, transfer_aliases FROM wallet_accounts`;

    const accountMap: Record<string, AccountMapEntry> = {};
    const identifierToAccount: Record<string, string> = {};

    for (const a of rows) {
      const aliases = (a.transfer_aliases as string[]) ?? [];
      accountMap[a.id] = {
        name: a.name,
        bank_account_number: a.bank_account_number,
        currency: config.defaultCurrency,
        aliases,
      };
      if (a.bank_account_number) identifierToAccount[a.bank_account_number] = a.id;
      for (const alias of aliases) identifierToAccount[alias] = a.id;
    }

    return { accountMap, identifierToAccount };
  }

  async fetchMonthRecords(
    monthStart: string,
    monthEnd: string
  ): Promise<{ amount_value: string | null; amount_currency: string | null; base_amount_value: string | null; record_type: string | null }[]> {
    const rows = await sql`
      SELECT amount_value, amount_currency, base_amount_value, record_type
      FROM wallet_records
      WHERE record_date >= ${monthStart}
        AND record_date < ${monthEnd}
        AND category_id != ${config.transferCategoryId}
    `;
    return rows as { amount_value: string | null; amount_currency: string | null; base_amount_value: string | null; record_type: string | null }[];
  }

  async fetchTransferRecords(
    monthStart: string
  ): Promise<{ id: string; account_id: string | null; record_date: string | null; note: string | null; amount_value: string | null; payee: string | null }[]> {
    const rows = await sql`
      SELECT id, account_id, record_date, note, amount_value, payee
      FROM wallet_records
      WHERE category_id = ${config.transferCategoryId}
        AND record_date >= ${monthStart}
    `;
    return rows as { id: string; account_id: string | null; record_date: string | null; note: string | null; amount_value: string | null; payee: string | null }[];
  }

  async fetchLastSyncTime(): Promise<string | null> {
    const rows = await sql`
      SELECT last_synced_at FROM wallet_sync_state
      ORDER BY last_synced_at DESC
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    const val = rows[0].last_synced_at;
    if (val instanceof Date) return val.toISOString();
    return String(val);
  }

  async fetchLatestRecordDate(): Promise<string | null> {
    const rows = await sql`
      SELECT record_date FROM wallet_records
      ORDER BY record_date DESC
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    const val = rows[0].record_date;
    if (val instanceof Date) return val.toISOString().slice(0, 10);
    return String(val ?? '');
  }

  async fetchLatestRecordPerAccount(): Promise<Record<string, string>> {
    const rows = await sql`
      SELECT account_id, created_at FROM wallet_records
      ORDER BY created_at DESC
    `;
    const result: Record<string, string> = {};
    for (const row of rows) {
      if (!result[row.account_id]) {
        const val = row.created_at;
        result[row.account_id] = val instanceof Date ? val.toISOString() : String(val);
      }
    }
    return result;
  }
}

export function createRepository(): DatabaseRepository {
  return new DatabaseRepository();
}
