import { DBRecord, EnvelopeCheck, EnvelopeRow, MatchResult, Report, SheetItem, SummaryCheck } from "./types.ts";
import { parseEuro } from "./google-sheets.ts";
import { config } from "./config.ts";

export function parseSheetItems(rows: unknown[][]): SheetItem[] {
  return rows.slice(1).map((row) => {
    const get = (i: number) => String(row[i] ?? "").trim();
    return {
      name: get(0),
      type: get(1),
      account: get(2),
      description: get(3),
      frequency: get(4),
      perMonth: get(5),
      totalAmount: get(6),
      accumulated: get(7),
      category: get(8),
      subcategory: get(9),
      startDate: get(10),
      nextPayment: get(11),
      dayMin: get(12),
      dayMax: get(13),
      wasPrice: get(14),
      exactPrice: get(15),
      comment: get(16),
      rounding: parseEuro(get(17)),
      writtenOff: parseEuro(get(18)),
      envelope: get(20),
    };
  });
}

export function parseEnvelopeRows(rows: unknown[][]): EnvelopeRow[] {
  const envelopes: EnvelopeRow[] = [];
  for (const row of rows) {
    const label = String(row[20] ?? "").trim();
    if (!label) continue;
    const subHeader = String(row[21] ?? "").trim();
    if (subHeader === "Start") continue;

    envelopes.push({
      label,
      start: parseEuro(row[21]),
      max: parseEuro(row[22]),
      shouldToday: parseEuro(row[23]),
      shouldEnd: parseEuro(row[24]),
      realToday: parseEuro(row[25]),
      excess: parseEuro(row[26]),
      diff: parseEuro(row[27]),
    });
  }
  return envelopes;
}

function sheetAccountToDbAccount(sheetAccount: string): string | null {
  return config.sheetAccountToDb[sheetAccount] ?? null;
}

