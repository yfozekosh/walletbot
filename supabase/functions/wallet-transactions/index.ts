import { createRepository } from "./database-repository.ts";
import { TelegramPresenter } from "./telegram-presenter.ts";
import { config } from "./config.ts";

function getDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-GB", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getTodayDate(): string {
  const now = new Date();
  return now.toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
}

function getDateOffset(daysAgo: number): string {
  const now = new Date();
  now.setDate(now.getDate() - daysAgo);
  return now.toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
}

async function sendTelegram(botToken: string, chatId: string, message: string): Promise<void> {
  const url = `${config.telegramApiBase}/bot${botToken}/sendMessage`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Telegram API error ${resp.status}: ${body}`);
  }
}

function verifyServiceRole(req: Request): Response | null {
  const auth = req.headers.get("Authorization");
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (auth !== `Bearer ${expected}`) {
    return new Response("Unauthorized", { status: 403 });
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (req.method === "POST") {
    const authErr = verifyServiceRole(req);
    if (authErr) return authErr;
  }

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  const missing = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
    .filter(k => !Deno.env.get(k));
  if (missing.length) {
    return new Response(
      JSON.stringify({ error: `Missing env vars: ${missing.join(", ")}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let day = 0;
  let isCron = false;
  let overrideChatId: string | null = null;

  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (typeof body.day === "number") day = body.day;
      if (body.cron === true) isCron = true;
      if (body.chat_id) overrideChatId = String(body.chat_id);
    } catch {}
  }

  const targetChatId = overrideChatId ?? chatId!;

  try {
    const repo = createRepository(supabaseUrl!, supabaseServiceKey!);
    const presenter = new TelegramPresenter();
    const accountNames = await repo.fetchAccountNames();

    if (isCron) {
      const today = getTodayDate();
      const yesterday = getDateOffset(1);

      const records = await repo.fetchRecordsForDateRange(yesterday, today);
      const shownIds = await repo.fetchShownRecordIds();
      const newRecords = records.filter(r => !shownIds.has(r.id));

      const dateLabel = yesterday === today
        ? getDateLabel(today)
        : `${getDateLabel(yesterday)} \u2013 ${getDateLabel(today)}`;

      const omittedCount = records.length - newRecords.length;
      const message = presenter.buildMessage(newRecords, accountNames, dateLabel, {
        mode: "cron",
        omittedCount,
      });
      await sendTelegram(botToken!, targetChatId, message);

      if (newRecords.length > 0) {
        await repo.markAsShown(newRecords.map(r => r.id));
      }

      return new Response(
        JSON.stringify({ status: "ok", mode: "cron", dates: [yesterday, today], records_found: records.length, records_shown: newRecords.length, sent: true }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } else {
      const targetDate = getDateOffset(day);
      const records = await repo.fetchRecordsForDate(targetDate);
      const dateLabel = getDateLabel(targetDate);

      const message = presenter.buildMessage(records, accountNames, dateLabel, { mode: "command" });
      await sendTelegram(botToken!, targetChatId, message);

      return new Response(
        JSON.stringify({ status: "ok", mode: "command", date: targetDate, records_shown: records.length, sent: true }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    console.error("wallet-transactions error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
