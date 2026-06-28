import { TransactionRecord } from "./database-repository.ts";
import { config } from "./config.ts";

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmt(value: number, currency: string): string {
  const sign = value < 0 ? "-" : "";
  const formatted = Math.abs(value).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${formatted} ${esc(currency)}`;
}

function accountEmoji(type: string | null): string {
  switch ((type ?? "").toLowerCase()) {
    case "currentaccount": return "\uD83C\uDFE6";
    case "savings":        return "\uD83D\uDC37";
    case "creditcard":     return "\uD83D\uDCB3";
    case "cash":           return "\uD83D\uDCB5";
    case "investment":     return "\uD83D\uDCC8";
    case "loan":           return "\uD83D\uDCCB";
    case "mortgage":       return "\uD83C\uDFE0";
    default:               return "\uD83D\uDCB0";
  }
}

function typeEmoji(recordType: string | null, isTransfer: boolean | null): string {
  if (isTransfer) return "\u2195\uFE0F";
  switch (recordType) {
    case "income":  return "\uD83D\uDCE5";
    case "expense": return "\uD83D\uDCE4";
    default:        return "\uD83D\uDCB0";
  }
}

function formatDateTime(recordDate: string, createdAt: string | null): string {
  const d = new Date(recordDate);
  const dateStr = d.toLocaleDateString("en-GB", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "short",
  });
  if (createdAt) {
    const t = new Date(createdAt);
    const timeStr = t.toLocaleTimeString("de-DE", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${dateStr} ${timeStr}`;
  }
  return dateStr;
}

export interface BuildMessageOptions {
  mode: "cron" | "command";
  omittedCount?: number;
}

export class TelegramPresenter {
  buildMessage(
    records: TransactionRecord[],
    accountNames: Record<string, { name: string; type: string | null }>,
    dateLabel: string,
    options: BuildMessageOptions = { mode: "command" }
  ): string {
    const lines: string[] = [];

    if (options.mode === "cron") {
      lines.push(`<b>\uD83D\uDCB3 Transactions (cron) \u2014 ${esc(dateLabel)}</b>`);
      if (options.omittedCount && options.omittedCount > 0) {
        lines.push(`<i>${options.omittedCount} already shown, skipped</i>`);
      }
    } else {
      lines.push(`<b>\uD83D\uDCB3 Transactions \u2014 ${esc(dateLabel)}</b>`);
    }
    lines.push("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");

    if (records.length === 0) {
      lines.push("");
      if (options.mode === "cron") {
        lines.push(`<i>No new transactions for ${esc(dateLabel)}.</i>`);
      } else {
        lines.push(`<i>No transactions for ${esc(dateLabel)}.</i>`);
      }
      lines.push("");
      lines.push("<i>\uD83E\uDD16 Kaufbot</i>");
      return lines.join("\n");
    }

    // Group by account
    const byAccount = new Map<string, TransactionRecord[]>();
    for (const r of records) {
      if (!byAccount.has(r.account_id)) byAccount.set(r.account_id, []);
      byAccount.get(r.account_id)!.push(r);
    }

    for (const [accountId, recs] of byAccount) {
      const acc = accountNames[accountId];
      const name = acc?.name ?? accountId;
      const type = acc?.type ?? null;

      if (config.hiddenAccountIds.includes(accountId)) continue;

      lines.push("");
      lines.push(`${accountEmoji(type)} <b>${esc(name)}</b>`);

      for (const r of recs) {
        const val = parseFloat(r.amount_value ?? "0") / 100;
        const cur = r.amount_currency ?? config.defaultCurrency;
        const amount = fmt(val, cur);
        const emoji = typeEmoji(r.record_type, r.transfer);
        const dt = formatDateTime(r.record_date, r.created_at);

        let description: string;
        if (r.transfer) {
          const other = r.payee ?? r.payer ?? r.note ?? "Transfer";
          description = `\u2192 ${esc(other)}`;
        } else {
          description = esc(r.payee ?? r.payer ?? "\u2014");
        }

        const category = r.category_name ? ` <i>${esc(r.category_name)}</i>` : "";
        const uncleared = r.record_state !== "cleared" ? " \u23F3" : "";

        lines.push(`  ${emoji} ${amount}${uncleared}  ${dt}`);
        lines.push(`    ${description}${category}`);
        if (r.note && !r.transfer) {
          lines.push(`    <i>${esc(r.note)}</i>`);
        }
      }
    }

    lines.push("");
    lines.push("<i>\uD83E\uDD16 Kaufbot</i>");
    return lines.join("\n");
  }
}
