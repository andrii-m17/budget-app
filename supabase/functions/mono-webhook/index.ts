// deno-lint-ignore-file no-explicit-any
// MB-2: приймає операції від Monobank (вебхук). Це свідомо verify_jwt = false: банк не може відправляти JWT.
// Захист: адреса містить довгий випадковий секрет (256 біт); у базі лише його SHA-256.
// Невідома адреса отримує 404. Функція лише пише у «Вхідні» (mono_ingest), нічого не читає і не створює витрат.
// v2: після нової операції запускає notify_mono_inbox (сповіщення про нову операцію); помилка сповіщення прийом не ламає.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const enc = new TextEncoder();
const MAX_BODY = 65536;

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function logEvent(userId: string | null, kind: string, txId: string | null, result: string) {
  try {
    await admin.from("mono_events").insert({ user_id: userId, kind, mono_tx_id: txId, result: result.slice(0, 60) });
  } catch (_) {
    // журнал не має ламати прийом
  }
}

Deno.serve(async (req) => {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const token = parts[parts.length - 1] ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return new Response("not found", { status: 404 });

  const hash = await sha256Hex(token);
  const { data: conn, error: connError } = await admin
    .from("mono_connections")
    .select("user_id, status")
    .eq("webhook_token_hash", hash)
    .maybeSingle();
  if (connError) return new Response("error", { status: 500 });
  if (!conn || conn.status === "disconnected") return new Response("not found", { status: 404 });

  // Перевірка адреси банком при реєстрації: GET, потрібна відповідь 200.
  if (req.method === "GET") {
    await logEvent(conn.user_id, "probe", null, "ok");
    return new Response("ok", { status: 200 });
  }
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const text = await req.text();
  if (text.length > MAX_BODY) return new Response("too large", { status: 413 });
  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    return new Response("bad request", { status: 400 });
  }
  if (payload?.type !== "StatementItem" || !payload?.data?.statementItem) {
    await logEvent(conn.user_id, "ignored", null, String(payload?.type ?? "none").slice(0, 40));
    return new Response(JSON.stringify({ result: "ignored" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const item = { ...payload.data.statementItem, account: payload.data.account };
  const { data: result, error } = await admin.rpc("mono_ingest", {
    p_user: conn.user_id,
    p_item: item,
    p_source: "webhook",
  });
  if (error) {
    await logEvent(conn.user_id, "error", String(item?.id ?? "").slice(0, 64), "rpc_failed");
    return new Response("error", { status: 500 }); // банк повторить спробу
  }
  await logEvent(conn.user_id, "statement", String(item?.id ?? "").slice(0, 64), String(result));

  // Нова покупка: одразу сповіщаємо. Помилка тут не має впливати на відповідь банку
  // (щохвилинне завдання mono-inbox-notify добере несповіщені).
  if (result === "new") {
    try {
      await admin.rpc("notify_mono_inbox", { p_user: conn.user_id });
    } catch (_) {
      // добере cron
    }
  }
  return new Response(JSON.stringify({ result }), { status: 200, headers: { "Content-Type": "application/json" } });
});
