import { AccountInfo, CashflowEntry, ReportData } from "./types.ts";
import { config } from "./config.ts";
export class TelegramPresenter {
  private esc(s: string | null | undefined): string {
    return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(
      />/g,
      "&gt;",
    );
  }
  private fmt(value: number, currency: string): string {
    const sign = value < 0 ? "-" : "";
    return `${sign}${
      Math.abs(value).toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    } ${this.esc(currency)}`;
  }
  private accountEmoji(type: string | null): string {
    switch ((type ?? "").toLowerCase()) {
      case "currentaccount":
        return "\uD83C\uDFE6";
      case "savings":
        return "\uD83D\uDC37";
      case "creditcard":
        return "\uD83D\uDCB3";
      case "cash":
        return "\uD83D\uDCB5";
      case "investment":
        return "\uD83D\uDCC8";
      case "loan":
        return "\uD83D\uDCCB";
      case "mortgage":
        return "\uD83C\uDFE0";
      default:
        return "\uD83D\uDCB0";
    }
  }
  private balanceEmoji(v: number): string {
    if (v > 10000) return "\uD83E\uDD11";
    if (v > 0) return "";
    if (v === 0) return "\u2696\uFE0F";
    return "\uD83D\uDD34";
  }
  private renderAccounts(
    accounts: AccountInfo[],
    incomingByAccountId: Record<string, number>,
    latestRecordPerAccount: Record<string, string>,
  ): string[] {
    const visibleAccounts = accounts.filter((a) => !config.hiddenAccountIds.includes(a.id));
    const lines: string[] = [
      "",
      `<b>\uD83C\uDFDB Accounts</b>  <i>${visibleAccounts.length} active</i>`,
      "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
    ];
    for (const acc of visibleAccounts) {
      lines.push(
        `${this.accountEmoji(acc.account_type)} <b>${this.esc(acc.name)}</b> ${this.balanceEmoji(acc.balance)}`,
      );
      lines.push(
        `    Balance: <code>${this.fmt(acc.balance, acc.currency)}</code>`,
      );
      const incoming = incomingByAccountId[acc.id];
      if (incoming) {
        lines.push(
          `    \u23F3 Incoming: <code>${this.fmt(incoming, acc.currency)}</code>`,
        );
      }
      const lastSync = latestRecordPerAccount[acc.id];
      if (lastSync) {
        const syncDate = new Date(lastSync).toLocaleString("de-DE", {
          timeZone: "Europe/Berlin",
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
        lines.push(`    \uD83D\uDD04 ${this.esc(syncDate)}`);
      }
    }
    return lines;
  }
  private renderCashflow(
    cashflowByCurrency: Record<string, CashflowEntry>,
    monthLabel: string,
  ): string[] {
    const lines: string[] = [
      "",
      `<b>\uD83D\uDCC8 Cashflow \u2014 ${this.esc(monthLabel)}</b>`,
      "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
    ];
    for (const [cur, cf] of Object.entries(cashflowByCurrency)) {
      lines.push(
        `<b>${this.esc(cur)}</b>`,
        `  \uD83D\uDCE5 Income:   <code>${this.fmt(cf.income, cur)}</code>`,
        `  \uD83D\uDCE4 Expenses: <code>${this.fmt(cf.expenses, cur)}</code>`,
        `  ${cf.net >= 0 ? "\u2705" : "\uD83D\uDD34"} Net:      <code>${this.fmt(cf.net, cur)}</code>`,
      );
    }
    return lines;
  }
  buildMessage(data: ReportData): string {
    const now = new Date().toLocaleString("de-DE", {
      timeZone: "Europe/Berlin",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const monthLabel = new Date().toLocaleString("en-GB", {
      month: "long",
      year: "numeric",
    });
    const lines: string[] = [
      `<b>\uD83D\uDCBC Financial Report</b>`,
      `<i>\uD83D\uDD50 ${this.esc(now)}</i>`,
    ];
    if (data.lastSync) {
      const syncTime = new Date(data.lastSync).toLocaleString("de-DE", {
        timeZone: "Europe/Berlin",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      lines.push(`<i>\uD83D\uDD04 Last sync: ${this.esc(syncTime)}</i>`);
    }
    if (data.latestRecordDate) {
      lines.push(
        `<i>\uD83D\uDCC5 Latest record: ${this.esc(data.latestRecordDate)}</i>`,
      );
    }
    lines.push(
      ...this.renderAccounts(
        data.accounts,
        data.incomingByAccountId,
        data.latestRecordPerAccount,
      ),
    );
    lines.push(...this.renderCashflow(data.cashflowByCurrency, monthLabel));
    lines.push("", `<i>\uD83E\uDD16 Kaufbot \u00B7 ${this.esc(now)}</i>`);
    return lines.join("\n");
  }
  async send(botToken: string, chatId: string, message: string): Promise<void> {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      }),
    });
    if (!resp.ok) {
      throw new Error(
        `Telegram API error ${resp.status}: ${await resp.text()}`,
      );
    }
  }
}
