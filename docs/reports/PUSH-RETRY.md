# PUSH-RETRY · звіт (v18 функції send-push-notification)

## Що зроблено
- `statuses`: для кожної підписки `sub_id` (`push_subscriptions.id`) і `transient`. Тимчасові: 429, ≥ 500, 408, без status; `exception`, `subs_read_error`, `auth_check_error`. Нетимчасові: 400, 401, 403, 404, 410, 413 та інші 4xx, `no_subscriptions`, `config_missing`, `sub_gone`.
- Тіло: `push_id` (пріоритет над `data.push_id`, лише uuid), `attempt` (1..3, інакше 1), `only_subs` (до 20 id). При `only_subs` шлемо лише вказаним; відсутні — `sub_gone` без відправки, у `failed` не рахуються.
- `exception` після початку відправки: у `statuses` лежать `sub_id` уже оброблених підписок (`ok:true`), далі рядок `exception`; без відправок — лише `exception` (повтор усім). Синхронний виняток виклику `send` свідомо йде цим шляхом.
- За рев'ю: `attempt` > 3 обрізається до 3 (не скидається на 1); `only_subs` не масив → 400 (щоб збій SQL не розіслав усім); підписки, до яких цикл не дійшов через синхронний виняток, пишуться як `unsent` (`sub_id`, `transient:true`).
- Журнал: `attempt`; відсутня колонка `attempt` або `push_id` (42703 / PGRST204, «колонки не існує») — запис без неї; усі інші помилки вставки лишаються `log_error` без повтору вставки.

## Тести
`node --test` 2468/2468. Нові (на моках, без мережі): sub_id без endpoint; transient для 13 кодів; only_subs і sub_gone; attempt/push_id у журналі; відсутні підписки; ранні виходи; exception після й до відправки; відсутня колонка (Postgres, PostgREST, обидві, інша помилка).

## Відхилення від ТЗ
- Верхній `push_id` тепер читається (раніше тест закріплював «лише data.push_id»); тест оновлено.
- `kbKeepEnter`-подібних змін нема; клієнт, sw.js і send-test-push не чіпались; міграцію не створював.

## Для чату
- Файли для деплою: `supabase/functions/send-push-notification/index.ts`, `supabase/functions/_shared/push.ts`.
- `push_retry_failed`, правило для рядка з `exception`: `only_subs` = усі підписки користувача, крім тих, що мають `ok:true` (не будувати `only_subs` лише з `sub_id` збійних: `unsent` теж треба повторити); якщо в рядку лише `exception` без `sub_id` — усім. Для `send_failed` — лише `sub_id` з `transient:true`.
- Порядок деплою неважливий: без колонки `attempt` журнал пишеться без неї.
- Ризик (з Кроку 0): мережевий збій без status може бути «дійшло, але відповідь загубилась» → можливий дубль; `push_id` той самий.
