// deno-lint-ignore-file no-explicit-any
// PUSH-LOSS: ядро send-push-notification. Залежності (база, web-push, налаштування) передаються ззовні, тому ядро тестується на моках.
// Раніше push_delivery_log писався лише в самому кінці, а помилку вставки (supabase-js повертає {error}, а не кидає) ніхто не читав:
// збій лишав push_sent_log без жодного сліду. Тепер запис робиться на КОЖНОМУ виході, де відомий user_id, з причиною (statuses[0].reason)
// і push_id (з data.push_id, яким push_send позначає кожне сповіщення), а помилка вставки потрапляє у відповідь (log_error).
// Свідомий виняток: невірний секрет (authorized !== true) НЕ пишеться, щоб сторонній не міг засмічувати журнал; збій самої перевірки (RPC error) пишеться.
// Якщо колонки push_id ще нема (серверну міграцію робить чат), вставка повторюється без неї: журнал не губиться.

export interface PushDeps {
  verifySecret(secret: string): PromiseLike<{ data: any; error: any }>;
  getSubs(userId: string): PromiseLike<{ data: any[] | null; error: any }>;
  deleteSub(id: string): PromiseLike<unknown>;
  send(sub: { endpoint: string; p256dh: string; auth: string }, message: string, opts: { TTL: number; urgency: string }): Promise<any>;
  insertLog(row: Record<string, unknown>): PromiseLike<{ error: any }>;
  declarativeUsers: Set<string>;
  appUrl: string;
  // v17 (PUSH-GUARD): назви обов'язкових секретів, яких немає або які порожні (значення сюди не потрапляють). Є хоча б одна — не шлемо.
  missingConfig?: string[];
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export type Urgency = "very-low" | "low" | "normal" | "high";
export const DELIVERY: Record<string, { ttl: number; urgency: Urgency }> = {
  "daily-expense-reminder": { ttl: 6 * 3600, urgency: "high" },
  "installment-deadline": { ttl: 12 * 3600, urgency: "high" },
  "monthly-debt-reminder": { ttl: 12 * 3600, urgency: "high" },
  "backup-reminder": { ttl: 24 * 3600, urgency: "normal" },
  "mono-inbox": { ttl: 12 * 3600, urgency: "high" },
  "other-actor-summary": { ttl: 6 * 3600, urgency: "normal" },
  "other-actor-deleted": { ttl: 6 * 3600, urgency: "normal" },
  "weekly-summary": { ttl: 12 * 3600, urgency: "normal" },
  "month-end": { ttl: 12 * 3600, urgency: "normal" },
  "test": { ttl: 600, urgency: "high" },
};
export const DEFAULT_DELIVERY = { ttl: 3600, urgency: "normal" as Urgency };

export type Format = "declarative" | "legacy";

// Формат для підписки: декларативний лише для mono-inbox, користувача з пілоту й пристрою, де застосунок на екрані.
export function pickFormat(
  type: string,
  userId: string,
  appVisible: boolean | null | undefined,
  users: Set<string>,
): Format {
  return type === "mono-inbox" && users.has(userId) && appVisible === true ? "declarative" : "legacy";
}

// id витрати для адреси переходу: лише безпечні символи (клієнт приймає [A-Za-z0-9_-]{1,64}), інакше "latest".
export function inboxTarget(notifData: unknown): string {
  const id = notifData && typeof notifData === "object" ? (notifData as Record<string, unknown>).inbox_id : null;
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : "latest";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function pushIdOf(notifData: unknown): string | null {
  const id = notifData && typeof notifData === "object" ? (notifData as Record<string, unknown>).push_id : null;
  return typeof id === "string" && UUID_RE.test(id) ? id.toLowerCase() : null;
}

function reply(obj: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });
}

function short(e: unknown): string {
  const x = e as { body?: string; message?: string } | null;
  return String(x?.body ?? x?.message ?? e ?? "").slice(0, 120);
}

interface LogInput {
  userId: string;
  type: string;
  title: string;
  pushId: string | null;
  urgency: string | null;
  ttl: number | null;
  subscriptions: number;
  sent: number;
  failed: number;
  statuses: unknown[];
}

// Запис журналу. Ніколи не кидає; повертає текст помилки або null.
async function writeLog(deps: PushDeps, l: LogInput): Promise<string | null> {
  const row: Record<string, unknown> = {
    user_id: l.userId,
    type: l.type || null,
    title: String(l.title || "").slice(0, 80),
    urgency: l.urgency,
    ttl_s: l.ttl,
    subscriptions: l.subscriptions,
    sent: l.sent,
    failed: l.failed,
    statuses: l.statuses,
    push_id: l.pushId,
  };
  try {
    let r = await deps.insertLog(row);
    if (r && r.error && /push_id/i.test(String(r.error.message ?? r.error))) {
      // Колонки push_id ще нема на сервері: пишемо без неї, щоб запис не загубився.
      delete row.push_id;
      r = await deps.insertLog(row);
    }
    return r && r.error ? short(r.error) : null;
  } catch (e) {
    return short(e);
  }
}

