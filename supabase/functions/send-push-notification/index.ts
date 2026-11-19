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
import { handlePush } from "../_shared/push.ts";

// v13 (PUSH-LOSS): логіка винесена в _shared/push.ts (тестується на моках); журнал push_delivery_log пишеться на кожному виході
//   (401 через збій перевірки, помилка читання підписок, «немає підписок», виняток, успіх) з push_id і причиною (statuses[0].reason);
//   помилка вставки журналу читається й повертається у відповіді (log_error). Колонку push_id додає чат (міграція).
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@example.invalid",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

// Адреса застосунку для notification.navigate (той самий документ, що start_url: index.html → hashchange без перезавантаження).
const APP_URL = "https://andrii-m17.github.io/budget-app/index.html"; // PRIV-2-HANDLE: робоча адреса (рішення власника 18.11)

const DECLARATIVE_USERS = new Set(
  (Deno.env.get("DECLARATIVE_PUSH_USERS") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
);

Deno.serve((req) =>
  handlePush(req, {
    verifySecret: (secret) => supabase.rpc("verify_push_secret", { p_secret: secret }),
    getSubs: (userId) =>
      supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth, app_visible").eq("user_id", userId),
    deleteSub: (id) => supabase.from("push_subscriptions").delete().eq("id", id),
    send: (sub, message, opts) =>
      webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, message, opts),
    insertLog: (row) => supabase.from("push_delivery_log").insert(row),
    declarativeUsers: DECLARATIVE_USERS,
    appUrl: APP_URL,
  })
);
