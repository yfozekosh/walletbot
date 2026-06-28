import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface TransactionRecord {
  id: string;
  account_id: string;
  payee: string | null;
  payer: string | null;
  note: string | null;
  amount_value: string | null;
  amount_currency: string | null;
  record_date: string;
  record_state: string | null;
  record_type: string | null;
  category_name: string | null;
  transfer: boolean | null;
  created_at: string | null;
}

export class DatabaseRepository {
  constructor(private db: SupabaseClient) {}

  async fetchRecordsForDate(date: string): Promise<TransactionRecord[]> {
    const { data, error } = await this.db
      .from("wallet_records")
      .select(`
        id, account_id, payee, payer, note,
        amount_value, amount_currency,
        record_date, record_state, record_type,
        category_name, transfer, created_at
      `)
      .eq("record_date", date)
      .order("account_id", { ascending: true });

    if (error) throw new Error(`fetchRecordsForDate: ${error.message}`);
    return (data ?? []) as TransactionRecord[];
  }

  async fetchRecordsForDateRange(start: string, end: string): Promise<TransactionRecord[]> {
    const { data, error } = await this.db
      .from("wallet_records")
      .select(`
        id, account_id, payee, payer, note,
        amount_value, amount_currency,
        record_date, record_state, record_type,
        category_name, transfer, created_at
      `)
      .gte("record_date", start)
      .lte("record_date", end)
      .order("account_id", { ascending: true });

    if (error) throw new Error(`fetchRecordsForDateRange: ${error.message}`);
    return (data ?? []) as TransactionRecord[];
  }

  async fetchAccountNames(): Promise<Record<string, { name: string; type: string | null }>> {
    const { data, error } = await this.db
      .from("wallet_accounts")
      .select("id, name, account_type");

    if (error) throw new Error(`fetchAccountNames: ${error.message}`);
    const result: Record<string, { name: string; type: string | null }> = {};
    for (const row of data ?? []) {
      result[row.id] = { name: row.name, type: row.account_type };
    }
    return result;
  }

  async fetchShownRecordIds(): Promise<Set<string>> {
    const { data, error } = await this.db
      .from("wallet_shown_transactions")
      .select("record_id");

    if (error) throw new Error(`fetchShownRecordIds: ${error.message}`);
    return new Set((data ?? []).map(r => r.record_id));
  }

  async markAsShown(recordIds: string[]): Promise<void> {
    if (recordIds.length === 0) return;
    const rows = recordIds.map(id => ({ record_id: id, trigger_type: "cron" }));
    const { error } = await this.db
      .from("wallet_shown_transactions")
      .upsert(rows, { onConflict: "record_id" });
    if (error) throw new Error(`markAsShown: ${error.message}`);
  }
}

export function createRepository(supabaseUrl: string, serviceKey: string): DatabaseRepository {
  const db = createClient(supabaseUrl, serviceKey);
  return new DatabaseRepository(db);
}
