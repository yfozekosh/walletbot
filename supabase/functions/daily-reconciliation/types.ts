export interface SheetItem {
  name: string;
  type: string;
  account: string;
  description: string;
  frequency: string;
  perMonth: string;
  totalAmount: string;
  accumulated: string;
  category: string;
  subcategory: string;
  startDate: string;
  nextPayment: string;
  dayMin: string;
  dayMax: string;
  wasPrice: string;
  exactPrice: string;
  comment: string;
  rounding: number;
  writtenOff: number;
  envelope: string;
}

export interface DBRecord {
  id: string;
  recordDate: string;
  note: string;
  categoryName: string;
  amountValue: string;
  accountName: string;
  payee: string;
  amountEur: number;
}

export interface EnvelopeRow {
  label: string;
  start: number;
  max: number;
  shouldToday: number;
  shouldEnd: number;
  realToday: number;
  excess: number;
  diff: number;
}

export interface MatchResult {
  status: "matched" | "amount_mismatch" | "missing_from_db" | "extra_in_db";
  sheetName: string;
  sheetAmount?: number;
  sheetAccount?: string;
  dbNote?: string;
  dbDate?: string;
  dbAmount?: number;
  dbAccount?: string;
  dbCategory?: string;
  detail?: string;
}

export interface EnvelopeCheck {
  label: string;
  maxOk: boolean;
  maxDetail: string;
  excessOk: boolean;
  diffOk: boolean;
}

export interface SummaryCheck {
  ok: boolean;
  detail: string;
}

export interface Report {
  month: string;
  date: string;
  totalSheet: number;
  totalDb: number;
  matched: MatchResult[];
  discrepancies: MatchResult[];
  extraInDb: MatchResult[];
  envelopeChecks: EnvelopeCheck[];
  summaryCheck: SummaryCheck;
}
