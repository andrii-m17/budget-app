// deno-lint-ignore-file no-explicit-any
// MB-2: підключення до Monobank. Дії: connect (прийняти токен, перевірити в банку, зашифрувати, зареєструвати
// вебхук) і disconnect (зняти вебхук і видалити токен). Токен НІКОЛИ не логується, не повертається клієнту
// і зберігається лише як шифртекст AES-256-GCM (ключ MONO_TOKEN_KEY у секретах функцій, заважається на користувача).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MONO_API = "https://api.monobank.ua";
const enc = new TextEncoder();
const dec = new TextDecoder();
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function getKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("MONO_TOKEN_KEY") ?? "";
  if (secret.length < 32) throw new Error("key_missing");
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encryptToken(token: string, aad: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, key, enc.encode(token));
  return `v1.${b64(iv)}.${b64(new Uint8Array(ct))}`;
}
async function decryptToken(packed: string, aad: string): Promise<string> {
  const [ver, ivB64, ctB64] = packed.split(".");
  if (ver !== "v1" || !ivB64 || !ctB64) throw new Error("bad_format");
  const key = await getKey();
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(ivB64), additionalData: enc.encode(aad) }, key, unb64(ctB64));
  return dec.decode(pt);
}
async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes))).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const clean = (s: unknown, max: number) =>
  String(s ?? "").replace(/[<>\u0000-\u001f]/g, " ").trim().slice(0, max);

