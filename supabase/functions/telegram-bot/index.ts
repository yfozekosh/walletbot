import { config } from "./config.ts";
import { TelegramClient } from "./telegram-client.ts";

async function callEdgeFunction(
  supabaseUrl: string,
  serviceKey: string,
  functionName: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const resp = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(body),
  });
  return resp.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    return new Response("telegram-bot webhook active", { status: 200 });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");

  if (!botToken || !supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: "Missing env vars" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (webhookSecret) {
    const headerSecret = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (headerSecret !== webhookSecret) {
      return new Response("Unauthorized", { status: 403 });
    }
  }

  let update;
  try {
    update = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const text = update.message?.text;
  const chatId = update.message?.chat?.id;

  if (!text || !chatId) {
    return new Response("ok", { status: 200 });
  }

  const chatIdStr = String(chatId);
  if (!config.allowedChatIds.includes(chatIdStr)) {
    return new Response("ok", { status: 200 });
  }

  const telegram = new TelegramClient(botToken);

  try {
    if (text === "/sync") {
      await telegram.sendMessage(chatIdStr, "\u23F3 Syncing...");
      const result = await callEdgeFunction(
        supabaseUrl,
        supabaseServiceKey,
        "wallet-sync",
        {},
      );
      const status = result.status;
      await telegram.sendMessage(
        chatIdStr,
        status === "ok" ? "\u2705 Sync complete" : `\u26A0\uFE0F Sync: ${status}`,
      );
    } else if (text === "/report") {
      await telegram.sendMessage(chatIdStr, "\u23F3 Generating report...");
      await callEdgeFunction(
        supabaseUrl,
        supabaseServiceKey,
        "wallet-balances",
        { telegram: true, chat_id: chatIdStr },
      );
    } else if (text.startsWith("/transactions")) {
      const parts = text.split(/\s+/);
      const day = parts.length > 1 ? parseInt(parts[1], 10) : 0;
      const label = isNaN(day) || day === 0 ? "today" : day === 1 ? "yesterday" : `${day} days ago`;
      await telegram.sendMessage(
        chatIdStr,
        `\u23F3 Fetching transactions (${label})...`,
      );
      await callEdgeFunction(
        supabaseUrl,
        supabaseServiceKey,
        "wallet-transactions",
        { day: isNaN(day) ? 0 : day, chat_id: chatIdStr },
      );
    }
  } catch (err) {
    console.error("Command error:", err);
    try {
      await telegram.sendMessage(chatIdStr, `\u274C Error: ${err}`);
    } catch {}
  }

  return new Response("ok", { status: 200 });
});
