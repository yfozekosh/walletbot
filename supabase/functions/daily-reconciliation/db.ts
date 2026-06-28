import postgres from "npm:postgres";
import { DBRecord } from "./types.ts";
import { config } from "./config.ts";

let sql: ReturnType<typeof postgres> | null = null;

function getSql() {
  if (sql) return sql;

  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (dbUrl) {
    sql = postgres(dbUrl, {
      max: 2,
      idle_timeout: 10,
      connect_timeout: 10,
      max_lifetime: 60 * 2,
      connection: { application_name: "daily-reconciliation" },
    });
    return sql;
  }

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const dbPassword = Deno.env.get("SUPABASE_DB_PASSWORD");
  if (!projectUrl || !dbPassword) {
    throw new Error("Missing DB connection config");
  }
  const projectRef = new URL(projectUrl).hostname.split(".")[0];
  const conn = `postgresql://postgres:${dbPassword}@db.${projectRef}.supabase.co:5432/postgres`;
  sql = postgres(conn, {
    max: 2,
    idle_timeout: 10,
    connect_timeout: 10,
    max_lifetime: 60 * 2,
    connection: { application_name: "daily-reconciliation" },
  });
  return sql;
}

export async function loadConfig() {
  const db = getSql();
  const rows = await db`SELECT key, value FROM app_config WHERE key IN ('SHEET_ID', 'GCP_SERVICE_ACCOUNT_KEY')`;
  for (const r of rows) {
    if (r.key === "SHEET_ID") config.sheetId = r.value;
  }
}

function formatDate(d: unknown): string {
  if (d instanceof Date) {
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  }
  return String(d ?? "").slice(0, 10);
}

export function parseCents(s: string | null | undefined): number {
  if (!s) return 0;
  try {
    return Math.abs(parseInt(s, 10));
  } catch {
    return 0;
  }
}

export function centsToEur(cents: number): number {
  return Math.round(cents) / 100;
}

export async function fetchCurrentMonthExpenses(
  year: number,
  month: number
): Promise<DBRecord[]> {
  const db = getSql();
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const rows = await db`
    SELECT wr.id, wr.record_date, wr.note, wr.category_name,
           wr.amount_value, wa.name as account_name, wr.payee
    FROM wallet_records wr
    LEFT JOIN wallet_accounts wa ON wr.account_id = wa.id
    WHERE wr.record_date >= ${monthStart}
      AND wr.record_date < ${monthEnd}
      AND (wr.transfer IS NULL OR wr.transfer = false)
      AND wr.category_id != ${Deno.env.get("TRANSFER_CATEGORY_ID") ?? "244ba639-43e7-4c23-9af4-1787524a906c"}
      AND wa.name IS NOT NULL
    ORDER BY wr.record_date
  `;

  return rows.map((r: Record<string, unknown>) => ({
    id: String(r.id ?? ""),
    recordDate: formatDate(r.record_date),
    note: String(r.note ?? ""),
    categoryName: String(r.category_name ?? ""),
    amountValue: String(r.amount_value ?? ""),
    accountName: String(r.account_name ?? ""),
    payee: String(r.payee ?? ""),
    amountEur: centsToEur(parseCents(String(r.amount_value ?? ""))),
  }));
}
