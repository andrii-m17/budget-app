# PUSH-RETRY · клас ризику C (функція сповіщень; сервер — чат)

Мета: сповіщення, що не дійшло через тимчасовий збій (Apple 429/5xx, мережа, збій читання), повторюється до 2 разів протягом 30 хв лише на пристрої, де не дійшло. Без дублів і без навантаження в звичайний день.

Розподіл: Код — send-push-notification і _shared/push.ts. Чат (після звіту Коду) — колонка `attempt` (міграція), SQL `push_resend` і `push_retry_failed`, розклад */5 у pg_cron, деплой (спершу тестовий проєкт).

## Крок 0 (стоп і короткий звіт)
1. Як push_send викликає функцію (тіло, заголовки); які поля тіла функція приймає.
2. Чи можна писати в statuses id підписки (sub_id) без розкриття endpoint; приватність.
3. Поведінка при повторі, якщо підписки вже нема (410).
4. Межі «тимчасового збою»: повторюємо 429, ≥ 500, мережевий (status null при send_failed), exception, subs_read_error, auth_check_error; НЕ повторюємо 400, 403, 404, 410, no_subscriptions, config_missing.

## Що зробити (після Кроку 0)
1. statuses: sub_id для кожної підписки і transient: true|false.
2. Тіло: необов'язкові push_id (повтор має той самий), attempt (1 типово), only_subs (масив sub_id); при only_subs шле лише їм; відсутні — в statuses reason "sub_gone", без відправки.
3. Журнал: колонка attempt пишеться з тіла; до міграції функція не падає (спосіб — у Кроці 0).
4. Коментар v18 у шапці.

## Серверна частина (чат)
push_delivery_log + attempt smallint default 1. push_resend(p_push_id, p_sub_ids, p_attempt): title/body/data з user_notifications за data->>'push_id', hide_details як у push_send, той самий push_id, новий запис в архів НЕ пише. push_retry_failed(): рядки журналу 2–30 хв тому, attempt < 3, є statuses із transient true, немає рядка з тим самим push_id і більшим attempt; is_quiet_now → пропуск; спершу EXISTS, потім виклики; розклад */5.

## Сценарії
Звичайний день — 0 викликів від повтору; дві підписки 201 + 503 → повтор лише другій; 429 двічі → 3 спроби і стоп; 410 → видалено, без повтору; config_missing/403 → без повтору; тихі години → пропуск; hide_details → повтор із прихованим текстом; send-test-push без повтору.

## Не робимо
Клієнт, sw.js, send-test-push не чіпаємо; не деплоїмо.

## Тести
Моки handlePush: only_subs, sub_gone, transient для кожного коду, attempt у журналі, той самий push_id; повний node --test. Звіт ≤ 60 рядків + docs/reports/PUSH-RETRY.md.