export async function handlePush(req: Request, deps: PushDeps): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const providedSecret = req.headers.get("x-push-secret") ?? "";
  let authorized: any = null;
  let authError: any = null;
  try {
    const r = await deps.verifySecret(providedSecret);
    authorized = r.data;
    authError = r.error;
  } catch (e) {
    authError = e ?? new Error("verify failed");
  }

  let payload: { user_id?: string; title?: string; body?: string; data?: unknown } | null = null;
  let parseFailed = false;
  try {
    payload = await req.json();
  } catch {
    parseFailed = true;
  }
  const userId = payload && typeof payload.user_id === "string" ? payload.user_id : "";
  const type0 = payload && payload.data && typeof payload.data === "object" && (payload.data as Record<string, unknown>).type
    ? String((payload.data as Record<string, unknown>).type)
    : "";

  if (authError || authorized !== true) {
    // Збій самої перевірки (не «невірний секрет») лишає слід; невірний секрет не пишемо (захист журналу від сторонніх).
    let logError: string | null = null;
    if (authError && userId) {
      logError = await writeLog(deps, {
        userId, type: type0, title: String(payload?.title ?? ""), pushId: pushIdOf(payload?.data),
        urgency: null, ttl: null, subscriptions: 0, sent: 0, failed: 1,
        statuses: [{ ok: false, status: null, reason: "auth_check_error", msg: short(authError) }],
      });
    }
    return reply(logError ? { error: "unauthorized", log_error: logError } : { error: "unauthorized" }, 401);
  }

  // v17 (PUSH-GUARD): запасних значень для секретів немає. Нема VAPID_* — не шлемо, а пишемо причину в журнал (лише назви секретів).
  const missing = (deps.missingConfig ?? []).filter((n) => typeof n === "string" && n);
  if (missing.length) {
    let logError: string | null = null;
    if (userId) {
      logError = await writeLog(deps, {
        userId, type: type0, title: String(payload?.title ?? ""), pushId: pushIdOf(payload?.data),
        urgency: null, ttl: null, subscriptions: 0, sent: 0, failed: 1,
        statuses: [{ ok: false, status: null, reason: "config_missing", missing }],
      });
    }
    return reply(logError ? { error: "config_missing", log_error: logError } : { error: "config_missing" }, 503);
  }

  if (parseFailed || !payload) {
    return reply({ error: "invalid JSON" }, 400);
  }

  const { user_id, title, body, data: notifData } = payload;
  if (!user_id || !title) {
    return reply({ error: "user_id і title обов'язкові" }, 400);
  }

  const type = type0;
  const pushId = pushIdOf(notifData);
  const delivery = DELIVERY[type] ?? DEFAULT_DELIVERY;
  const base = { userId: String(user_id), type, title: String(title), pushId, urgency: delivery.urgency as string, ttl: delivery.ttl };

  try {
    const { data: subs, error } = await deps.getSubs(String(user_id));

    if (error) {
      const le = await writeLog(deps, {
        ...base, subscriptions: 0, sent: 0, failed: 1,
        statuses: [{ ok: false, status: null, reason: "subs_read_error", msg: short(error) }],
      });
      return reply(le ? { error: String(error.message ?? error), log_error: le } : { error: String(error.message ?? error) }, 500);
    }
    if (!subs || subs.length === 0) {
      const le = await writeLog(deps, {
        ...base, subscriptions: 0, sent: 0, failed: 0,
        statuses: [{ ok: false, status: null, reason: "no_subscriptions" }],
      });
      const out: Record<string, unknown> = { sent: 0, note: "немає підписок для цього user_id" };
      if (le) out.log_error = le;
      return reply(out, 200);
    }

    const legacyMessage = JSON.stringify({ title, body: body || "", data: notifData || {} });
    const declarativeMessage = JSON.stringify({
      web_push: 8030,
      notification: {
        title,
        body: body || "",
        lang: "uk",
        tag: "mono-inbox",
        navigate: `${deps.appUrl}#mono/${inboxTarget(notifData)}`,
      },
      title,
      body: body || "",
      data: notifData || {},
    });
    const formats: Format[] = subs.map((s) => pickFormat(type, String(user_id), s.app_visible, deps.declarativeUsers));

    const results = await Promise.allSettled(
      subs.map((s, i) =>
        deps.send(
          { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
          formats[i] === "declarative" ? declarativeMessage : legacyMessage,
          { TTL: delivery.ttl, urgency: delivery.urgency },
        ).catch(async (err) => {
          // 410/404 — підписка більше не дійсна — видаляємо.
          if (err && (err.statusCode === 410 || err.statusCode === 404)) {
            try {
              await deps.deleteSub(s.id);
            } catch (_) { /* видалення не має ховати причину збою */ }
          }
          throw err;
        })
      ),
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - sent;
    const statuses = results.map((r, i) =>
      r.status === "fulfilled"
        ? { ok: true, status: (r.value as { statusCode?: number })?.statusCode ?? null, format: formats[i] }
        : {
          ok: false,
          status: (r.reason as { statusCode?: number })?.statusCode ?? null,
          msg: short(r.reason),
          reason: "send_failed",
          format: formats[i],
        }
    );

    const le = await writeLog(deps, { ...base, subscriptions: subs.length, sent, failed, statuses });
    const out: Record<string, unknown> = { sent, failed };
    if (le) out.log_error = le;
    return reply(out, 200);
  } catch (e) {
    // Непередбачений виняток: слід у журналі й у відповіді (pg_net збереже її кілька годин).
    const le = await writeLog(deps, {
      ...base, subscriptions: 0, sent: 0, failed: 1,
      statuses: [{ ok: false, status: null, reason: "exception", msg: short(e) }],
    });
    const out: Record<string, unknown> = { error: "internal", msg: short(e) };
    if (le) out.log_error = le;
    return reply(out, 500);
  }
}
