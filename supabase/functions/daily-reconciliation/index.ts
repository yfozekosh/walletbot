import { config } from "./config.ts";
import { fetchSheetRange } from "./google-sheets.ts";
import { fetchCurrentMonthExpenses, loadConfig } from "./db.ts";
import { compare, buildMessage } from "./compare.ts";
import { TelegramClient } from "./telegram-client.ts";

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    return new Response("daily-reconciliation active", { status: 200 });
  }

  try {
    await loadConfig();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const monthName = MONTH_NAMES[month];
    const tabName = `${monthName}`;

    console.log(`Running reconciliation for ${monthName} ${year} (tab: ${tabName})`);

    const sheetRows = await fetchSheetRange(tabName);
    if (sheetRows.length === 0) {
      throw new Error(`Tab "${tabName}" not found or empty`);
    }
    console.log(`Fetched ${sheetRows.length} rows from sheet`);

    const dbRecords = await fetchCurrentMonthExpenses(year, month);
    console.log(`Fetched ${dbRecords.length} DB records`);

    const report = compare(sheetRows, dbRecords, `${monthName} ${year}`);

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
    const dbgChatId = Deno.env.get("TELEGRAM_DBG_CHAT");

    if (botToken && chatId) {
      const message = buildMessage(report);
      const telegram = new TelegramClient(botToken);

      const targetChatId = dbgChatId ?? chatId;
      await telegram.sendMessage(targetChatId, message);
      console.log("Report sent to Telegram");
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        matched: report.matched.length,
        discrepancies: report.discrepancies.length,
        extraInDb: report.extraInDb.length,
        envelopeOk: report.envelopeChecks.every((e) => e.maxOk && e.excessOk && e.diffOk),
        summaryOk: report.summaryCheck.ok,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Reconciliation error:", err);
    return new Response(
      JSON.stringify({ status: "error", error: String(err) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
