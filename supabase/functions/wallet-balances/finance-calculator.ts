import { AccountInfo, AccountMapEntry, CashflowEntry, PendingTransfer, SentTransfer } from "./types.ts";
export class FinanceCalculator {
  calculateCashflow(
    monthRecords: {
      amount_value: string | null;
      amount_currency: string | null;
      base_amount_value: string | null;
      record_type: string | null;
    }[],
  ): Record<string, CashflowEntry> {
    const cashflowByCurrency: Record<string, CashflowEntry> = {};
    for (const r of monthRecords) {
      const cur = r.amount_currency;
      const isIncome = r.record_type === "income";
      if (cur) {
        if (!cashflowByCurrency[cur]) {
          cashflowByCurrency[cur] = { income: 0, expenses: 0, net: 0 };
        }
        const val = parseFloat(r.amount_value ?? "0") / 100;
        if (!isNaN(val)) {
          if (isIncome) cashflowByCurrency[cur].income += val;
          else cashflowByCurrency[cur].expenses += val;
        }
      } else {
        if (!cashflowByCurrency["EUR"]) {
          cashflowByCurrency["EUR"] = { income: 0, expenses: 0, net: 0 };
        }
        const val = parseFloat(r.base_amount_value ?? "0") / 100;
        if (!isNaN(val)) {
          if (isIncome) cashflowByCurrency["EUR"].income += val;
          else cashflowByCurrency["EUR"].expenses += val;
        }
      }
    }
    for (const cf of Object.values(cashflowByCurrency)) {
      cf.income = Math.round(cf.income * 100) / 100;
      cf.expenses = Math.round(cf.expenses * 100) / 100;
      cf.net = Math.round((cf.income + cf.expenses) * 100) / 100;
    }
    return cashflowByCurrency;
  }
  calculatePendingTransfers(
    transferRecords: {
      id: string;
      account_id: string | null;
      record_date: string | null;
      note: string | null;
      amount_value: string | null;
      payee: string | null;
    }[],
    accountMap: Record<string, AccountMapEntry>,
    identifierToAccount: Record<string, string>,
  ): {
    pendingTransfers: PendingTransfer[];
    incomingByAccountId: Record<string, number>;
  } {
    const sentTransfers: SentTransfer[] = [];
    const receivedTransfers: Record<string, number[]> = {};
    for (const r of transferRecords) {
      const val = parseFloat(r.amount_value ?? "0");
      if (val > 0) {
        const key = `${r.account_id}|${Math.abs(val)}`;
        if (!receivedTransfers[key]) receivedTransfers[key] = [];
        receivedTransfers[key].push(val);
      } else if (val < 0) {
        const toAccountId = r.payee ? identifierToAccount[r.payee] : null;
        if (toAccountId) {
          sentTransfers.push({
            id: r.id,
            from_account_id: r.account_id ?? "",
            to_account_id: toAccountId,
            record_date: r.record_date,
            note: r.note,
            amount: val,
            payee: r.payee,
          });
        }
      }
    }
    const pendingTransfers: PendingTransfer[] = [];
    const incomingByAccountId: Record<string, number> = {};
    for (const sent of sentTransfers) {
      const key = `${sent.to_account_id}|${Math.abs(sent.amount)}`;
      const received = receivedTransfers[key] ?? [];
      let matched = false;
      for (let i = 0; i < received.length; i++) {
        matched = true;
        received.splice(i, 1);
        break;
      }
      if (!matched) {
        const fromAccount = accountMap[sent.from_account_id];
        const toAccount = accountMap[sent.to_account_id];
        const amountEur = Math.round(sent.amount) / 100;
        pendingTransfers.push({
          from: fromAccount?.name ?? sent.from_account_id,
          to: toAccount?.name ?? sent.to_account_id,
          to_account_id: sent.to_account_id,
          date: sent.record_date,
          note: sent.note,
          amount: amountEur,
          amount_cents: sent.amount,
          status: "pending",
        });
        incomingByAccountId[sent.to_account_id] = (incomingByAccountId[sent.to_account_id] ?? 0) + Math.abs(amountEur);
      }
    }
    return { pendingTransfers, incomingByAccountId };
  }
}
