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

  // GET: перевірка адреси банком при реєстрації. POST: подія. Усе, що не є подією виписки, іде в базу як порожня подія
  // і фіксується там як «invalid» (200, без повторів банку).
  let item: any = {};
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

async function background(d: WebhookDeps, hash: string, item: any, first: any): Promise<void> {
  let cur = first;
  if (first.result === "unknown_account" && first.refresh_allowed === true && typeof first.token_ciphertext === "string") {
    if (await refreshAccounts(d, first)) {
      const r = await d.rpc("mono_webhook_ingest", { p_token_hash: hash, p_item: item, p_after_refresh: true });
      if (!r.error && r.data && typeof r.data === "object") cur = r.data;
      else d.log("reingest_failed");
    }
  }
  // Номер рахунку береться так само, як у базі (btrim(coalesce(p_item->>'account',''))): число теж стає текстом.
  const account = String(item?.account ?? "").trim();
  if (cur.backfill_from && typeof cur.token_ciphertext === "string" && account) {
    await backfill(d, cur, account);
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

// Один statement → один mono_ingest_batch. Якщо до пакетного запису не дійшло, позначку повертає mono_backfill_release.
async function backfill(d: WebhookDeps, cur: any, account: string): Promise<void> {
  const from: string = cur.backfill_from;
  let handled = false;
  let reason = "unknown";
  try {
    let token: string;
    try {
      token = await decryptToken(cur.token_ciphertext, cur.user_id, d.secret());
    } catch {
      reason = "decrypt_error";
      return;
    }
    const w = statementWindow(from, d.now());
    if (!w) {
      reason = "bad_from";
      return;
    }
    let res: Response;
    try {
      res = await monoFetch(
        `/personal/statement/${encodeURIComponent(account)}/${w.from}/${w.to}`,
        token,
        undefined,
        { timeoutMs: STATEMENT_TIMEOUT_MS, fetchImpl: d.fetch },
      );
    } catch (e) {
      reason = failureReason(e);
      return;
    }
    if (!res.ok) {
      reason = failureReason(res.status);
      return;
    }
    let items: any;
    try {
      items = await res.json();
    } catch {
      reason = "bank_bad_response";
      return;
    }
    if (!Array.isArray(items)) {
      reason = "bank_bad_response";
      return;
    }
    const r = await d.rpc("mono_ingest_batch", { p_user: cur.user_id, p_account: account, p_items: items });
    if (r.error) {
      reason = "db_error";
      return;
    }
    handled = true; // позначку спожито (навіть якщо база відповіла {error}: рахунок вимкнули, повторювати нічого)
  } catch {
    reason = "exception";
  } finally {
    if (!handled) {
      try {
        const rel = await d.rpc("mono_backfill_release", { p_user: cur.user_id, p_account: account, p_from: from, p_reason: reason });
        if (rel.error) d.log("release_failed");
      } catch {
        // якщо навіть повернення не вдалось, позначку за потреби поставить чат вручну
      }
      d.log(`backfill_${reason}`);
    }
  }
}
