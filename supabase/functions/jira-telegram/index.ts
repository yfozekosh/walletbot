import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method === "GET") {
    return new Response("jira-telegram webhook active", { status: 200 });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const webhookSecret = Deno.env.get("JIRA_WEBHOOK_SECRET");
  const rawBody = await req.text();

  if (webhookSecret) {
    const signatureHeader = req.headers.get("X-Hub-Signature");
    if (!signatureHeader) {
      return new Response("Missing signature", { status: 403 });
    }

    const [algo, providedSig] = signatureHeader.split("=", 2);
    if (algo !== "sha256" || !providedSig) {
      return new Response("Invalid signature format", { status: 403 });
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
    const computedSig = Array.from(new Uint8Array(sigBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (computedSig !== providedSig) {
      return new Response("Signature mismatch", { status: 403 });
    }
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const event = payload.webhookEvent;
  if (
    event !== "jira:issue_created" &&
    event !== "jira:issue_updated" &&
    event !== "comment_created" &&
    event !== "worklog_created"
  ) {
    return new Response(JSON.stringify({ ignored: true, event }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase env vars" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { error } = await supabase.from("jira_buffer").insert({ payload });

  if (error) {
    console.error("Buffer insert error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ buffered: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