async function monoFetch(path: string, token: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    return await fetch(`${MONO_API}${path}`, {
      ...init,
      headers: { "X-Token": token, "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function logEvent(userId: string, kind: string, result: string) {
  try {
    await admin.from("mono_events").insert({ user_id: userId, kind, result: result.slice(0, 60) });
  } catch (_) {
    // журнал не має ламати операцію
  }
}

async function connect(userId: string, token: string): Promise<Response> {
  if (token.length < 20 || token.length > 128 || /\s/.test(token)) return json({ error: "invalid_token_format" }, 400);

  const { data: fm } = await admin.from("family_members").select("family_id").eq("user_id", userId).limit(1).maybeSingle();
  if (!fm) return json({ error: "no_family" }, 403);

  // Захист від частих спроб (банк дозволяє 1 запит на 60 с).
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin.from("mono_events").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("kind", "connect").gte("created_at", since);
  if ((count ?? 0) > 0) return json({ error: "rate_limited", retry_after_s: 60 }, 429);
  await logEvent(userId, "connect", "started");

  let info: any;
  try {
    const r = await monoFetch("/personal/client-info", token);
    if (r.status === 401 || r.status === 403) { await logEvent(userId, "connect", "invalid_token"); return json({ error: "invalid_token" }, 400); }
    if (r.status === 429) { await logEvent(userId, "connect", "bank_rate_limited"); return json({ error: "bank_rate_limited", retry_after_s: 60 }, 429); }
    if (!r.ok) { await logEvent(userId, "connect", `bank_${r.status}`); return json({ error: "bank_error" }, 502); }
    info = await r.json();
  } catch (_) {
    await logEvent(userId, "connect", "bank_unreachable");
    return json({ error: "bank_unreachable" }, 502);
  }

  const webhookToken = randomHex(32);
  const webhookHash = await sha256Hex(webhookToken);
  let ciphertext: string;
  try {
    ciphertext = await encryptToken(token, userId);
  } catch (_) {
    await logEvent(userId, "connect", "key_error");
    return json({ error: "server_key_error" }, 500);
  }

  const { error: connError } = await admin.from("mono_connections").upsert({
    user_id: userId,
    family_id: fm.family_id,
    status: "pending",
    token_ciphertext: ciphertext,
    webhook_token_hash: webhookHash,
    last_error: null,
  }, { onConflict: "user_id" });
  if (connError) { await logEvent(userId, "connect", "db_error"); return json({ error: "db_error" }, 500); }

  // Рахунки: картки та банки. Відстежуються за замовчуванням лише гривневі картки (не ФОП, не банки).
  const { data: existing } = await admin.from("mono_accounts").select("mono_account_id, tracked").eq("user_id", userId);
  const prevTracked = new Map((existing ?? []).map((a: any) => [a.mono_account_id, a.tracked]));
  const rows: any[] = [];
  for (const a of (info?.accounts ?? [])) {
    const id = clean(a?.id, 64);
    if (!id) continue;
    const type = clean(a?.type, 20);
    const defaultTracked = a?.currencyCode === 980 && type !== "fop" && type !== "eAid";
    rows.push({
      user_id: userId, family_id: fm.family_id, mono_account_id: id,
      masked_pan: clean((a?.maskedPan ?? [])[0], 24).replace(/[^0-9*\- ]/g, ""),
      account_type: type, currency_code: Number.isInteger(a?.currencyCode) ? a.currencyCode : null,
      is_jar: false, tracked: prevTracked.has(id) ? prevTracked.get(id) : defaultTracked,
    });
  }
  for (const j of (info?.jars ?? [])) {
    const id = clean(j?.id, 64);
    if (!id) continue;
    rows.push({
      user_id: userId, family_id: fm.family_id, mono_account_id: id,
      masked_pan: clean(j?.title, 24), account_type: "jar",
      currency_code: Number.isInteger(j?.currencyCode) ? j.currencyCode : null,
      is_jar: true, tracked: prevTracked.has(id) ? prevTracked.get(id) : false,
    });
  }
  if (rows.length > 0) {
    const { error: accError } = await admin.from("mono_accounts").upsert(rows, { onConflict: "user_id,mono_account_id" });
    if (accError) { await logEvent(userId, "connect", "accounts_error"); return json({ error: "db_error" }, 500); }
  }

  // Реєстрація вебхука (банк перевірить адресу GET-запитом).
  try {
    const hookUrl = `${SUPABASE_URL}/functions/v1/mono-webhook/${webhookToken}`;
    const r = await monoFetch("/personal/webhook", token, { method: "POST", body: JSON.stringify({ webHookUrl: hookUrl }) });
    if (!r.ok) {
      await admin.from("mono_connections").update({ status: "error", last_error: `webhook_${r.status}` }).eq("user_id", userId);
      await logEvent(userId, "connect", `webhook_${r.status}`);
      return json({ error: "webhook_failed" }, 502);
    }
  } catch (_) {
    await admin.from("mono_connections").update({ status: "error", last_error: "webhook_unreachable" }).eq("user_id", userId);
    await logEvent(userId, "connect", "webhook_unreachable");
    return json({ error: "webhook_failed" }, 502);
  }

  await admin.from("mono_connections").update({ status: "active", connected_at: new Date().toISOString(), last_error: null }).eq("user_id", userId);
  await logEvent(userId, "connect", "ok");
  const { data: accounts } = await admin.from("mono_accounts")
    .select("id, mono_account_id, masked_pan, account_type, currency_code, is_jar, tracked").eq("user_id", userId);
  return json({ ok: true, accounts: accounts ?? [] });
}

async function disconnect(userId: string): Promise<Response> {
  const { data: conn } = await admin.from("mono_connections").select("token_ciphertext").eq("user_id", userId).maybeSingle();
  if (!conn) return json({ ok: true });
  if (conn.token_ciphertext) {
    try {
      const token = await decryptToken(conn.token_ciphertext, userId);
      await monoFetch("/personal/webhook", token, { method: "POST", body: JSON.stringify({ webHookUrl: "" }) });
    } catch (_) {
      // зняття вебхука у банку — надійність «найкраще», токен видаляємо все одно
    }
  }
  await admin.from("mono_connections").update({
    status: "disconnected", token_ciphertext: null, webhook_token_hash: null, last_error: null,
  }).eq("user_id", userId);
  await logEvent(userId, "disconnect", "ok");
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (userError || !user) return json({ error: "unauthorized" }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  if (body?.action === "connect") return await connect(user.id, String(body?.token ?? ""));
  if (body?.action === "disconnect") return await disconnect(user.id);
  return json({ error: "unknown_action" }, 400);
});
