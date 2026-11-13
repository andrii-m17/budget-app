// deno-lint-ignore-file no-explicit-any
// MONO-ACC: ядро mono-webhook. Залежності (база, банк, час, фонове виконання) передаються ззовні, тому ядро тестується на моках.
// Порядок: 1) один виклик mono_webhook_ingest (шукає підключення, пише журнал, сповіщає, ставить/знімає last_error) → 200 одразу;
// 2) фон (EdgeRuntime.waitUntil): оновлення рахунків (1 client-info + mono_apply_accounts + повторний ingest) і добір виписки
// (1 statement + mono_ingest_batch або mono_backfill_release). Не більше одного запиту до банку кожного типу на подію.
// Ліміти банку діють на токен: 429 лише повертає позначку, повтор буде на наступній події.
// У журнал/відповіді не потрапляють токен, повний номер рахунку, суми й описи: лише коди результатів.
import {
  buildAccountRows,
  CLIENT_INFO_TIMEOUT_MS,
  decryptToken,
  failureReason,
  monoFetch,
  sha256Hex,
  statementWindow,
  STATEMENT_TIMEOUT_MS,
} from "./mono.ts";

export interface WebhookDeps {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: any; error: any }>;
  fetch: typeof fetch;
  secret(): string;
  waitUntil(p: Promise<unknown>): void;
  now(): number;
  log(code: string): void;
}

const MAX_BODY = 65536;
const JSON_HEADERS = { "Content-Type": "application/json" };

export async function handleWebhook(req: Request, d: WebhookDeps): Promise<Response> {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const token = parts[parts.length - 1] ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return new Response("not found", { status: 404 });
  if (req.method !== "GET" && req.method !== "POST") return new Response("method not allowed", { status: 405 });

  // GET: перевірка адреси банком при реєстрації: база отримує {probe:true}, сама пише probe/ok й повертає result 'probe'
  // (невідомий хеш → no_connection → 404). POST: подія. Усе, що не є подією виписки, іде в базу як порожня подія
  // і фіксується там як «invalid» (200, без повторів банку).
  let item: any = req.method === "GET" ? { probe: true } : {};
  if (req.method === "POST") {
    const text = await req.text();
    if (text.length > MAX_BODY) return new Response("too large", { status: 413 });
    let payload: any = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
    const si = payload?.data?.statementItem;
    if (payload?.type === "StatementItem" && si && typeof si === "object" && !Array.isArray(si)) {
      item = { ...si, account: payload.data.account };
      delete item.probe; // «probe» зарезервовано за GET-перевіркою адреси
    }
  }

  const hash = await sha256Hex(token);
  const { data, error } = await d.rpc("mono_webhook_ingest", { p_token_hash: hash, p_item: item });
  if (error || !data || typeof data !== "object") return new Response("error", { status: 500 }); // банк повторить спробу
  // Розбіжність із ТЗ (сценарій «no_connection → 200»): лишено 404, як було й задумано в MB-2 (невідома адреса отримує 404;
  // банк після трьох невдач сам вимикає вебхук від’єднаного користувача).
  if (data.result === "no_connection") return new Response("not found", { status: 404 });
  if (req.method === "GET") return new Response("ok", { status: 200 });

  const needsRefresh = data.result === "unknown_account" && data.refresh_allowed === true && typeof data.token_ciphertext === "string";
  const needsBackfill = !!data.backfill_from && typeof data.token_ciphertext === "string";
  if (needsRefresh || needsBackfill) {
    d.waitUntil(
      background(d, hash, item, data).catch(() => d.log("background_failed")),
    );
  }
  return new Response(JSON.stringify({ result: String(data.result) }), { status: 200, headers: JSON_HEADERS });
}

