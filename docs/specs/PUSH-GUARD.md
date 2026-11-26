# PUSH-GUARD · клас ризику A

Мета: функція сповіщень не відправляє з підставними налаштуваннями; нема обов'язкового секрету — не шле, а пише причину в журнал (інцидент 20–22.11: Apple 403 BadJwtToken через запасну адресу VAPID).

## Що зробити
1. index.ts: прибрати запасне значення; обов'язкові VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT; нема або порожній — setVapidDetails не викликати, передати в handlePush ознаку.
2. _shared/push.ts: після перевірки секрету запиту рядок журналу (subscriptions 0, sent 0, failed 1, statuses [{ ok: false, status: null, reason: "config_missing", missing: [назви] }], push_id); відповідь 503 { error: "config_missing" }; значення секретів не потрапляють.
3. DECLARATIVE_PUSH_USERS необов'язковий, без змін.
4. docs/SUPABASE_POLICY.md: розділ «Обов'язкові секрети функцій».
5. Коментар v17 у шапці index.ts.

## Не робимо
Не деплоїмо (чат); send-test-push і клієнт не змінюємо.

## Приймання
X1: без VAPID_SUBJECT → send не викликається, журнал config_missing, missing містить VAPID_SUBJECT, 503. X2: те саме для кожного секрету й порожнього рядка. X3: з усіма секретами поведінка не змінилась. X4: у коді немає "noreply@example".
