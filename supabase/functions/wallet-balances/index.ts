import { createRepository } from "./database-repository.ts";
import { FinanceCalculator } from "./finance-calculator.ts";
import { TelegramPresenter } from "./telegram-presenter.ts";
import { ReportData } from "./types.ts";

function getDateRange(): { monthStart: string; monthEnd: string } {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
  return { monthStart, monthEnd };
}

Deno.serve(async (req: Request) => {
  let sendTelegram = false;
  let useRealChat = false;
  let overrideChatId: string | null = null;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      sendTelegram = body.telegram === true;
      useRealChat = body["real-chat"] === true;
      if (body.chat_id) overrideChatId = String(body.chat_id);
    } catch {}
  }

  try {
    const repo = createRepository();
    const calculator = new FinanceCalculator();
    const presenter = new TelegramPresenter();

    const { accounts } = await repo.fetchBalancesAndBudgets();
    const { accountMap, identifierToAccount } = await repo.fetchAccountMap();
    const lastSync = await repo.fetchLastSyncTime();
    const latestRecordDate = await repo.fetchLatestRecordDate();
    const latestRecordPerAccount = await repo.fetchLatestRecordPerAccount();

    for (const acc of accounts) {
      if (accountMap[acc.id]) accountMap[acc.id].currency = acc.currency;
    }

    const { monthStart, monthEnd } = getDateRange();
    const monthRecords = await repo.fetchMonthRecords(monthStart, monthEnd);
    const cashflowByCurrency = calculator.calculateCashflow(monthRecords);

    const transferRecords = await repo.fetchTransferRecords(monthStart);
    const { pendingTransfers, incomingByAccountId } = calculator.calculatePendingTransfers(
      transferRecords, accountMap, identifierToAccount
    );

    const reportData: ReportData = {
      accounts, cashflowByCurrency, pendingTransfers,
      incomingByAccountId, lastSync, latestRecordDate, latestRecordPerAccount,
    };

    const message = presenter.buildMessage(reportData);
    const response: Record<string, unknown> = { ...reportData, message };

    if (sendTelegram) {
      const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
      const realChatId = Deno.env.get("TELEGRAM_CHAT_ID");
      const dbgChatId = Deno.env.get("TELEGRAM_DBG_CHAT");
      const chatId = overrideChatId ?? (useRealChat ? realChatId : dbgChatId);

      if (!botToken || !chatId) {
        response.telegram = {
          error: "Missing TELEGRAM_BOT_TOKEN or chat ID env var",
          realChatId: realChatId ?? null,
          dbgChatId: dbgChatId ?? null,
        };
      } else {
        response.telegram = {
          chatId,
          target: overrideChatId ? "override" : useRealChat ? "real" : "debug",
          realChatId: realChatId ?? null,
          dbgChatId: dbgChatId ?? null,
        };
        try {
          await presenter.send(botToken, chatId, message);
          response.telegram.sent = true;
        } catch (err) {
          response.telegram.error = String(err);
        }
      }
    }

    return new Response(JSON.stringify(response, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