// Позначка добору «на руках» з моменту, коли mono_webhook_ingest (перший або повторний виклик) повернув backfill_from.
// Будь-який вихід без успішного mono_ingest_batch (виняток де завгодно, відмова банку, відсутній токен) повертає її
// через mono_backfill_release у finally: позначку ніколи не втрачаємо мовчки.
async function background(d: WebhookDeps, hash: string, item: any, first: any): Promise<void> {
  // Номер рахунку береться так само, як у базі (btrim(coalesce(p_item->>'account',''))): число теж стає текстом.
  const account = String(item?.account ?? "").trim();
  let held: { userId: string; from: string } | null = null;
  let consumed = false;
  let reason = "exception";
  const take = (r: any) => {
    if (r?.backfill_from && account) held = { userId: r.user_id, from: String(r.backfill_from) };
  };
  try {
    let cur = first;
    take(first);
    if (first.result === "unknown_account" && first.refresh_allowed === true && typeof first.token_ciphertext === "string") {
      if (await refreshAccounts(d, first)) {
        const r = await d.rpc("mono_webhook_ingest", { p_token_hash: hash, p_item: item, p_after_refresh: true });
        if (!r.error && r.data && typeof r.data === "object") {
          cur = r.data;
          take(cur);
        } else d.log("reingest_failed");
      }
    }
    if (held) {
      if (typeof cur.token_ciphertext !== "string") reason = "no_token";
      else {
        const failed = await backfill(d, cur, account);
        if (failed === null) consumed = true;
        else reason = failed;
      }
    }
  } catch {
    reason = "exception";
  } finally {
    const h = held as { userId: string; from: string } | null;
    if (h && !consumed) {
      try {
        const rel = await d.rpc("mono_backfill_release", { p_user: h.userId, p_account: account, p_from: h.from, p_reason: reason });
        if (rel.error) d.log("release_failed");
      } catch {
        // якщо навіть повернення не вдалось, позначку за потреби поставить чат вручну
      }
      d.log(`backfill_${reason}`);
    }
  }
}

// Один client-info → mono_apply_accounts. true, якщо рахунки оновлено.
async function refreshAccounts(d: WebhookDeps, first: any): Promise<boolean> {
  let token: string;
  try {
    token = await decryptToken(first.token_ciphertext, first.user_id, d.secret());
  } catch {
    d.log("refresh_decrypt_error");
    return false;
  }
  let res: Response;
  try {
    res = await monoFetch("/personal/client-info", token, undefined, { timeoutMs: CLIENT_INFO_TIMEOUT_MS, fetchImpl: d.fetch });
  } catch (e) {
    d.log(`refresh_${failureReason(e)}`);
    return false;
  }
  if (!res.ok) {
    d.log(`refresh_${failureReason(res.status)}`);
    return false;
  }
  let info: any;
  try {
    info = await res.json();
  } catch {
    d.log("refresh_bad_response");
    return false;
  }
  const rows = buildAccountRows(info);
  if (rows.length === 0) {
    d.log("refresh_empty");
    return false;
  }
  const a = await d.rpc("mono_apply_accounts", { p_user: first.user_id, p_accounts: rows, p_mark_backfill: false });
  if (a.error || !a.data || a.data.error) {
    d.log("refresh_apply_failed");
    return false;
  }
  return true;
}

// Один statement → один mono_ingest_batch. Повертає null, коли позначку спожито пакетним записом, інакше код причини
// (повернення позначки робить виклик у background; виняток теж піднімається туди).
async function backfill(d: WebhookDeps, cur: any, account: string): Promise<string | null> {
  let token: string;
  try {
    token = await decryptToken(cur.token_ciphertext, cur.user_id, d.secret());
  } catch {
    return "decrypt_error";
  }
  const w = statementWindow(String(cur.backfill_from), d.now());
  if (!w) return "bad_from";
  let res: Response;
  try {
    res = await monoFetch(
      `/personal/statement/${encodeURIComponent(account)}/${w.from}/${w.to}`,
      token,
      undefined,
      { timeoutMs: STATEMENT_TIMEOUT_MS, fetchImpl: d.fetch },
    );
  } catch (e) {
    return failureReason(e);
  }
  if (!res.ok) return failureReason(res.status);
  let items: any;
  try {
    items = await res.json();
  } catch {
    return "bank_bad_response";
  }
  if (!Array.isArray(items)) return "bank_bad_response";
  const r = await d.rpc("mono_ingest_batch", { p_user: cur.user_id, p_account: account, p_items: items });
  if (r.error) return "db_error";
  return null; // позначку спожито (навіть якщо база відповіла {error}: рахунок вимкнули, повторювати нічого)
}
