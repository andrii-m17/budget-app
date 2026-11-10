-- PUSH-2б (Rev 2.32.278/280): стан «застосунок на екрані» для підписки й поля id/кількості в сповіщенні Monobank.
-- ДЛЯ ТЕСТОВОГО ПРОЄКТУ ТА ІСТОРІЇ. На робочу базу НЕ застосовувати: там уже є (додано чатом).
alter table public.push_subscriptions add column if not exists app_visible boolean not null default false;
alter table public.push_subscriptions add column if not exists app_visible_at timestamptz;

-- notify_mono_inbox: у data додано inbox_id (id найновішої витрати) і count (скільки витрат у пачці).
create or replace function public.notify_mono_inbox(p_user uuid default null::uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare u record; msg record; claimed int; last_id text; total int := 0;
begin
  for u in
    select distinct i.user_id from public.mono_inbox i
     where i.status = 'new' and i.notified_at is null and i.created_at > now() - interval '12 hours'
       and (p_user is null or i.user_id = p_user)
  loop
    if not public.notif_enabled(u.user_id, 'mono_inbox') then continue; end if;
    if public.is_quiet_now(u.user_id) then continue; end if;
    select * into msg from public.build_mono_inbox_notification(u.user_id);
    if msg.title is null then continue; end if;
    with c as (
      update public.mono_inbox set notified_at = now()
       where user_id = u.user_id and status = 'new' and notified_at is null
         and created_at > now() - interval '12 hours'
      returning id, created_at)
    select count(*), (select c2.id::text from c c2 order by c2.created_at desc limit 1) into claimed, last_id from c;
    if claimed > 0 then
      perform public.push_send(u.user_id, msg.title, msg.body,
        jsonb_build_object('type', 'mono-inbox', 'target', 'inbox', 'tag', 'mono-inbox', 'inbox_id', last_id, 'count', claimed,
          'batch_ts', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"')));
      total := total + 1;
    end if;
  end loop;
  return total;
end; $function$;
