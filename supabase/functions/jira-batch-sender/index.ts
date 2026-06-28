import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractUpdates, formatBatches } from "./utils.ts";

async function sendTelegram(botToken: string, chatId: string, text: string) {
  const resp = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        parse_mode: "HTML",
        text,
        disable_web_page_preview: true,
      }),
    },
  );
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

serve(async (req) => {
  if (req.method === "GET") {
    return new Response("jira-batch-sender active", { status: 200 });
  }

  const authErr = verifyServiceRole(req);
  if (authErr) return authErr;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_JIRA_CHAT_ID");
  const jiraDomain = Deno.env.get("JIRA_DOMAIN");

  if (!supabaseUrl || !serviceKey || !botToken || !chatId || !jiraDomain) {
    return new Response(JSON.stringify({ error: "Missing env vars" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { data: rows, error: fetchErr } = await supabase
      .from("jira_buffer")
      .select("id, payload")
      .order("created_at", { ascending: true });

    if (fetchErr) throw fetchErr;
    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ buffered: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const allUpdates = [];
    for (const row of rows) {
      allUpdates.push(...extractUpdates(row.payload, jiraDomain));
    }

    const ids = rows.map((r) => r.id);

    if (allUpdates.length === 0) {
      await supabase.from("jira_buffer").delete().in("id", ids);
      return new Response(JSON.stringify({ buffered: rows.length, sent: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const messages = formatBatches(allUpdates);

    for (const msg of messages) {
      await sendTelegram(botToken, chatId, msg);
    }

    await supabase.from("jira_buffer").delete().in("id", ids);

    return new Response(
      JSON.stringify({
        buffered: rows.length,
        updates: allUpdates.length,
        messages: messages.length,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
