// Push: Edge Function відправляє Web Push через web-push (npm, Deno-сумісний).
// Приймає {user_id, title, body, data}, читає ВСІ підписки user_id з push_subscriptions, шле кожній.
// VAPID_*: Function secrets. SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY: інжектуються автоматично.
// Авторизація (Фаза 0): заголовок x-push-secret перевіряється через RPC verify_push_secret.
// v6: терміновість (urgency) і час життя (TTL) за типом сповіщення; журнал доставки push_delivery_log.
// v7: тип backup-reminder (нагадування про резервну копію), TTL 24 години.
// v8: тип mono-inbox (нові операції Monobank), TTL 12 годин.
// v10: mono-inbox з високим пріоритетом: звичайний пріоритет iOS відкладає на хвилини (спостережено 12–13 хв).
// v12 (PUSH-2б): декларативний формат Web Push (iOS 18.4+, "web_push": 8030) для mono-inbox лише користувачам із секрету
//   DECLARATIVE_PUSH_USERS (id через кому; значення в репозиторій не потрапляє) і лише на пристроях, де застосунок зараз на екрані
//   (push_subscriptions.app_visible = true): при відкритому застосунку notificationclick не викликається (WebKit 268797), тож iOS сама
//   відкриває notification.navigate. Верхні title/body/data лишаються для сумісності зі старим sw.js. Інакше формат як раніше.
//   У push_delivery_log.statuses для кожної підписки пишеться format: "declarative" | "legacy".
//   VAPID_SUBJECT (secret): контакт для VAPID; у репозиторії лише запасне значення.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@example.invalid",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

const JSON_HEADERS = { "Content-Type": "application/json" };

// Адреса застосунку для notification.navigate (той самий документ, що start_url: index.html → hashchange без перезавантаження).
const APP_URL = "https://andrii-m17.github.io/budget-app/index.html";

const DECLARATIVE_USERS = new Set(
  (Deno.env.get("DECLARATIVE_PUSH_USERS") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
);

type Urgency = "very-low" | "low" | "normal" | "high";
const DELIVERY: Record<string, { ttl: number; urgency: Urgency }> = {
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
const DEFAULT_DELIVERY = { ttl: 3600, urgency: "normal" as Urgency };

type Format = "declarative" | "legacy";

// Формат для підписки: декларативний лише для mono-inbox, користувача з пілоту й пристрою, де застосунок на екрані.
function pickFormat(type: string, userId: string, appVisible: boolean | null | undefined): Format {
  return type === "mono-inbox" && DECLARATIVE_USERS.has(userId) && appVisible === true ? "declarative" : "legacy";
}

// id витрати для адреси переходу: лише безпечні символи (клієнт приймає [A-Za-z0-9_-]{1,64}), інакше "latest" (клієнт просто відкриє «Вхідні»).
function inboxTarget(notifData: unknown): string {
  const id = notifData && typeof notifData === "object" ? (notifData as Record<string, unknown>).inbox_id : null;
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : "latest";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const providedSecret = req.headers.get("x-push-secret") ?? "";
  const { data: authorized, error: authError } = await supabase.rpc(
    "verify_push_secret",
    { p_secret: providedSecret },
  );
  if (authError || authorized !== true) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  let payload: { user_id?: string; title?: string; body?: string; data?: unknown };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), { status: 400 });
  }

  const { user_id, title, body, data: notifData } = payload;
  if (!user_id || !title) {
    return new Response(JSON.stringify({ error: "user_id і title обов'язкові" }), { status: 400 });
  }

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, app_visible")
    .eq("user_id", user_id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ sent: 0, note: "немає підписок для цього user_id" }), { status: 200 });
  }

  const type = (notifData && typeof notifData === "object" && (notifData as Record<string, unknown>).type
    ? String((notifData as Record<string, unknown>).type)
    : "");
  const delivery = DELIVERY[type] ?? DEFAULT_DELIVERY;
  const legacyMessage = JSON.stringify({ title, body: body || "", data: notifData || {} });
  const declarativeMessage = JSON.stringify({
    web_push: 8030,
    notification: {
      title,
      body: body || "",
      lang: "uk",
      tag: "mono-inbox",
      navigate: `${APP_URL}#mono/${inboxTarget(notifData)}`,
    },
    title,
    body: body || "",
    data: notifData || {},
  });
  const formats: Format[] = subs.map((s) => pickFormat(type, String(user_id), s.app_visible));

  const results = await Promise.allSettled(
    subs.map((s, i) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        formats[i] === "declarative" ? declarativeMessage : legacyMessage,
        { TTL: delivery.ttl, urgency: delivery.urgency },
      ).catch(async (err) => {
        // 410/404 — підписка більше не дійсна — видаляємо.
        if (err && (err.statusCode === 410 || err.statusCode === 404)) {
          await supabase.from("push_subscriptions").delete().eq("id", s.id);
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
        msg: String((r.reason as { body?: string; message?: string })?.body ?? (r.reason as Error)?.message ?? "").slice(0, 120),
        format: formats[i],
      }
  );

  try {
    await supabase.from("push_delivery_log").insert({
      user_id,
      type: type || null,
      title: String(title).slice(0, 80),
      urgency: delivery.urgency,
      ttl_s: delivery.ttl,
      subscriptions: subs.length,
      sent,
      failed,
      statuses,
    });
  } catch (_) {
    // журнал не має ламати відправлення
  }

  return new Response(JSON.stringify({ sent, failed }), {
    status: 200,
    headers: JSON_HEADERS,
  });
});
