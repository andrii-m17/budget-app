-- PUSH-RCPT (13.11): дзеркало серверної зміни, яку вніс чат у робочу базу (budget-app-dev). Тут лише для історії й тестового проєкту;
-- на робочу базу НЕ застосовувати повторно. Причина: report_push_receipts падала з 42501 (RLS), бо on conflict (push_id, user_id) потребує права
-- читання рядка; додано політику SELECT власних рядків, а execute для public і anon забрано.
drop policy if exists push_receipts_select_own on public.push_receipts;
create policy push_receipts_select_own on public.push_receipts for select to authenticated using (user_id = (select auth.uid()));
revoke execute on function public.report_push_receipts(jsonb) from public, anon;
grant execute on function public.report_push_receipts(jsonb) to authenticated, service_role;