function dbAccountToSheetEnvelope(dbAccount: string): string | null {
  const map: Record<string, string> = {
    "Sparkasse": "spar",
    "Mazda 3": "mazda car space(6075)",
    "Amortization": "n26 amort (5767)",
    "Salary": "n26 salary (6722)",
    "Food": "yura n26 food",
    "Mono eur": "mono",
  };
  return map[dbAccount] ?? null;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchesByNoteKeywords(sheetName: string, dbNote: string): boolean {
  const keywords: Record<string, string[]> = {
    "miete": ["miete"],
    "strom": ["strom"],
    "mazda leasing": ["bank11"],
    "mazda tax": ["kfz-steuer", "taxes"],
    "mazda insurance": ["yf 105", "beitrag"],
    "easypark": ["easypark"],
    "internet": ["telekom"],
    "vpn": ["vpn"],
    "haftpflicht": ["haftpflicht"],
    "zahnversicherung": ["zahn"],
    "oura": ["oura"],
    "phone yurii": ["phone", "handy"],
    "парковка": ["contipark"],
    "entgeld": ["entgeld"],
    "mazda wartung": ["pitstop"],
    "happydog": ["futterhaus", "hund"],
    "ard": ["ard", "rundfunk", "beitrag"],
    "бензин": ["star", "k-oil", "aral", "orlen", "tanke"],
  };

  const sn = normalize(sheetName);
  for (const [key, words] of Object.entries(keywords)) {
    if (sn.includes(normalize(key))) {
      return words.some((w) => normalize(dbNote).includes(w));
    }
  }
  return false;
}

function isMonthly(freq: string): boolean {
  try {
    const f = parseFloat(freq.replace(",", "."));
    return f === 1;
  } catch {
    return false;
  }
}

function isDueInCurrentMonth(nextPayment: string): boolean {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const y = String(now.getFullYear());
  const ys = y.slice(2);
  return nextPayment.includes(`${m}.${y}`) ||
    nextPayment.includes(`${m}.${ys}`);
}

function shouldSkipItem(item: SheetItem): boolean {
  if (isMonthly(item.frequency)) return false;
  if (isDueInCurrentMonth(item.nextPayment)) return false;
  const longFreqs = ["12", "24", "48", "60", "3", "6"];
  const freqNum = item.frequency.replace(",", ".");
  if (longFreqs.includes(freqNum)) return true;
  if (item.writtenOff === 0) return true;
  return false;
}

export function compare(
  sheetRows: unknown[][],
  dbRecords: DBRecord[],
  month: string,
): Report {
  const allItems = parseSheetItems(sheetRows).filter((it) => it.name);
  const activeItems = allItems.filter((it) => it.writtenOff > 0);

  const trackedAccounts = new Set(Object.values(config.sheetAccountToDb));

  const matched: MatchResult[] = [];
  const discrepancies: MatchResult[] = [];
  const extraInDb: MatchResult[] = [];
  const usedDbRecords = new Set<string>();

  for (const item of activeItems) {
    const dbAccount = sheetAccountToDbAccount(item.account);
    const candidates = dbRecords.filter((r) => {
      if (usedDbRecords.has(r.id)) return false;
      if (dbAccount && r.accountName !== dbAccount) return false;
      const amountMatch = Math.abs(r.amountEur - item.writtenOff) < 2;
      return amountMatch;
    });

    const keywordMatch = candidates.find((r) => matchesByNoteKeywords(item.name, r.note));
    const bestMatch = keywordMatch ?? candidates[0];

    if (bestMatch) {
      const amountDiff = Math.abs(bestMatch.amountEur - item.writtenOff);
      if (amountDiff < 0.02) {
        matched.push({
          status: "matched",
          sheetName: item.name,
          sheetAmount: item.writtenOff,
          dbNote: bestMatch.note,
          dbDate: bestMatch.recordDate,
          dbAmount: bestMatch.amountEur,
          dbAccount: bestMatch.accountName,
        });
      } else {
        discrepancies.push({
          status: "amount_mismatch",
          sheetName: item.name,
          sheetAmount: item.writtenOff,
          dbNote: bestMatch.note,
          dbDate: bestMatch.recordDate,
          dbAmount: bestMatch.amountEur,
          dbAccount: bestMatch.accountName,
          detail: `Sheet: €${item.writtenOff.toFixed(2)}, DB: €${bestMatch.amountEur.toFixed(2)}`,
        });
      }
      usedDbRecords.add(bestMatch.id);
    } else {
      discrepancies.push({
        status: "missing_from_db",
        sheetName: item.name,
        sheetAmount: item.writtenOff,
        sheetAccount: item.account,
        detail: `Written off €${item.writtenOff.toFixed(2)} not found in DB`,
      });
    }
  }

  for (const r of dbRecords) {
    if (usedDbRecords.has(r.id)) continue;
    if (!trackedAccounts.has(r.accountName)) continue;
    if (config.excludedCategories.includes(r.categoryName)) continue;
    if (config.excludedNotes.some((n) => r.note.includes(n))) continue;
    extraInDb.push({
      status: "extra_in_db",
      sheetName: "",
      dbNote: r.note,
      dbDate: r.recordDate,
      dbAmount: r.amountEur,
      dbAccount: r.accountName,
      dbCategory: r.categoryName,
      detail: `€${r.amountEur.toFixed(2)} — ${r.note.slice(0, 60)}`,
    });
  }

  const envelopes = parseEnvelopeRows(sheetRows);

  const envelopeChecks: EnvelopeCheck[] = [];
  for (const env of envelopes) {
    const dbAccount = config.envelopeToAccount[env.label];
    if (dbAccount === null) {
      envelopeChecks.push({
        label: env.label,
        maxOk: true,
        maxDetail: "external",
        excessOk: true,
        diffOk: true,
      });
      continue;
    }

    const computedMax = allItems
      .filter((it) => it.envelope === env.label)
      .reduce((s, it) => s + it.rounding, 0);

    const maxOk = Math.abs(computedMax - env.max) < 1;
    const maxDetail = maxOk ? `Max=${env.max} ✓` : `Max=${env.max}, computed=${computedMax} ✗`;

    const expectedExcess = env.realToday - env.shouldEnd;
    const excessOk = Math.abs(expectedExcess - env.excess) < 0.02;
    const expectedDiff = env.realToday - env.shouldToday;
    const diffOk = Math.abs(expectedDiff - env.diff) < 0.02;

    envelopeChecks.push({
      label: env.label,
      maxOk,
      maxDetail,
      excessOk,
      diffOk,
    });
  }

  const totalSheet = activeItems.reduce((s, i) => s + i.writtenOff, 0);
  const totalDb = dbRecords.reduce((s, r) => s + r.amountEur, 0);

  const summaryCheck: SummaryCheck = checkSummary(envelopes);

  return {
    month,
    date: new Date().toISOString().slice(0, 10),
    totalSheet,
    totalDb,
    matched,
    discrepancies,
    extraInDb,
    envelopeChecks,
    summaryCheck,
  };
}

function checkSummary(envelopes: EnvelopeRow[]): SummaryCheck {
  let sumFixed = 0;
  let sumSalary = 0;
  let sumLeft = 0;
  let totalFixed = 0;
  let totalSalary = 0;

  for (const env of envelopes) {
    if (env.label === "total spending") totalFixed = env.max;
    else if (env.label === "salary") totalSalary = env.max;
    else if (env.label === "left") sumLeft = env.realToday;
    else {
      sumFixed += env.max;
      if (env.label === "n26 salary (6722)") sumSalary += env.max;
    }
  }

  const expectedLeft = totalSalary - totalFixed;
  const leftOk = Math.abs(expectedLeft - sumLeft) < 2;
  const detail = leftOk
    ? `ЗП(${totalSalary})−Фіксовані(${totalFixed})=Залишок(${sumLeft}) ✓`
    : `ЗП(${totalSalary})−Фіксовані(${totalFixed})=${expectedLeft}, got Залишок=${sumLeft} ✗`;

  return { ok: leftOk, detail };
}

export function buildMessage(report: Report): string {
  const lines: string[] = [];
  lines.push(`<b>📊 Daily Reconciliation — ${report.month}</b>`);
  lines.push(`<i>🕐 ${report.date}</i>`);
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━");

  const totalItems = report.matched.length + report.discrepancies.length;
  lines.push(
    `✅ ${report.matched.length}/${totalItems} items matched`,
  );
  if (report.discrepancies.length > 0) {
    lines.push(`❌ ${report.discrepancies.length} discrepancies`);
  }
  if (report.extraInDb.length > 0) {
    lines.push(`➕ ${report.extraInDb.length} extra in DB`);
  }

  if (report.discrepancies.length > 0) {
    lines.push("", "<b>❌ Discrepancies:</b>");
    for (const d of report.discrepancies) {
      if (d.status === "missing_from_db") {
        lines.push(
          `• ${esc(d.sheetName)} — sheet: €${fmt(d.sheetAmount!)} — <i>${esc(d.detail ?? "")}</i>`,
        );
      } else {
        lines.push(
          `• ${esc(d.sheetName)} — ${esc(d.detail ?? "")}`,
        );
      }
    }
  }

  if (report.extraInDb.length > 0) {
    lines.push("", "<b>➕ Extra in DB (not in sheet):</b>");
    for (const e of report.extraInDb.slice(0, 10)) {
      lines.push(`• ${esc(e.dbDate ?? "")} ${esc(e.detail ?? "")}`);
    }
    if (report.extraInDb.length > 10) {
      lines.push(`• ... and ${report.extraInDb.length - 10} more`);
    }
  }

  lines.push("", "<b>📨 Envelope check:</b>");
  for (const ec of report.envelopeChecks) {
    const marks = [];
    if (ec.maxOk) marks.push("Max✓");
    else marks.push("Max✗");
    if (ec.excessOk) marks.push("Excess✓");
    else marks.push("Excess✗");
    if (ec.diffOk) marks.push("Diff✓");
    else marks.push("Diff✗");
    lines.push(`  ${esc(ec.label)} — ${marks.join(" ")} ${esc(ec.maxDetail)}`);
  }

  lines.push("", `<b>📊 Summary:</b> ${esc(report.summaryCheck.detail)}`);
  lines.push(
    "",
    `<i>🤖 Kaufbot · ${new Date().toLocaleString("de-DE", { hour: "2-digit", minute: "2-digit" })}</i>`,
  );

  return lines.join("\n");
}

function esc(s: string | number | undefined | null): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmt(n: number): string {
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
