import { JWT } from "npm:google-auth-library@9.14.0";
import { sheets } from "npm:@googleapis/sheets@9.3.1";
import postgres from "npm:postgres";
import { config } from "./config.ts";

let sheetsClient: ReturnType<typeof sheets>["spreadsheets"] | null = null;
let lastTokenRefresh = 0;

export function parseEuro(s: string | number | null | undefined): number {
  const str = typeof s === "number" ? String(s) : (s ?? "");
  if (!str.trim()) return 0;
  return parseFloat(
    str
      .replace("€", "")
      .replace(/\u00a0/g, "")
      .replace(/\s/g, "")
      .replace(",", ".")
  );
}

let _db: ReturnType<typeof postgres> | null = null;
function getDb() {
  if (_db) return _db;
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (dbUrl) {
    _db = postgres(dbUrl, { max: 1, idle_timeout: 10, connect_timeout: 10, connection: { application_name: "daily-rec-gsheets" } });
    return _db;
  }
  const projectUrl = Deno.env.get("SUPABASE_URL");
  const dbPassword = Deno.env.get("SUPABASE_DB_PASSWORD");
  if (!projectUrl || !dbPassword) throw new Error("Missing DB config");
  const projectRef = new URL(projectUrl).hostname.split(".")[0];
  _db = postgres(`postgresql://postgres:${dbPassword}@db.${projectRef}.supabase.co:5432/postgres`, { max: 1, idle_timeout: 10, connect_timeout: 10, connection: { application_name: "daily-rec-gsheets" } });
  return _db;
}

async function getServiceAccountKey() {
  const db = getDb();
  const rows = await db`SELECT value FROM app_config WHERE key = 'GCP_SERVICE_ACCOUNT_KEY'`;
  if (rows.length === 0) throw new Error("GCP_SERVICE_ACCOUNT_KEY not found in app_config");
  return JSON.parse(rows[0].value);
}

async function ensureClient() {
  if (sheetsClient && Date.now() - lastTokenRefresh < 1800000) {
    return sheetsClient;
  }

  const key = await getServiceAccountKey();
  const jwt = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: [config.google.scope],
  });

  const client = sheets({
    version: "v4",
    auth: jwt,
  });

  sheetsClient = client.spreadsheets;
  lastTokenRefresh = Date.now();
  return sheetsClient;
}

export async function fetchSheetTabNames(): Promise<string[]> {
  const client = await ensureClient();
  const resp = await client.get({
    spreadsheetId: config.sheetId,
  });

  const raw = resp.data.sheets ?? [];
  return raw.map((s) => s.properties?.title ?? "").filter(Boolean);
}

export async function fetchSheetRange(
  tabName: string,
  range: string = config.sheetRange
): Promise<string[][]> {
  const client = await ensureClient();
  const resp = await client.values.get({
    spreadsheetId: config.sheetId,
    range: `${tabName}!${range}`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  return (resp.data.values as string[][]) ?? [];
}
