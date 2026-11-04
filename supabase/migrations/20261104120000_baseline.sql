--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: backup; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS backup;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: debt_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.debt_kind AS ENUM (
    'card',
    'installment'
);


--
-- Name: hidden_entity_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.hidden_entity_type AS ENUM (
    'bank',
    'installment'
);


--
-- Name: restore_rows(bigint, text, uuid[]); Type: FUNCTION; Schema: backup; Owner: -
--

CREATE FUNCTION backup.restore_rows(p_snapshot_id bigint, p_table text, p_ids uuid[] DEFAULT NULL::uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'backup'
    AS $_$
declare setlist text; n int;
begin
  if p_table <> all (array['expenses','incomes','debts','bank_accounts','installment_accounts','categories','subcategories','dictionary','hidden_entities']) then
    raise exception 'Таблиця % не входить у знімки', p_table;
  end if;
  select string_agg(format('%I = excluded.%I', column_name, column_name), ', ')
    into setlist
    from information_schema.columns
   where table_schema = 'public' and table_name = p_table and column_name <> 'id';
  execute format(
    'insert into public.%1$I select r.* from jsonb_populate_recordset(null::public.%1$I, (select data from backup.snapshot_rows where snapshot_id = $1 and table_name = $2)) r
       where ($3::uuid[] is null or r.id = any($3::uuid[]))
     on conflict (id) do update set %2$s', p_table, setlist)
    using p_snapshot_id, p_table, p_ids;
  get diagnostics n = row_count;
  return n;
end;
$_$;


--
-- Name: take_snapshot(); Type: FUNCTION; Schema: backup; Owner: -
--

CREATE FUNCTION backup.take_snapshot() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'backup'
    AS $$
declare
  sid bigint; t text; cnt int; payload jsonb; total int := 0; deleted int;
  tabs text[] := array['expenses','incomes','debts','bank_accounts','installment_accounts','categories','subcategories','dictionary','hidden_entities'];
begin
  insert into backup.snapshots(is_weekly)
  values (extract(dow from (now() at time zone 'Europe/Kyiv')) = 0)
  returning id into sid;

  foreach t in array tabs loop
    execute format('select count(*), coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t) into cnt, payload;
    insert into backup.snapshot_rows(snapshot_id, table_name, row_count, data) values (sid, t, cnt, payload);
    total := total + cnt;
  end loop;

  delete from backup.snapshots
   where (not is_weekly and taken_at < now() - interval '7 days')
      or (is_weekly and taken_at < now() - interval '21 days');
  get diagnostics deleted = row_count;

  return jsonb_build_object('snapshot_id', sid, 'rows', total, 'old_snapshots_deleted', deleted);
end;
$$;


--
-- Name: auth_family_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auth_family_ids() RETURNS TABLE(family_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select fm.family_id from family_members fm where fm.user_id = auth.uid();
$$;


--
-- Name: build_backup_reminder(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.build_backup_reminder(p_today date DEFAULT ((now() AT TIME ZONE 'Europe/Kyiv'::text))::date) RETURNS TABLE(user_id uuid, title text, body text, data jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select fm.user_id, 'Резервна копія'::text, 'Кінець місяця: експортуйте дані й збережіть файл в iCloud'::text,
         jsonb_build_object('type', 'backup-reminder', 'tag', 'backup-reminder')
  from (select distinct user_id from public.family_members) fm
  where p_today = (date_trunc('month', p_today) + interval '1 month - 1 day')::date
    and public.notif_enabled(fm.user_id, 'backup_reminder')
    and not public.is_quiet_now(fm.user_id)
    and not exists (
      select 1 from public.notification_settings s
      where s.user_id = fm.user_id and s.last_backup_at is not null
        and (s.last_backup_at at time zone 'Europe/Kyiv')::date >= date_trunc('month', p_today)::date)
$$;


--
-- Name: build_daily_reminder(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.build_daily_reminder(p_today date DEFAULT ((now() AT TIME ZONE 'Europe/Kyiv'::text))::date) RETURNS TABLE(user_id uuid, title text, body text, data jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with pend as (
    select i.user_id, count(*)::int as n
      from public.mono_inbox i
     where i.status = 'new'
       and (i.tx_time at time zone 'Europe/Kyiv')::date = p_today
     group by i.user_id
  )
  select fm.user_id,
         case when coalesce(p.n, 0) > 0 then 'Є операції Monobank'
              else 'Сьогодні ще немає витрат' end,
         case when coalesce(p.n, 0) > 0
              then 'У «Вхідних» чекає ' || p.n || ' ' || public.pl_ua(p.n, 'операція', 'операції', 'операцій')
              else 'Додайте їх, поки не забули' end,
         case when coalesce(p.n, 0) > 0
              then jsonb_build_object('type', 'mono-inbox', 'target', 'inbox', 'tag', 'daily-expense-reminder')
              else jsonb_build_object('type', 'daily-expense-reminder', 'tag', 'daily-expense-reminder') end
    from public.family_members fm
    left join pend p on p.user_id = fm.user_id
   where not exists (
           select 1 from public.expenses e
            where e.family_id = fm.family_id and e.deleted_at is null and e.expense_date = p_today)
     and public.notif_enabled(fm.user_id, 'daily_reminder')
     and not public.is_quiet_now(fm.user_id)
$$;


--
-- Name: build_installment_deadlines(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.build_installment_deadlines(p_today date DEFAULT ((now() AT TIME ZONE 'Europe/Kyiv'::text))::date) RETURNS TABLE(user_id uuid, title text, body text, data jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  m record; n int; target date; tmonth date; tlast int;
  items jsonb; cnt int; names text; amt numeric; iid text; when_txt text; noun text; ids jsonb;
begin
  for m in select distinct fm.user_id, fm.family_id from public.family_members fm loop
    continue when not public.notif_enabled(m.user_id, 'installment_deadline') or public.is_quiet_now(m.user_id);
    n := public.notif_installment_days(m.user_id);
    target := p_today + n;
    tmonth := date_trunc('month', target)::date;
    tlast := extract(day from (tmonth + interval '1 month - 1 day'))::int;

    select jsonb_agg(jsonb_build_object(
             'id', i.id, 'name', i.name,
             'amount', (select d.monthly_payment from public.debts d
                        where d.installment_account_id = i.id and d.deleted_at is null
                        order by d.month desc limit 1)) order by i.name)
      into items
    from public.installment_accounts i
    where i.family_id = m.family_id
      and i.deleted_at is null
      and (i.due_day = extract(day from target)::int
           or (extract(day from target)::int = tlast and i.due_day > tlast))
      and not exists (select 1 from public.hidden_entities h
                      where h.entity_type = 'installment' and h.entity_id = i.id
                        and h.deleted_at is null and h.hidden_from_month <= tmonth)
      and not exists (select 1 from public.expenses e
                      where e.linked_installment_id = i.id and e.deleted_at is null
                        and e.expense_date >= tmonth and e.expense_date < (tmonth + interval '1 month')::date)
      and not exists (select 1 from (select d.month, d.balance, d.monthly_payment
                                     from public.debts d
                                     where d.installment_account_id = i.id and d.deleted_at is null
                                     order by d.month desc limit 1) ld
                      where ld.monthly_payment > 0 and ld.balance <= ld.monthly_payment and ld.month < tmonth);

    cnt := coalesce(jsonb_array_length(items), 0);
    continue when cnt = 0;

    when_txt := case n when 1 then 'завтра' else 'через ' || n || ' ' || public.pl_ua(n, 'день', 'дні', 'днів') end;
    noun := case when cnt = 1 then 'Платіж за ОЧ ' else 'Платежі за ОЧ ' end;

    if cnt = 1 then
      amt := nullif((items->0->>'amount')::numeric, 0);
      iid := items->0->>'id';
      body := public.trunc_push(concat_ws(' · ', items->0->>'name',
                 case when amt is not null then public.fmt_money_ua(amt) end,
                 'до ' || public.fmt_date_ua(target)), 80);
      data := jsonb_build_object('type', 'installment-deadline', 'installmentId', iid, 'tag', 'installment-deadline');
    else
      select string_agg(e->>'name', ' · ') into names from jsonb_array_elements(items) as t(e);
      select jsonb_agg(s.e->'id' order by s.ord) into ids
        from (select e, ord from jsonb_array_elements(items) with ordinality as t(e, ord) order by ord limit 10) s;
      body := public.trunc_push(names || ' · до ' || public.fmt_date_ua(target), 80);
      data := jsonb_build_object('type', 'installment-deadline', 'tag', 'installment-deadline', 'installmentIds', ids);
    end if;

    user_id := m.user_id;
    title := public.trunc_push(noun || when_txt, 40);
    return next;
  end loop;
end;
$$;


--
-- Name: build_mono_inbox_notification(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.build_mono_inbox_notification(p_user uuid) RETURNS TABLE(title text, body text, n integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare cnt int; r record; v_merchant text; v_amount text; v_cat text;
begin
  select count(*) into cnt from public.mono_inbox i
   where i.user_id = p_user and i.status = 'new' and i.notified_at is null
     and i.created_at > now() - interval '12 hours';
  if cnt = 0 then return; end if;

  select i.description, i.amount_uah, i.suggested_category into r
    from public.mono_inbox i
   where i.user_id = p_user and i.status = 'new' and i.notified_at is null
     and i.created_at > now() - interval '12 hours'
   order by i.tx_time desc limit 1;

  v_merchant := coalesce(nullif(btrim(r.description), ''), 'Операція');
  v_amount := '−' || public.fmt_money_ua(r.amount_uah::numeric);
  v_cat := regexp_replace(coalesce(r.suggested_category, ''), '^[^А-Яа-яA-Za-zІіЇїЄєҐґ]+', '');

  if cnt = 1 then
    title := 'Monobank';
    body := public.trunc_push(v_merchant || ' · ' || v_amount
              || case when v_cat <> '' then ' · ' || v_cat else '' end, 100);
  else
    title := 'Monobank: ' || cnt || ' ' || public.pl_ua(cnt, 'нова операція', 'нові операції', 'нових операцій');
    body := public.trunc_push('Остання: ' || v_merchant || ' · ' || v_amount, 100);
  end if;
  n := cnt;
  return next;
end;
$$;


--
-- Name: build_month_start(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.build_month_start(p_today date DEFAULT ((now() AT TIME ZONE 'Europe/Kyiv'::text))::date) RETURNS TABLE(user_id uuid, title text, body text, data jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select fm.user_id, 'Новий місяць'::text, 'Оновіть баланси карток у «Борги»'::text,
         jsonb_build_object('type', 'monthly-debt-reminder', 'tag', 'monthly-debt-reminder')
  from public.family_members fm
  where extract(day from p_today) = 1
    and exists (select 1 from public.bank_accounts b
                where b.family_id = fm.family_id
                  and b.deleted_at is null
                  and not exists (select 1 from public.hidden_entities h
                                  where h.entity_type = 'bank' and h.entity_id = b.id and h.deleted_at is null
                                    and h.hidden_from_month <= date_trunc('month', p_today)::date))
    and public.notif_enabled(fm.user_id, 'month_start')
    and not public.is_quiet_now(fm.user_id)
$$;


--
-- Name: build_other_actor_summary_for(uuid, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.build_other_actor_summary_for(p_user uuid, p_since timestamp with time zone, p_until timestamp with time zone DEFAULT now()) RETURNS TABLE(title text, body text, data jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  a record;
  nm text; gd text;
  want_changes boolean := public.notif_enabled(p_user, 'other_actor_changes');
  want_deletes boolean := public.notif_enabled(p_user, 'other_actor_deletions');
  n_e_add int; n_i_add int; n_e_chg int; n_i_chg int; n_debt int;
  n_e_del int; n_i_del int; n_d_del int;
  sum_e numeric; sum_i numeric; sum_e_del numeric; sum_i_del numeric;
  n_total int; n_del int; k_e int; k_i int; k_d int; kinds int;
  v_act text; obj text; bdy text;
  it jsonb; names text;
  ids_e jsonb; ids_i jsonb; ids_d jsonb;
begin
  for a in
    with ev as (
      select 'expense'::text kind, coalesce(e.updated_by, e.created_by) actor, e.amount::numeric amount,
             nullif(btrim(e.note), '') note, e.category category, e.expense_date dt,
             case when e.deleted_at is not null and e.deleted_at > p_since then (case when e.created_at > p_since then 'skip' else 'deleted' end)
                  when e.deleted_at is not null then 'skip'
                  when e.created_at > p_since then 'added' else 'changed' end act,
             e.id::text rid
      from public.expenses e
      where e.family_id in (select family_id from public.family_members where user_id = p_user)
        and e.updated_at > p_since and e.updated_at <= p_until
      union all
      select 'income', coalesce(i.updated_by, i.created_by), i.amount::numeric,
             nullif(btrim(i.note), ''), null::text, i.income_date,
             case when i.deleted_at is not null and i.deleted_at > p_since then (case when i.created_at > p_since then 'skip' else 'deleted' end)
                  when i.deleted_at is not null then 'skip'
                  when i.created_at > p_since then 'added' else 'changed' end,
             i.id::text
      from public.incomes i
      where i.family_id in (select family_id from public.family_members where user_id = p_user)
        and i.updated_at > p_since and i.updated_at <= p_until
      union all
      select 'debt', coalesce(d.updated_by, d.created_by), d.balance,
             nullif(btrim(d.name), ''), null::text, d.month,
             case when d.deleted_at is not null and d.deleted_at > p_since then (case when d.created_at > p_since then 'skip' else 'deleted' end)
                  when d.deleted_at is not null then 'skip'
                  when d.created_at > p_since then 'added' else 'changed' end,
             d.id::text
      from public.debts d
      where d.family_id in (select family_id from public.family_members where user_id = p_user)
        and d.updated_at > p_since and d.updated_at <= p_until
    )
    select actor,
           jsonb_agg(jsonb_build_object('kind', kind, 'act', act, 'amount', amount, 'note', note, 'category', category, 'dt', dt, 'id', rid) order by kind) filter (where act <> 'skip') items
    from ev
    where actor is not null and actor <> p_user
    group by actor
    having count(*) filter (where act <> 'skip') > 0
  loop
    select coalesce(u.push_name, u.display_name, 'Хтось'), u.gender into nm, gd from public.users u where u.id = a.actor;
    nm := coalesce(nm, 'Хтось');

    select
      count(*) filter (where x->>'kind'='expense' and x->>'act'='added'),
      count(*) filter (where x->>'kind'='income'  and x->>'act'='added'),
      count(*) filter (where x->>'kind'='expense' and x->>'act'='changed'),
      count(*) filter (where x->>'kind'='income'  and x->>'act'='changed'),
      count(*) filter (where x->>'kind'='debt'    and x->>'act' in ('added','changed')),
      count(*) filter (where x->>'kind'='expense' and x->>'act'='deleted'),
      count(*) filter (where x->>'kind'='income'  and x->>'act'='deleted'),
      count(*) filter (where x->>'kind'='debt'    and x->>'act'='deleted'),
      coalesce(sum((x->>'amount')::numeric) filter (where x->>'kind'='expense' and x->>'act' in ('added','changed')), 0),
      coalesce(sum((x->>'amount')::numeric) filter (where x->>'kind'='income'  and x->>'act' in ('added','changed')), 0),
      coalesce(sum((x->>'amount')::numeric) filter (where x->>'kind'='expense' and x->>'act'='deleted'), 0),
      coalesce(sum((x->>'amount')::numeric) filter (where x->>'kind'='income'  and x->>'act'='deleted'), 0)
    into n_e_add, n_i_add, n_e_chg, n_i_chg, n_debt, n_e_del, n_i_del, n_d_del, sum_e, sum_i, sum_e_del, sum_i_del
    from jsonb_array_elements(a.items) as t(x);

    select coalesce(jsonb_agg(q.id), '[]'::jsonb) into ids_e from (select x->>'id' id from jsonb_array_elements(a.items) as t(x) where x->>'kind'='expense' and x->>'act' in ('added','changed') limit 10) q;
    select coalesce(jsonb_agg(q.id), '[]'::jsonb) into ids_i from (select x->>'id' id from jsonb_array_elements(a.items) as t(x) where x->>'kind'='income' and x->>'act' in ('added','changed') limit 10) q;
    select coalesce(jsonb_agg(q.id), '[]'::jsonb) into ids_d from (select x->>'id' id from jsonb_array_elements(a.items) as t(x) where x->>'kind'='debt' and x->>'act' in ('added','changed') limit 10) q;

    n_total := n_e_add + n_i_add + n_e_chg + n_i_chg + n_debt;
    if want_changes and n_total > 0 then
      k_e := n_e_add + n_e_chg; k_i := n_i_add + n_i_chg; k_d := n_debt;
      kinds := (k_e > 0)::int + (k_i > 0)::int + (k_d > 0)::int;

      v_act := case
        when n_e_chg + n_i_chg = 0 and k_d = 0 then 'added'
        when n_e_add + n_i_add = 0 and k_d = 0 then 'changed'
        else 'updated' end;

      if n_total = 1 then
        obj := case when v_act = 'changed' then 'запис'
                    when k_e = 1 then public.pl_noun('expense', 1, true)
                    when k_i = 1 then public.pl_noun('income', 1, true)
                    else public.pl_noun('debt', 1, true) end;
        select x into it from jsonb_array_elements(a.items) as t(x) where x->>'act' <> 'deleted' limit 1;
        if it->>'kind' = 'expense' then
          bdy := concat_ws(' · ',
            coalesce(it->>'note', it->>'category', 'Витрата'),
            public.fmt_money_ua((it->>'amount')::numeric),
            case when v_act = 'added' and (it->>'note') is not null and (it->>'category') is not null then it->>'category' end);
        elsif it->>'kind' = 'income' then
          bdy := concat_ws(' · ', coalesce(it->>'note', 'Дохід'), public.fmt_money_ua((it->>'amount')::numeric, true));
        else
          bdy := concat_ws(' · ', coalesce(it->>'note', 'Борг'), public.fmt_money_ua((it->>'amount')::numeric));
        end if;
      else
        if kinds = 1 and v_act = 'added' and k_e > 0 then obj := n_total || ' ' || public.pl_noun('expense', n_total, true);
        elsif kinds = 1 and v_act = 'added' and k_i > 0 then obj := n_total || ' ' || public.pl_noun('income', n_total, true);
        elsif kinds = 1 and v_act = 'updated' and k_d > 0 then obj := n_total || ' ' || public.pl_noun('debt', n_total, true);
        else obj := n_total || ' ' || public.pl_noun('record', n_total, true); end if;

        if kinds = 1 and k_e > 0 then bdy := 'Разом ' || public.fmt_money_ua(sum_e);
        elsif kinds = 1 and k_i > 0 then bdy := 'Разом ' || public.fmt_money_ua(sum_i, true);
        elsif kinds = 1 and k_d > 0 then
          select string_agg(distinct coalesce(x->>'note', 'Борг'), ' · ') into names from jsonb_array_elements(a.items) as t(x) where x->>'kind' = 'debt' and x->>'act' <> 'deleted';
          bdy := names;
        else
          bdy := concat_ws(' · ',
            case when k_e > 0 then k_e || ' ' || public.pl_noun('expense', k_e, false) end,
            case when k_i > 0 then k_i || ' ' || public.pl_noun('income', k_i, false) end,
            case when k_d > 0 then k_d || ' ' || public.pl_noun('debt', k_d, false) end);
        end if;
      end if;

      title := public.trunc_push(public.push_actor_title(nm, gd, v_act, obj), 40);
      body := public.trunc_push(bdy, 80);
      data := jsonb_build_object(
        'type', 'other-actor-summary',
        'actor', a.actor,
        'target', case when k_e > 0 then 'journal' when k_i > 0 then 'accounting' when k_d > 0 then 'debts' else 'journal' end,
        'ids', jsonb_build_object('expenses', ids_e, 'incomes', ids_i, 'debts', ids_d));
      return next;
    end if;

    n_del := n_e_del + n_i_del + n_d_del;
    if want_deletes and n_del > 0 then
      if n_del = 1 then
        obj := case when n_e_del = 1 then public.pl_noun('expense', 1, true)
                    when n_i_del = 1 then public.pl_noun('income', 1, true)
                    else 'запис' end;
        select x into it from jsonb_array_elements(a.items) as t(x) where x->>'act' = 'deleted' limit 1;
        if it->>'kind' = 'debt' then
          bdy := coalesce(it->>'note', 'Борг');
        else
          bdy := concat_ws(' · ',
            coalesce(it->>'note', it->>'category', case when it->>'kind' = 'income' then 'Дохід' else 'Витрата' end),
            public.fmt_money_ua((it->>'amount')::numeric),
            public.fmt_date_ua((it->>'dt')::date));
        end if;
      else
        if n_e_del = n_del then obj := n_del || ' ' || public.pl_noun('expense', n_del, true);
        elsif n_i_del = n_del then obj := n_del || ' ' || public.pl_noun('income', n_del, true);
        else obj := n_del || ' ' || public.pl_noun('record', n_del, true); end if;

        if n_e_del = n_del then bdy := 'Разом ' || public.fmt_money_ua(sum_e_del);
        elsif n_i_del = n_del then bdy := 'Разом ' || public.fmt_money_ua(sum_i_del);
        else
          bdy := concat_ws(' · ',
            case when n_e_del > 0 then n_e_del || ' ' || public.pl_noun('expense', n_e_del, false) end,
            case when n_i_del > 0 then n_i_del || ' ' || public.pl_noun('income', n_i_del, false) end,
            case when n_d_del > 0 then n_d_del || ' ' || public.pl_noun('debt', n_d_del, false) end);
        end if;
      end if;

      title := public.trunc_push(public.push_actor_title(nm, gd, 'deleted', obj), 40);
      body := public.trunc_push(bdy, 80);
      data := jsonb_build_object('type', 'other-actor-deleted', 'actor', a.actor);
      return next;
    end if;
  end loop;
end;
$$;


--
-- Name: bump_purge_epoch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_purge_epoch() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if old.family_id is not null then
    insert into public.sync_epochs as s (family_id, purged_at)
    values (old.family_id, now())
    on conflict (family_id) do update set purged_at = excluded.purged_at;
  end if;
  return old;
end;
$$;


--
-- Name: categories_late_bind(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.categories_late_bind() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.expenses set category_id = new.id where family_id = new.family_id and category = new.name and category_id is null;
  return new;
end $$;


--
-- Name: categories_propagate_rename(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.categories_propagate_rename() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.name is distinct from old.name then
    insert into public.taxonomy_aliases(family_id, kind, old_name, target_id) values (new.family_id, 'category', old.name, new.id);
    update public.expenses set category = new.name, updated_by = coalesce(auth.uid(), updated_by) where category_id = new.id and category is distinct from new.name;
  end if;
  return new;
end $$;


--
-- Name: claim_push_subscription(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_push_subscription(p_endpoint text, p_p256dh text, p_auth text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare uid uuid := auth.uid(); fam uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_endpoint is null or length(p_endpoint) < 20 or p_p256dh is null or p_auth is null then
    raise exception 'invalid subscription' using errcode = '22023';
  end if;
  select fm.family_id into fam from public.family_members fm where fm.user_id = uid limit 1;
  if fam is null then
    raise exception 'user has no family' using errcode = '42501';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id <> uid;
  insert into public.push_subscriptions(user_id, family_id, endpoint, p256dh, auth)
  values (uid, fam, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, family_id = excluded.family_id,
        p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;


--
-- Name: clear_notifications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clear_notifications() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  delete from public.user_notifications where user_id = uid;
  get diagnostics n = row_count;
  return n;
end;
$$;


--
-- Name: delete_notification(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_notification(p_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  delete from public.user_notifications where id = p_id and user_id = uid;
  get diagnostics n = row_count;
  return n;
end; $$;


--
-- Name: expenses_resolve_refs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expenses_resolve_refs() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a record;
begin
  if tg_op = 'INSERT' or new.category is distinct from old.category then
    new.category_id := (select c.id from public.categories c where c.family_id = new.family_id and c.name = new.category and c.deleted_at is null order by c.created_at limit 1);
    if new.category_id is null and new.category is not null then
      select c.id, c.name into a from public.taxonomy_aliases al join public.categories c on c.id = al.target_id and c.deleted_at is null where al.family_id = new.family_id and al.kind = 'category' and al.old_name = new.category order by al.created_at desc limit 1;
      if a.id is not null then new.category_id := a.id; new.category := a.name; end if;
    end if;
  end if;
  if tg_op = 'INSERT' or new.subcategory is distinct from old.subcategory or new.category is distinct from old.category then
    new.subcategory_id := (select s.id from public.subcategories s where s.family_id = new.family_id and s.name = new.subcategory and s.category_id = new.category_id and s.deleted_at is null order by s.created_at limit 1);
    if new.subcategory_id is null and new.subcategory is not null and new.category_id is not null then
      select s.id, s.name into a from public.taxonomy_aliases al join public.subcategories s on s.id = al.target_id and s.deleted_at is null and s.category_id = new.category_id where al.family_id = new.family_id and al.kind = 'subcategory' and al.old_name = new.subcategory order by al.created_at desc limit 1;
      if a.id is not null then new.subcategory_id := a.id; new.subcategory := a.name; end if;
    end if;
  end if;
  return new;
end $$;


--
-- Name: fmt_date_ua(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fmt_date_ua(d date) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select extract(day from d)::int::text || ' ' ||
    (array['січ.','лют.','бер.','квіт.','трав.','черв.','лип.','серп.','вер.','жовт.','лист.','груд.'])[extract(month from d)::int]
$$;


--
-- Name: fmt_money_ua(numeric, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fmt_money_ua(n numeric, plus boolean DEFAULT false) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select case when plus and n > 0 then '+' else '' end
      || replace(to_char(abs(n), 'FM999,999,999,990'), ',', E'\u00a0')
      || E'\u00a0₴'
$$;


--
-- Name: is_quiet_now(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_quiet_now(p_user uuid, p_ts timestamp with time zone DEFAULT now()) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((
    select s.quiet_enabled and (
      case when s.quiet_start <= s.quiet_end
        then (p_ts at time zone 'Europe/Kyiv')::time >= s.quiet_start and (p_ts at time zone 'Europe/Kyiv')::time < s.quiet_end
        else (p_ts at time zone 'Europe/Kyiv')::time >= s.quiet_start or (p_ts at time zone 'Europe/Kyiv')::time < s.quiet_end
      end)
    from public.notification_settings s where s.user_id = p_user
  ), false)
$$;


--
-- Name: mark_notifications_read(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_notifications_read(p_ids uuid[] DEFAULT NULL::uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  update public.user_notifications set read_at = now()
   where user_id = uid and read_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;


--
-- Name: mono_accept(uuid, text, text, text, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mono_accept(p_inbox_id uuid, p_category text DEFAULT NULL::text, p_subcategory text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_amount integer DEFAULT NULL::integer, p_installment_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  uid uuid := auth.uid(); i record; v_cat text; v_sub text; v_note text; v_id uuid; v_amount int; v_inst uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into i from public.mono_inbox where id = p_inbox_id and user_id = uid for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if i.status not in ('new', 'skipped') then raise exception 'already decided' using errcode = '23505'; end if;
  if i.amount_minor >= 0 then raise exception 'not a purchase' using errcode = '22023'; end if;
  v_amount := coalesce(p_amount, i.amount_uah);
  if v_amount is null or v_amount < 1 or v_amount > 2147483647 then
    raise exception 'invalid amount' using errcode = '22023';
  end if;
  v_cat := coalesce(nullif(btrim(p_category), ''), i.suggested_category);
  if v_cat is null then raise exception 'category required' using errcode = '22023'; end if;
  if not exists (select 1 from public.categories c where c.family_id = i.family_id and c.name = v_cat and c.deleted_at is null and c.active) then
    raise exception 'unknown category' using errcode = '22023';
  end if;
  v_sub := coalesce(nullif(btrim(p_subcategory), ''), i.suggested_subcategory);
  if v_sub is not null and not exists (
       select 1 from public.subcategories s join public.categories c on c.id = s.category_id
        where c.family_id = i.family_id and c.name = v_cat and s.name = v_sub and s.deleted_at is null and s.active) then
    v_sub := null;
  end if;
  if p_installment_id is not null then
    if not exists (select 1 from public.installment_accounts a where a.id = p_installment_id and a.family_id = i.family_id and a.deleted_at is null) then
      raise exception 'unknown installment' using errcode = '22023';
    end if;
    v_inst := p_installment_id;
  end if;
  v_note := left(btrim(regexp_replace(coalesce(p_note, i.description, ''), '[<>[:cntrl:]]', ' ', 'g')), 60);
  v_id := md5('mono:' || i.family_id::text || ':' || i.mono_tx_id)::uuid;
  insert into public.expenses (id, family_id, amount, expense_date, category, subcategory, note, created_by, updated_by, source, external_id, linked_installment_id)
  values (v_id, i.family_id, v_amount, (i.tx_time at time zone 'Europe/Kyiv')::date, v_cat, v_sub, nullif(v_note, ''), uid, uid, 'mono', i.mono_tx_id, v_inst)
  on conflict (id) do nothing;
  update public.mono_inbox set status = 'added', expense_id = v_id, decided_at = now() where id = i.id;
  return v_id;
end; $$;


--
-- Name: mono_apply_refund(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mono_apply_refund(p_inbox_id uuid, p_expense_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  uid uuid := auth.uid(); i record; e record; v_refund int; v_new int; v_deleted boolean := false;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into i from public.mono_inbox where id = p_inbox_id and user_id = uid for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if i.status <> 'skipped' or i.skip_reason is distinct from 'income_or_refund' or i.amount_minor <= 0 then
    raise exception 'not a refund' using errcode = '22023';
  end if;
  v_refund := public.mono_round_uah(i.amount_minor);
  if v_refund is null then raise exception 'refund too small' using errcode = '22023'; end if;

  select * into e from public.expenses
   where id = p_expense_id and family_id = i.family_id and deleted_at is null for update;
  if not found then raise exception 'expense not found' using errcode = 'P0002'; end if;

  v_new := e.amount - v_refund;
  if v_new <= 0 then
    update public.expenses set deleted_at = now(), updated_at = now(), updated_by = uid where id = e.id;
    v_deleted := true;
  else
    update public.expenses set amount = v_new, updated_at = now(), updated_by = uid where id = e.id;
  end if;

  update public.mono_inbox set status = 'refunded', expense_id = e.id, decided_at = now() where id = i.id;
  return jsonb_build_object('expense_id', e.id, 'old_amount', e.amount, 'new_amount', greatest(v_new, 0), 'deleted', v_deleted);
end;
$$;


--
-- Name: mono_bigint(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mono_bigint(p_text text) RETURNS bigint
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $_$
  select case when p_text ~ '^-?[0-9]{1,15}$' then p_text::bigint else null end
$_$;


--
-- Name: mono_expense_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mono_expense_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if tg_op = 'DELETE' then
    if old.external_id is not null and old.source = 'mono' then
      update public.mono_inbox set status = 'ignored', decided_at = now()
       where expense_id = old.id and status = 'added';
    end if;
    return old;
  end if;
  if new.external_id is not null and new.source = 'mono' then
    if new.deleted_at is not null and old.deleted_at is null then
      update public.mono_inbox set status = 'ignored', decided_at = now()
       where expense_id = new.id and status = 'added';
    elsif new.deleted_at is null and old.deleted_at is not null then
      update public.mono_inbox set status = 'added', decided_at = now()
       where expense_id = new.id and status = 'ignored';
    end if;
  end if;
  return new;
end;
$$;


--
-- Name: mono_ignore(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mono_ignore(p_inbox_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  update public.mono_inbox set status = 'ignored', decided_at = now()
   where id = p_inbox_id and user_id = uid and status in ('new', 'skipped');
end;
$$;


--
-- Name: mono_inbox_autoread(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mono_inbox_autoread() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if old.status = 'new' and new.status <> 'new' then
    -- 1) batch notification (same notified_at): read when the whole batch is handled
    if new.notified_at is not null
       and not exists (select 1 from public.mono_inbox m where m.user_id = new.user_id and m.notified_at = new.notified_at and m.status = 'new') then
      update public.user_notifications set read_at = now()
       where user_id = new.user_id and type = 'mono-inbox' and read_at is null and created_at = new.notified_at;
    end if;
    -- 2) daily digest: read when nothing of that Kyiv day is still new
    update public.user_notifications n set read_at = now()
     where n.user_id = new.user_id and n.type = 'mono-inbox' and n.read_at is null
       and n.data->>'tag' = 'daily-expense-reminder'
       and not exists (select 1 from public.mono_inbox m
                        where m.user_id = new.user_id and m.status = 'new'
                          and (m.tx_time at time zone 'Europe/Kyiv')::date = (n.created_at at time zone 'Europe/Kyiv')::date);
  end if;
  return null;
end; $$;


--
-- Name: mono_ingest(uuid, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mono_ingest(p_user uuid, p_item jsonb, p_source text DEFAULT 'webhook'::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  conn record; acc record;
  v_tx text; v_amount bigint; v_time timestamptz; v_mcc int; v_orig int;
  v_desc text; v_comment text; v_status text := 'new'; v_reason text; v_uah int; v_rows int;
  v_cat text; v_sub text; v_hcat text; v_hsub text; v_inst uuid;
begin
  if p_source not in ('webhook','backfill') then return 'invalid'; end if;
  select * into conn from public.mono_connections where user_id = p_user and status in ('active','pending');
  if not found then return 'no_connection'; end if;
  select * into acc from public.mono_accounts where user_id = p_user and mono_account_id = p_item->>'account';
  if not found or not acc.tracked then return 'untracked'; end if;
  v_tx := nullif(btrim(p_item->>'id'), '');
  if v_tx is null or length(v_tx) > 64 then return 'invalid'; end if;
  v_amount := public.mono_bigint(p_item->>'amount');
  if v_amount is null or abs(v_amount) > 100000000000 then return 'invalid'; end if;
  if public.mono_bigint(p_item->>'time') is null then return 'invalid'; end if;
  v_time := to_timestamp(public.mono_bigint(p_item->>'time'));
  v_mcc := public.mono_bigint(p_item->>'mcc')::int;
  v_orig := public.mono_bigint(p_item->>'originalMcc')::int;
  v_desc := left(btrim(regexp_replace(coalesce(p_item->>'description', ''), '[<>[:cntrl:]]', ' ', 'g')), 200);
  v_comment := left(btrim(regexp_replace(coalesce(p_item->>'comment', ''), '[<>[:cntrl:]]', ' ', 'g')), 200);
  if v_amount >= 0 then
    v_status := 'skipped'; v_reason := case when v_amount > 0 then 'income_or_refund' else 'zero' end;
  elsif v_mcc in (6010, 6011) then
    v_status := 'skipped'; v_reason := 'cash';
  elsif (v_mcc = 4829 and v_desc !~* '^щомісячний платіж') or v_desc ~* '^(переказ|поповнення|від:|на картку|з картки)' then
    v_status := 'skipped'; v_reason := 'transfer';
  else
    v_uah := public.mono_round_uah(v_amount);
    if v_uah is null then v_status := 'skipped'; v_reason := 'too_small'; end if;
  end if;
  select category, subcategory into v_cat, v_sub from public.mono_mcc_rules where family_id = conn.family_id and mcc = v_mcc;
  if v_desc <> '' and v_status = 'new' then
    select h.category, h.subcategory into v_hcat, v_hsub
    from (
      select g.category, g.subcategory, g.cnt,
             lead(g.cnt) over (order by g.cnt desc, g.last_at desc) as next_cnt,
             row_number() over (order by g.cnt desc, g.last_at desc) as rn
      from (
        select e.category, e.subcategory, count(*) as cnt, max(i.decided_at) as last_at
          from public.mono_inbox i join public.expenses e on e.id = i.expense_id
         where i.user_id = p_user and i.status = 'added' and e.deleted_at is null and lower(i.description) = lower(v_desc)
         group by e.category, e.subcategory) g) h
    where h.rn = 1 and (h.next_cnt is null or h.cnt > h.next_cnt);
    if v_hcat is not null and exists (select 1 from public.categories c where c.family_id = conn.family_id and c.name = v_hcat and c.deleted_at is null and c.active) then
      v_cat := v_hcat; v_sub := v_hsub;
    end if;
  end if;
  -- installment payment: suggest the single installment whose latest monthly payment equals the amount (+-1 UAH)
  if v_status = 'new' and v_uah is not null and v_desc ~* '^щомісячний платіж' then
    select case when count(*) = 1 then (array_agg(x.id))[1] end into v_inst
    from (
      select a.id from public.installment_accounts a
       where a.family_id = conn.family_id and a.deleted_at is null
         and exists (select 1 from public.debts d
                      where d.installment_account_id = a.id and d.deleted_at is null and d.monthly_payment > 0
                        and abs(d.monthly_payment - v_uah) <= 1
                        and d.month = (select max(d2.month) from public.debts d2
                                        where d2.installment_account_id = a.id and d2.deleted_at is null and d2.monthly_payment > 0))
    ) x;
  end if;
  insert into public.mono_inbox (user_id, family_id, mono_tx_id, mono_account_id, tx_time, description, comment, mcc, original_mcc, hold,
    amount_minor, operation_amount_minor, currency_code, commission_minor, cashback_minor, balance_minor,
    amount_uah, status, skip_reason, suggested_category, suggested_subcategory, suggested_installment_id, source, notified_at)
  values (p_user, conn.family_id, v_tx, acc.mono_account_id, v_time, nullif(v_desc, ''), nullif(v_comment, ''), v_mcc, v_orig,
    coalesce((p_item->>'hold')::boolean, false), v_amount, public.mono_bigint(p_item->>'operationAmount'), public.mono_bigint(p_item->>'currencyCode')::int,
    public.mono_bigint(p_item->>'commissionRate'), public.mono_bigint(p_item->>'cashbackAmount'), public.mono_bigint(p_item->>'balance'),
    v_uah, v_status, v_reason, v_cat, v_sub, v_inst, p_source, case when p_source = 'backfill' then now() else null end)
  on conflict (user_id, mono_tx_id) do nothing;
  get diagnostics v_rows = row_count;
  update public.mono_connections set last_event_at = now() where user_id = p_user;
  if v_rows = 0 then return 'duplicate'; end if;
  return v_status;
end; $$;


--
-- Name: mono_refund_candidates(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mono_refund_candidates(p_inbox_id uuid) RETURNS TABLE(expense_id uuid, expense_date date, amount integer, note text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare uid uuid := auth.uid(); i record; v_key text; v_day date;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into i from public.mono_inbox where id = p_inbox_id and user_id = uid;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if i.amount_minor <= 0 then return; end if;
  v_key := lower(btrim(regexp_replace(coalesce(i.description, ''), '^(скасування|повернення)[.:]?\s*', '', 'i')));
  if v_key = '' then return; end if;
  v_day := (i.tx_time at time zone 'Europe/Kyiv')::date;
  return query
    select e.id, e.expense_date, e.amount, e.note
      from public.expenses e
      join public.mono_inbox p on p.expense_id = e.id and p.user_id = uid
     where e.family_id = i.family_id and e.deleted_at is null
       and lower(p.description) = v_key
       and e.expense_date between v_day - 14 and v_day
     order by e.expense_date desc,
              abs(e.amount - coalesce(public.mono_round_uah(i.amount_minor), 0)) asc,
              e.created_at desc
     limit 5;
end;
$$;


--
-- Name: mono_round_uah(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mono_round_uah(p_minor bigint) RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select case when floor(abs(p_minor) / 100.0 + 0.5) between 1 and 2147483647
              then floor(abs(p_minor) / 100.0 + 0.5)::int else null end
$$;


--
-- Name: notif_enabled(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_enabled(p_user uuid, p_key text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select case when p_key <> 'notifications_enabled' and not s.notifications_enabled then false
                 else (to_jsonb(s) ->> p_key)::boolean end
       from public.notification_settings s where s.user_id = p_user),
    case p_key when 'weekly_summary' then false when 'month_end' then false else true end
  )
$$;


--
-- Name: notif_installment_days(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_installment_days(p_user uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select s.installment_days::int from public.notification_settings s where s.user_id = p_user), 2)
$$;


--
-- Name: notify_backup_reminder(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_backup_reminder() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare r record;
begin
  for r in select * from public.build_backup_reminder() loop
    perform public.push_send(r.user_id, r.title, r.body, r.data);
  end loop;
end;
$$;


--
-- Name: notify_daily_expense_reminder(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_daily_expense_reminder() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare r record;
begin
  for r in select * from public.build_daily_reminder() loop
    perform public.push_send(r.user_id, r.title, r.body, r.data);
  end loop;
end;
$$;


--
-- Name: notify_debt_and_installment_deadlines(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_debt_and_installment_deadlines() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare r record;
begin
  for r in select * from public.build_month_start() loop
    perform public.push_send(r.user_id, r.title, r.body, r.data);
  end loop;
  for r in select * from public.build_installment_deadlines() loop
    perform public.push_send(r.user_id, r.title, r.body, r.data);
  end loop;
end;
$$;


--
-- Name: notify_mono_inbox(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_mono_inbox(p_user uuid DEFAULT NULL::uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare u record; msg record; claimed int; total int := 0;
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
      returning 1)
    select count(*) into claimed from c;

    if claimed > 0 then
      perform public.push_send(u.user_id, msg.title, msg.body,
        jsonb_build_object('type', 'mono-inbox', 'target', 'inbox', 'tag', 'mono-inbox',
          'batch_ts', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"')));
      total := total + 1;
    end if;
  end loop;
  return total;
end; $$;


--
-- Name: notify_other_actor_summary(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_other_actor_summary() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare m record; msg record; run_ts timestamptz := now(); s timestamptz;
begin
  insert into public.push_cron_state(job_name, last_run_at)
  values ('other-actor-summary', run_ts - interval '20 minutes')
  on conflict (job_name) do nothing;

  for m in select distinct user_id from public.family_members loop
    continue when public.is_quiet_now(m.user_id, run_ts);  -- у тихі години «since» не просуваємо: зведення прийде після їх завершення
    select ns.last_run_at into s from public.notification_state ns
      where ns.user_id = m.user_id and ns.job_name = 'other-actor-summary';
    if s is null then s := run_ts - interval '20 minutes'; end if;

    for msg in select * from public.build_other_actor_summary_for(m.user_id, s, run_ts) loop
      perform public.push_send(m.user_id, msg.title, msg.body, msg.data);
    end loop;

    insert into public.notification_state(user_id, job_name, last_run_at)
    values (m.user_id, 'other-actor-summary', run_ts)
    on conflict (user_id, job_name) do update set last_run_at = excluded.last_run_at;
  end loop;

  update public.push_cron_state set last_run_at = run_ts where job_name = 'other-actor-summary';
end;
$$;


--
-- Name: ops_guard(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ops_guard(p_dry_run boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
declare
  v_db_mb numeric := round(pg_database_size(current_database()) / 1048576.0, 1);
  v_big_tbl text; v_big_bytes bigint;
  v_last_snapshot timestamptz;
  v_cron_fail int; v_cron_fail_jobs text;
  v_push_sent int; v_push_failed int;
  v_mono_bad text;
  v_alerts text[] := '{}';
  v_sent int := 0;
  v_body text;
  u record;
begin
  select n.nspname || '.' || c.relname, pg_total_relation_size(c.oid)
    into v_big_tbl, v_big_bytes
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r' and n.nspname not in ('pg_catalog', 'information_schema')
   order by pg_total_relation_size(c.oid) desc limit 1;

  select max(taken_at) into v_last_snapshot from backup.snapshots;

  select count(*), string_agg(distinct coalesce(j.jobname, d.jobid::text), ', ')
    into v_cron_fail, v_cron_fail_jobs
    from cron.job_run_details d left join cron.job j on j.jobid = d.jobid
   where d.end_time > now() - interval '7 days' and d.status = 'failed';

  select coalesce(sum(sent), 0), coalesce(sum(failed), 0)
    into v_push_sent, v_push_failed
    from public.push_delivery_log where created_at > now() - interval '7 days';

  select string_agg(left(last_error, 60), '; ')
    into v_mono_bad
    from public.mono_connections
   where coalesce(last_error, '') <> '' and status <> 'disconnected';

  if v_db_mb > 150 then v_alerts := v_alerts || format('База %s МБ (поріг 150)', v_db_mb); end if;
  if v_big_bytes > 25 * 1048576 then v_alerts := v_alerts || format('Таблиця %s: %s МБ', v_big_tbl, round(v_big_bytes / 1048576.0, 1)); end if;
  if v_last_snapshot is null or v_last_snapshot < now() - interval '36 hours' then v_alerts := v_alerts || 'Резервний знімок старший за 36 год'::text; end if;
  if v_cron_fail > 0 then v_alerts := v_alerts || format('Збої планувальника: %s (%s)', v_cron_fail, coalesce(v_cron_fail_jobs, '?')); end if;
  if v_push_failed > 0 and v_push_failed::numeric / greatest(v_push_sent + v_push_failed, 1) > 0.3 then
    v_alerts := v_alerts || format('Пуші: %s невдалих із %s', v_push_failed, v_push_sent + v_push_failed);
  end if;
  if v_mono_bad is not null then v_alerts := v_alerts || ('Monobank: ' || v_mono_bad); end if;

  if coalesce(array_length(v_alerts, 1), 0) > 0 and not p_dry_run then
    v_body := array_to_string(v_alerts[1:3], ' · ')
      || case when array_length(v_alerts, 1) > 3 then format(' · ще %s', array_length(v_alerts, 1) - 3) else '' end;
    for u in select ns.user_id from public.notification_settings ns where ns.ops_alerts loop
      perform public.push_send(u.user_id, 'Money Tree: потрібна увага', v_body,
        jsonb_build_object('type', 'ops-alert', 'target', 'service', 'tag', 'ops-alert'));
      v_sent := v_sent + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'alerts', to_jsonb(v_alerts), 'sent', v_sent, 'dry_run', p_dry_run,
    'metrics', jsonb_build_object(
      'db_mb', v_db_mb, 'largest_table', v_big_tbl, 'largest_mb', round(coalesce(v_big_bytes, 0) / 1048576.0, 1),
      'last_snapshot', v_last_snapshot, 'cron_failed_7d', v_cron_fail,
      'push_sent_7d', v_push_sent, 'push_failed_7d', v_push_failed));
end;
$$;


--
-- Name: ping(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ping() RETURNS timestamp with time zone
    LANGUAGE sql STABLE
    AS $$ select now() $$;


--
-- Name: pl_noun(text, bigint, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pl_noun(kind text, n bigint, acc boolean) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select case kind
    when 'expense' then public.pl_ua(n, case when acc then 'витрату' else 'витрата' end, 'витрати', 'витрат')
    when 'income'  then public.pl_ua(n, 'дохід', 'доходи', 'доходів')
    when 'debt'    then public.pl_ua(n, 'борг', 'борги', 'боргів')
    else                public.pl_ua(n, 'запис', 'записи', 'записів')
  end
$$;


--
-- Name: pl_ua(bigint, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pl_ua(n bigint, one text, few text, many text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select case
    when abs(n) % 100 between 11 and 14 then many
    when abs(n) % 10 = 1 then one
    when abs(n) % 10 between 2 and 4 then few
    else many
  end
$$;


--
-- Name: purge_deleted_accounts(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_deleted_accounts(p_days integer DEFAULT 30) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  cutoff timestamptz := now() - make_interval(days => p_days);
  n_unlinked int; n_debts_i int; n_debts_b int; n_hidden_i int; n_hidden_b int; n_inst int; n_bank int;
begin
  update public.expenses set linked_installment_id = null
   where linked_installment_id in (select id from public.installment_accounts where deleted_at is not null and deleted_at < cutoff);
  get diagnostics n_unlinked = row_count;

  delete from public.debts
   where installment_account_id in (select id from public.installment_accounts where deleted_at is not null and deleted_at < cutoff);
  get diagnostics n_debts_i = row_count;
  delete from public.debts
   where bank_account_id in (select id from public.bank_accounts where deleted_at is not null and deleted_at < cutoff);
  get diagnostics n_debts_b = row_count;

  delete from public.hidden_entities
   where entity_type = 'installment'
     and entity_id in (select id from public.installment_accounts where deleted_at is not null and deleted_at < cutoff);
  get diagnostics n_hidden_i = row_count;
  delete from public.hidden_entities
   where entity_type = 'bank'
     and entity_id in (select id from public.bank_accounts where deleted_at is not null and deleted_at < cutoff);
  get diagnostics n_hidden_b = row_count;

  delete from public.installment_accounts where deleted_at is not null and deleted_at < cutoff;
  get diagnostics n_inst = row_count;
  delete from public.bank_accounts where deleted_at is not null and deleted_at < cutoff;
  get diagnostics n_bank = row_count;

  return jsonb_build_object('installments', n_inst, 'banks', n_bank, 'debts', n_debts_i + n_debts_b,
                            'hidden', n_hidden_i + n_hidden_b, 'unlinked_expenses', n_unlinked);
end;
$$;


--
-- Name: purge_deleted_taxonomy(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_deleted_taxonomy(p_days integer DEFAULT 30) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  cutoff timestamptz := now() - make_interval(days => p_days);
  cat_ids uuid[]; sub_ids uuid[];
  n_cat int; n_sub int; n_words int; n_words_own int; skipped_cat int; skipped_sub int;
begin
  select coalesce(array_agg(c.id), '{}') into cat_ids
  from public.categories c
  where c.deleted_at is not null and c.deleted_at < cutoff
    and not exists (select 1 from public.expenses e
                    where e.family_id = c.family_id and e.deleted_at is null and e.category = c.name);

  select count(*) into skipped_cat
  from public.categories c
  where c.deleted_at is not null and c.deleted_at < cutoff and c.id <> all(cat_ids);

  select coalesce(array_agg(s.id), '{}') into sub_ids
  from public.subcategories s
  where s.category_id = any(cat_ids)
     or (s.deleted_at is not null and s.deleted_at < cutoff
         and not exists (select 1 from public.expenses e
                         join public.categories pc on pc.id = s.category_id
                         where e.family_id = s.family_id and e.deleted_at is null
                           and e.category = pc.name and e.subcategory = s.name));

  select count(*) into skipped_sub
  from public.subcategories s
  where s.deleted_at is not null and s.deleted_at < cutoff and s.id <> all(sub_ids);

  delete from public.dictionary where category_id = any(cat_ids) or subcategory_id = any(sub_ids);
  get diagnostics n_words = row_count;

  -- own tombstones of dictionary words
  delete from public.dictionary where deleted_at is not null and deleted_at < cutoff;
  get diagnostics n_words_own = row_count;

  delete from public.subcategories where id = any(sub_ids);
  get diagnostics n_sub = row_count;

  delete from public.categories where id = any(cat_ids);
  get diagnostics n_cat = row_count;

  return jsonb_build_object('categories', n_cat, 'subcategories', n_sub, 'words', n_words,
                            'words_tombstones', n_words_own,
                            'skipped_categories_in_use', skipped_cat, 'skipped_subcategories_in_use', skipped_sub);
end; $$;


--
-- Name: push_actor_title(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.push_actor_title(p_name text, p_gender text, p_act text, p_object text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select case p_gender
    when 'f' then p_name || ' ' || case p_act when 'added' then 'додала' when 'changed' then 'змінила' when 'updated' then 'оновила' else 'видалила' end || ' ' || p_object
    when 'm' then p_name || ' ' || case p_act when 'added' then 'додав'  when 'changed' then 'змінив'  when 'updated' then 'оновив'  else 'видалив'  end || ' ' || p_object
    else          p_name || ': '  || case p_act when 'added' then 'додано' when 'changed' then 'змінено' when 'updated' then 'оновлено' else 'видалено' end || ' ' || p_object
  end
$$;


--
-- Name: push_call_headers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.push_call_headers() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'vault'
    AS $$
  select jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ieWthZ2JjdmpyeXhpYXhxd2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NjA2NjEsImV4cCI6MjEwNTMzNjY2MX0.JDT57OofJ_m2Xq4Vv9sZODTKx54AoKhURYAbg5Bz8qg',
    'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')
  );
$$;


--
-- Name: push_send(uuid, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.push_send(p_user uuid, p_title text, p_body text, p_data jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_type text := coalesce(p_data->>'type', ''); v_pid uuid := gen_random_uuid(); v_data jsonb;
        v_hide boolean := false; v_ptitle text := p_title; v_pbody text := p_body;
begin
  v_data := coalesce(p_data, '{}'::jsonb) || jsonb_build_object('push_id', v_pid::text);
  if v_type <> 'test' and p_title is not null then
    insert into public.user_notifications (user_id, type, title, body, data)
    values (p_user, coalesce(nullif(v_type, ''), 'other'), left(p_title, 200), left(p_body, 400), v_data);
  end if;
  select coalesce(s.hide_details, false) into v_hide from public.notification_settings s where s.user_id = p_user;
  if coalesce(v_hide, false) and v_type in ('mono-inbox', 'other-actor-summary', 'other-actor-deleted', 'installment-deadline') then
    if v_type = 'mono-inbox' and coalesce(v_data->>'tag', '') = 'daily-expense-reminder' then
      v_ptitle := 'Money Tree'; v_pbody := 'У «Вхідних» є нові операції';
    elsif v_type = 'mono-inbox' then
      v_ptitle := 'Monobank'; v_pbody := 'Нова операція';
    elsif v_type = 'installment-deadline' then
      v_ptitle := 'Money Tree'; v_pbody := 'Наближається платіж за ОЧ';
    elsif v_type = 'other-actor-deleted' then
      v_ptitle := 'Money Tree'; v_pbody := 'Є зміни у видалених даних';
    else
      v_ptitle := 'Money Tree'; v_pbody := 'Нові зміни в бюджеті';
    end if;
  end if;
  insert into public.push_sent_log (push_id, user_id, type, tag, batch_ts, seq, series_id)
  values (v_pid, p_user, nullif(v_type, ''), v_data->>'tag', v_data->>'batch_ts',
          nullif(v_data->>'seq', '')::int, nullif(v_data->>'series_id', '')::uuid);
  delete from public.push_sent_log where sent_at < now() - interval '14 days';
  perform net.http_post(
    url := 'https://nbykagbcvjryxiaxqwbk.supabase.co/functions/v1/send-push-notification',
    headers := public.push_call_headers(),
    body := jsonb_build_object('user_id', p_user, 'title', v_ptitle, 'body', v_pbody, 'data', v_data));
end; $$;


--
-- Name: report_push_receipts(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.report_push_receipts(p_items jsonb) RETURNS integer
    LANGUAGE plpgsql
    AS $$
declare n int;
begin
  insert into public.push_receipts (push_id, received_at, shown_at, cold_start, idle_s, app_state)
  select x.push_id, x.received_at, x.shown_at, x.cold_start, x.idle_s, left(x.app_state, 24)
  from jsonb_to_recordset(p_items) as x(push_id uuid, received_at timestamptz, shown_at timestamptz, cold_start boolean, idle_s integer, app_state text)
  where x.push_id is not null and x.received_at is not null
  on conflict (push_id, user_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;


--
-- Name: run_backup_reminder_kyiv(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_backup_reminder_kyiv() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if extract(hour from (now() at time zone 'Europe/Kyiv')) = 10 then
    perform public.notify_backup_reminder();
  end if;
end;
$$;


--
-- Name: run_daily_expense_reminder_kyiv(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_daily_expense_reminder_kyiv() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if extract(hour from (now() at time zone 'Europe/Kyiv')) = 20 then
    perform public.notify_daily_expense_reminder();
  end if;
end;
$$;


--
-- Name: run_debt_deadlines_kyiv(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_debt_deadlines_kyiv() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if extract(hour from (now() at time zone 'Europe/Kyiv')) = 8 then
    perform public.notify_debt_and_installment_deadlines();
  end if;
end;
$$;


--
-- Name: run_test_push_series(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_test_push_series() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare r record; n int := 0;
begin
  for r in select * from public.push_test_series where sent_at is null and due_at <= now() order by due_at, seq limit 20 loop
    update public.push_test_series set sent_at = now() where id = r.id;
    perform public.push_send(r.user_id, 'Тестове сповіщення ' || r.seq || '/' || r.total, 'Серія ' || left(r.series_id::text, 8),
      jsonb_build_object('type', 'test', 'tag', r.tag, 'series_id', r.series_id, 'seq', r.seq));
    n := n + 1;
  end loop;
  if not exists (select 1 from public.push_test_series where sent_at is null) then
    begin perform cron.unschedule('test-push-series'); exception when others then null; end;
  end if;
  return n;
end; $$;


--
-- Name: set_deleted_at_server(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_deleted_at_server() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is not null then new.deleted_at := now(); end if;
  else
    if new.deleted_at is not null then
      if old.deleted_at is null then new.deleted_at := now(); else new.deleted_at := old.deleted_at; end if;
    end if;
  end if;
  return new;
end $$;


--
-- Name: set_updated_at_if_changed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at_if_changed() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  j_old jsonb := to_jsonb(old);
begin
  if (to_jsonb(new) - 'updated_at' - 'updated_by') is not distinct from (j_old - 'updated_at' - 'updated_by') then
    new.updated_at := old.updated_at;
    if j_old ? 'updated_by' then
      new := jsonb_populate_record(new, jsonb_build_object('updated_by', j_old -> 'updated_by'));
    end if;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;


--
-- Name: set_updated_at_now(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at_now() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: set_updated_at_on_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at_on_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end $$;


--
-- Name: start_test_push_series(integer, integer[], text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_test_push_series(p_count integer DEFAULT 6, p_intervals_s integer[] DEFAULT '{60,60,300,600,600}'::integer[], p_tag text DEFAULT 'mono-inbox'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare uid uuid := auth.uid(); sid uuid := gen_random_uuid(); cnt int := greatest(1, least(coalesce(p_count, 6), 10)); due timestamptz := now() + interval '60 seconds'; gap int; i int;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  delete from public.push_test_series where due_at < now() - interval '7 days';
  if exists (select 1 from public.push_test_series where user_id = uid and sent_at is null) then
    raise exception 'series already running' using errcode = 'P0001';
  end if;
  for i in 1..cnt loop
    if i > 1 then
      gap := greatest(60, coalesce(p_intervals_s[i - 1], p_intervals_s[array_length(p_intervals_s, 1)], 60));
      due := due + make_interval(secs => gap);
    end if;
    insert into public.push_test_series (series_id, user_id, seq, total, due_at, tag)
    values (sid, uid, i, cnt, due, coalesce(nullif(p_tag, ''), 'mono-inbox'));
  end loop;
  perform cron.schedule('test-push-series', '* * * * *', 'select public.run_test_push_series()');
  return sid;
end; $$;


--
-- Name: subcategories_late_bind(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.subcategories_late_bind() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.expenses set subcategory_id = new.id where family_id = new.family_id and subcategory = new.name and category_id = new.category_id and subcategory_id is null;
  return new;
end $$;


--
-- Name: subcategories_propagate_rename(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.subcategories_propagate_rename() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.name is distinct from old.name then
    insert into public.taxonomy_aliases(family_id, kind, old_name, target_id) values (new.family_id, 'subcategory', old.name, new.id);
    update public.expenses set subcategory = new.name, updated_by = coalesce(auth.uid(), updated_by) where subcategory_id = new.id and subcategory is distinct from new.name;
  end if;
  return new;
end $$;


--
-- Name: sync_debt_names_on_bank_rename(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_debt_names_on_bank_rename() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.name is distinct from old.name then
    update public.debts set name = new.name where bank_account_id = new.id and name is distinct from new.name;
  end if;
  return new;
end $$;


--
-- Name: sync_debt_names_on_installment_rename(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_debt_names_on_installment_rename() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.name is distinct from old.name then
    update public.debts set name = new.name where installment_account_id = new.id and name is distinct from new.name;
  end if;
  return new;
end $$;


--
-- Name: sync_heads(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_heads() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'tables', jsonb_build_object(
      'bank_accounts',        (select max(updated_at) from public.bank_accounts),
      'categories',           (select max(updated_at) from public.categories),
      'debts',                (select max(updated_at) from public.debts),
      'dictionary',           (select max(updated_at) from public.dictionary),
      'expenses',             (select max(updated_at) from public.expenses),
      'hidden_entities',      (select max(updated_at) from public.hidden_entities),
      'incomes',              (select max(updated_at) from public.incomes),
      'installment_accounts', (select max(updated_at) from public.installment_accounts),
      'subcategories',        (select max(updated_at) from public.subcategories)
    ),
    'members_hash', (select md5(coalesce(string_agg(
        u.id::text || '|' || coalesce(u.display_name,'') || '|' || coalesce(u.push_name,'') || '|' || coalesce(u.gender,''),
        ',' order by u.id), '')) from public.users u),
    'family_hash', (select md5(coalesce(string_agg(
        m.family_id::text || '|' || m.user_id::text, ',' order by m.family_id, m.user_id), '')) from public.family_members m),
    'unread_notifications', (select count(*) from public.user_notifications where read_at is null),
    'mono_new',             (select count(*) from public.mono_inbox where status = 'new'),
    'purged_at',            (select max(purged_at) from public.sync_epochs),
    'server_time', now()
  );
$$;


--
-- Name: trunc_push(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trunc_push(t text, max_len integer DEFAULT 80) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select case when char_length(t) > max_len then left(t, max_len - 1) || '…' else t end
$$;


--
-- Name: verify_push_secret(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_push_secret(p_secret text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'vault'
    AS $$
  select coalesce(p_secret, '') <> ''
     and length(p_secret) >= 32
     and exists (
       select 1 from vault.decrypted_secrets
       where name = 'push_cron_secret' and decrypted_secret = p_secret
     );
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: snapshot_rows; Type: TABLE; Schema: backup; Owner: -
--

CREATE TABLE backup.snapshot_rows (
    snapshot_id bigint NOT NULL,
    table_name text NOT NULL,
    row_count integer NOT NULL,
    data jsonb NOT NULL
);


--
-- Name: snapshots; Type: TABLE; Schema: backup; Owner: -
--

CREATE TABLE backup.snapshots (
    id bigint NOT NULL,
    taken_at timestamp with time zone DEFAULT now() NOT NULL,
    is_weekly boolean DEFAULT false NOT NULL
);


--
-- Name: snapshots_id_seq; Type: SEQUENCE; Schema: backup; Owner: -
--

CREATE SEQUENCE backup.snapshots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: backup; Owner: -
--

ALTER SEQUENCE backup.snapshots_id_seq OWNED BY backup.snapshots.id;


--
-- Name: bank_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    name text NOT NULL,
    credit_limit numeric,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    payment_day integer,
    CONSTRAINT bank_accounts_payment_day_range CHECK (((payment_day IS NULL) OR ((payment_day >= 1) AND (payment_day <= 31))))
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    type text DEFAULT 'Гнучка'::text NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT categories_type_check CHECK ((type = ANY (ARRAY['Обов''язкова'::text, 'Гнучка'::text, 'Скорочувана'::text])))
);


--
-- Name: client_debug_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_debug_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    app_version text,
    scenario text,
    device jsonb,
    events jsonb NOT NULL,
    CONSTRAINT client_debug_logs_events_is_array CHECK (((jsonb_typeof(events) = 'array'::text) AND (jsonb_array_length(events) <= 3000))),
    CONSTRAINT client_debug_logs_events_size CHECK ((pg_column_size(events) <= 600000)),
    CONSTRAINT client_debug_logs_scenario_check CHECK (((scenario IS NULL) OR (char_length(scenario) <= 120)))
);


--
-- Name: debts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.debts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    bank_account_id uuid,
    installment_account_id uuid,
    name text NOT NULL,
    kind public.debt_kind NOT NULL,
    month date NOT NULL,
    balance numeric NOT NULL,
    min_payment numeric,
    min_payment_done boolean,
    monthly_payment numeric,
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dictionary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dictionary (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    keyword text NOT NULL,
    category_id uuid,
    subcategory_id uuid,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_via text,
    CONSTRAINT dictionary_deleted_via_check CHECK (((deleted_via IS NULL) OR (deleted_via = ANY (ARRAY['category'::text, 'subcategory'::text]))))
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    amount integer NOT NULL,
    expense_date date NOT NULL,
    category text,
    subcategory text,
    note text,
    linked_installment_id uuid,
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    source text,
    external_id text,
    edited_at timestamp with time zone,
    category_id uuid,
    subcategory_id uuid,
    CONSTRAINT expenses_amount_check CHECK ((amount >= 0))
);


--
-- Name: families; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.families (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text DEFAULT 'Сімейний бюджет'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: family_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.family_members (
    family_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hidden_entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hidden_entities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    entity_type public.hidden_entity_type NOT NULL,
    entity_id uuid NOT NULL,
    hidden_from_month date NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    deleted_at timestamp with time zone
);


--
-- Name: installment_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.installment_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    name text NOT NULL,
    initial_amount numeric,
    due_day integer,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    term_months integer,
    start_date date,
    first_payment text,
    pay_mode text,
    payment integer,
    CONSTRAINT installment_accounts_due_day_check CHECK (((due_day IS NULL) OR ((due_day >= 1) AND (due_day <= 31)))),
    CONSTRAINT installment_accounts_first_payment_check CHECK (((first_payment IS NULL) OR (first_payment = ANY (ARRAY['same_day'::text, 'next_month'::text])))),
    CONSTRAINT installment_accounts_pay_mode_check CHECK (((pay_mode IS NULL) OR (pay_mode = ANY (ARRAY['auto'::text, 'manual'::text])))),
    CONSTRAINT installment_accounts_payment_check CHECK (((payment IS NULL) OR ((payment >= 1) AND (payment <= 100000000)))),
    CONSTRAINT installment_accounts_term_months_check CHECK (((term_months IS NULL) OR ((term_months >= 1) AND (term_months <= 120))))
);


--
-- Name: hidden_entities_readable; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.hidden_entities_readable WITH (security_invoker='true') AS
 SELECT he.id,
    he.family_id,
    he.entity_type,
    he.entity_id,
    COALESCE(b.name, i.name) AS entity_name,
    he.hidden_from_month,
    he.created_at
   FROM ((public.hidden_entities he
     LEFT JOIN public.bank_accounts b ON (((b.id = he.entity_id) AND (he.entity_type = 'bank'::public.hidden_entity_type))))
     LEFT JOIN public.installment_accounts i ON (((i.id = he.entity_id) AND (he.entity_type = 'installment'::public.hidden_entity_type))))
  ORDER BY he.created_at;


--
-- Name: incomes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incomes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    amount integer NOT NULL,
    income_date date NOT NULL,
    note text,
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT incomes_amount_check CHECK ((amount >= 0))
);


--
-- Name: mono_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mono_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    family_id uuid NOT NULL,
    mono_account_id text NOT NULL,
    masked_pan text,
    account_type text,
    currency_code integer,
    is_jar boolean DEFAULT false NOT NULL,
    tracked boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mono_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mono_connections (
    user_id uuid NOT NULL,
    family_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    token_ciphertext text,
    webhook_token_hash text,
    connected_at timestamp with time zone,
    last_event_at timestamp with time zone,
    last_error text,
    backfill_done boolean DEFAULT false NOT NULL,
    auto_add boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mono_connections_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'disconnected'::text, 'error'::text])))
);


--
-- Name: mono_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mono_events (
    id bigint NOT NULL,
    user_id uuid,
    kind text NOT NULL,
    mono_tx_id text,
    result text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mono_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mono_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mono_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mono_events_id_seq OWNED BY public.mono_events.id;


--
-- Name: mono_inbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mono_inbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    family_id uuid NOT NULL,
    mono_tx_id text NOT NULL,
    mono_account_id text NOT NULL,
    tx_time timestamp with time zone NOT NULL,
    description text,
    comment text,
    mcc integer,
    original_mcc integer,
    hold boolean DEFAULT false NOT NULL,
    amount_minor bigint NOT NULL,
    operation_amount_minor bigint,
    currency_code integer,
    commission_minor bigint,
    cashback_minor bigint,
    balance_minor bigint,
    amount_uah integer,
    status text DEFAULT 'new'::text NOT NULL,
    skip_reason text,
    suggested_category text,
    suggested_subcategory text,
    expense_id uuid,
    source text DEFAULT 'webhook'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    notified_at timestamp with time zone,
    suggested_installment_id uuid,
    CONSTRAINT mono_inbox_source_check CHECK ((source = ANY (ARRAY['webhook'::text, 'backfill'::text]))),
    CONSTRAINT mono_inbox_status_check CHECK ((status = ANY (ARRAY['new'::text, 'added'::text, 'ignored'::text, 'skipped'::text, 'refunded'::text])))
);


--
-- Name: mono_mcc_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mono_mcc_rules (
    family_id uuid NOT NULL,
    mcc integer NOT NULL,
    category text NOT NULL,
    subcategory text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notification_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_settings (
    user_id uuid NOT NULL,
    family_id uuid NOT NULL,
    other_actor_changes boolean DEFAULT true NOT NULL,
    other_actor_deletions boolean DEFAULT true NOT NULL,
    daily_reminder boolean DEFAULT true NOT NULL,
    installment_deadline boolean DEFAULT true NOT NULL,
    installment_days smallint DEFAULT 2 NOT NULL,
    month_start boolean DEFAULT true NOT NULL,
    weekly_summary boolean DEFAULT false NOT NULL,
    month_end boolean DEFAULT false NOT NULL,
    quiet_enabled boolean DEFAULT false NOT NULL,
    quiet_start time without time zone DEFAULT '22:00:00'::time without time zone NOT NULL,
    quiet_end time without time zone DEFAULT '07:00:00'::time without time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    notifications_enabled boolean DEFAULT true NOT NULL,
    backup_reminder boolean DEFAULT true NOT NULL,
    last_backup_at timestamp with time zone,
    mono_inbox boolean DEFAULT true NOT NULL,
    ops_alerts boolean DEFAULT false NOT NULL,
    hide_details boolean DEFAULT false NOT NULL,
    CONSTRAINT notification_settings_installment_days_check CHECK (((installment_days >= 1) AND (installment_days <= 3)))
);


--
-- Name: notification_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_state (
    user_id uuid NOT NULL,
    job_name text NOT NULL,
    last_run_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: push_cron_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_cron_state (
    job_name text NOT NULL,
    last_run_at timestamp with time zone NOT NULL
);


--
-- Name: push_delivery_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_delivery_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text,
    title text,
    urgency text,
    ttl_s integer,
    subscriptions integer DEFAULT 0 NOT NULL,
    sent integer DEFAULT 0 NOT NULL,
    failed integer DEFAULT 0 NOT NULL,
    statuses jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: push_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_receipts (
    id bigint NOT NULL,
    push_id uuid NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    received_at timestamp with time zone NOT NULL,
    shown_at timestamp with time zone,
    reported_at timestamp with time zone DEFAULT now() NOT NULL,
    cold_start boolean,
    idle_s integer,
    app_state text
);


--
-- Name: push_sent_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_sent_log (
    id bigint NOT NULL,
    push_id uuid NOT NULL,
    user_id uuid,
    type text,
    tag text,
    batch_ts text,
    seq integer,
    series_id uuid,
    sent_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: push_latency; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.push_latency AS
 SELECT s.push_id,
    s.type,
    s.user_id,
    s.sent_at,
    r.received_at,
    r.shown_at,
    r.cold_start,
    r.idle_s,
    r.app_state,
    (EXTRACT(epoch FROM (r.received_at - s.sent_at)))::integer AS received_lag_s,
    (EXTRACT(epoch FROM (r.shown_at - s.sent_at)))::integer AS shown_lag_s
   FROM (public.push_sent_log s
     JOIN public.push_receipts r ON (((r.push_id = s.push_id) AND (r.user_id = s.user_id))));


--
-- Name: push_receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.push_receipts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.push_receipts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: push_sent_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.push_sent_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.push_sent_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    family_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: push_test_series; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_test_series (
    id bigint NOT NULL,
    series_id uuid NOT NULL,
    user_id uuid NOT NULL,
    seq integer NOT NULL,
    total integer NOT NULL,
    due_at timestamp with time zone NOT NULL,
    sent_at timestamp with time zone,
    tag text DEFAULT 'mono-inbox'::text NOT NULL
);


--
-- Name: push_test_series_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.push_test_series ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.push_test_series_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: subcategories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subcategories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    category_id uuid NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deactivated_via text,
    deleted_at timestamp with time zone,
    CONSTRAINT subcategories_deactivated_via_check CHECK (((deactivated_via IS NULL) OR (deactivated_via = 'category'::text)))
);


--
-- Name: subcategory_priority; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subcategory_priority (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    subcategory_id uuid NOT NULL,
    label text,
    score numeric,
    color text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sync_epochs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_epochs (
    family_id uuid NOT NULL,
    purged_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: taxonomy_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.taxonomy_aliases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    kind text NOT NULL,
    old_name text NOT NULL,
    target_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT taxonomy_aliases_kind_check CHECK ((kind = ANY (ARRAY['category'::text, 'subcategory'::text])))
);


--
-- Name: user_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    display_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    push_name text,
    gender text,
    CONSTRAINT users_gender_check CHECK (((gender IS NULL) OR (gender = ANY (ARRAY['f'::text, 'm'::text]))))
);


--
-- Name: snapshots id; Type: DEFAULT; Schema: backup; Owner: -
--

ALTER TABLE ONLY backup.snapshots ALTER COLUMN id SET DEFAULT nextval('backup.snapshots_id_seq'::regclass);


--
-- Name: mono_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mono_events ALTER COLUMN id SET DEFAULT nextval('public.mono_events_id_seq'::regclass);


--
-- Name: snapshot_rows snapshot_rows_pkey; Type: CONSTRAINT; Schema: backup; Owner: -
--

ALTER TABLE ONLY backup.snapshot_rows
    ADD CONSTRAINT snapshot_rows_pkey PRIMARY KEY (snapshot_id, table_name);


--
-- Name: snapshots snapshots_pkey; Type: CONSTRAINT; Schema: backup; Owner: -
--

ALTER TABLE ONLY backup.snapshots
    ADD CONSTRAINT snapshots_pkey PRIMARY KEY (id);


--
-- Name: bank_accounts bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: client_debug_logs client_debug_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_debug_logs
    ADD CONSTRAINT client_debug_logs_pkey PRIMARY KEY (id);


--
-- Name: debts debts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_pkey PRIMARY KEY (id);


--
-- Name: dictionary dictionary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dictionary
    ADD CONSTRAINT dictionary_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: families families_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.families
    ADD CONSTRAINT families_pkey PRIMARY KEY (id);


--
-- Name: family_members family_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_members
    ADD CONSTRAINT family_members_pkey PRIMARY KEY (family_id, user_id);


--
-- Name: hidden_entities hidden_entities_family_id_entity_type_entity_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hidden_entities
    ADD CONSTRAINT hidden_entities_family_id_entity_type_entity_id_key UNIQUE (family_id, entity_type, entity_id);


--
-- Name: hidden_entities hidden_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hidden_entities
    ADD CONSTRAINT hidden_entities_pkey PRIMARY KEY (id);


--
-- Name: incomes incomes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incomes
    ADD CONSTRAINT incomes_pkey PRIMARY KEY (id);


--
-- Name: installment_accounts installment_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installment_accounts
    ADD CONSTRAINT installment_accounts_pkey PRIMARY KEY (id);


--
-- Name: mono_accounts mono_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mono_accounts
    ADD CONSTRAINT mono_accounts_pkey PRIMARY KEY (id);


--
-- Name: mono_accounts mono_accounts_user_id_mono_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mono_accounts
    ADD CONSTRAINT mono_accounts_user_id_mono_account_id_key UNIQUE (user_id, mono_account_id);


--
-- Name: mono_connections mono_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mono_connections
    ADD CONSTRAINT mono_connections_pkey PRIMARY KEY (user_id);


--
-- Name: mono_connections mono_connections_webhook_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mono_connections
    ADD CONSTRAINT mono_connections_webhook_token_hash_key UNIQUE (webhook_token_hash);


--
-- Name: mono_events mono_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mono_events
    ADD CONSTRAINT mono_events_pkey PRIMARY KEY (id);


--
-- Name: mono_inbox mono_inbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mono_inbox
    ADD CONSTRAINT mono_inbox_pkey PRIMARY KEY (id);


--
-- Name: mono_inbox mono_inbox_user_id_mono_tx_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mono_inbox
    ADD CONSTRAINT mono_inbox_user_id_mono_tx_id_key UNIQUE (user_id, mono_tx_id);


--
-- Name: mono_mcc_rules mono_mcc_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mono_mcc_rules
    ADD CONSTRAINT mono_mcc_rules_pkey PRIMARY KEY (family_id, mcc);


--
-- Name: notification_settings notification_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_pkey PRIMARY KEY (user_id);


--
-- Name: notification_state notification_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_state
    ADD CONSTRAINT notification_state_pkey PRIMARY KEY (user_id, job_name);


--
-- Name: push_cron_state push_cron_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_cron_state
    ADD CONSTRAINT push_cron_state_pkey PRIMARY KEY (job_name);


--
-- Name: push_delivery_log push_delivery_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_delivery_log
    ADD CONSTRAINT push_delivery_log_pkey PRIMARY KEY (id);


--
-- Name: push_receipts push_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_receipts
    ADD CONSTRAINT push_receipts_pkey PRIMARY KEY (id);


--
-- Name: push_receipts push_receipts_push_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_receipts
    ADD CONSTRAINT push_receipts_push_id_user_id_key UNIQUE (push_id, user_id);


--
-- Name: push_sent_log push_sent_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_sent_log
    ADD CONSTRAINT push_sent_log_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: push_test_series push_test_series_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_test_series
    ADD CONSTRAINT push_test_series_pkey PRIMARY KEY (id);


--
-- Name: subcategories subcategories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategories
    ADD CONSTRAINT subcategories_pkey PRIMARY KEY (id);


--
-- Name: subcategory_priority subcategory_priority_family_id_subcategory_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategory_priority
    ADD CONSTRAINT subcategory_priority_family_id_subcategory_id_key UNIQUE (family_id, subcategory_id);


--
-- Name: subcategory_priority subcategory_priority_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategory_priority
    ADD CONSTRAINT subcategory_priority_pkey PRIMARY KEY (id);


--
-- Name: sync_epochs sync_epochs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_epochs
    ADD CONSTRAINT sync_epochs_pkey PRIMARY KEY (family_id);


--
-- Name: taxonomy_aliases taxonomy_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_aliases
    ADD CONSTRAINT taxonomy_aliases_pkey PRIMARY KEY (id);


--
-- Name: user_notifications user_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT user_notifications_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: bank_accounts_family_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bank_accounts_family_updated_idx ON public.bank_accounts USING btree (family_id, updated_at);


--
-- Name: categories_family_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX categories_family_updated_idx ON public.categories USING btree (family_id, updated_at);


--
-- Name: client_debug_logs_family_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX client_debug_logs_family_created_idx ON public.client_debug_logs USING btree (family_id, created_at DESC);


--
-- Name: client_debug_logs_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX client_debug_logs_user_idx ON public.client_debug_logs USING btree (user_id);


--
-- Name: debts_card_month_live_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX debts_card_month_live_uniq ON public.debts USING btree (family_id, bank_account_id, month) WHERE ((deleted_at IS NULL) AND (bank_account_id IS NOT NULL));


--
-- Name: debts_family_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX debts_family_updated_idx ON public.debts USING btree (family_id, updated_at);


--
-- Name: debts_installment_month_live_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX debts_installment_month_live_uniq ON public.debts USING btree (family_id, installment_account_id, month) WHERE ((deleted_at IS NULL) AND (installment_account_id IS NOT NULL));


--
-- Name: dictionary_family_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dictionary_family_updated_idx ON public.dictionary USING btree (family_id, updated_at);


--
-- Name: dictionary_live_keyword_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX dictionary_live_keyword_uniq ON public.dictionary USING btree (family_id, lower(keyword)) WHERE (deleted_at IS NULL);


--
-- Name: expenses_family_external_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX expenses_family_external_uniq ON public.expenses USING btree (family_id, external_id) WHERE (external_id IS NOT NULL);


--
-- Name: expenses_family_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_family_updated_idx ON public.expenses USING btree (family_id, updated_at);


--
-- Name: hidden_entities_family_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hidden_entities_family_updated_idx ON public.hidden_entities USING btree (family_id, updated_at);


--
-- Name: incomes_family_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX incomes_family_updated_idx ON public.incomes USING btree (family_id, updated_at);


--
-- Name: installment_accounts_family_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX installment_accounts_family_updated_idx ON public.installment_accounts USING btree (family_id, updated_at);


--
-- Name: mono_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mono_events_created_idx ON public.mono_events USING btree (created_at);


--
-- Name: mono_inbox_unnotified_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mono_inbox_unnotified_idx ON public.mono_inbox USING btree (user_id) WHERE ((status = 'new'::text) AND (notified_at IS NULL));


--
-- Name: mono_inbox_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mono_inbox_user_status_idx ON public.mono_inbox USING btree (user_id, status, tx_time DESC);


--
-- Name: notification_settings_family_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_settings_family_idx ON public.notification_settings USING btree (family_id);


--
-- Name: push_delivery_log_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX push_delivery_log_user_created_idx ON public.push_delivery_log USING btree (user_id, created_at DESC);


--
-- Name: push_sent_log_sent_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX push_sent_log_sent_at_idx ON public.push_sent_log USING btree (sent_at);


--
-- Name: subcategories_family_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subcategories_family_updated_idx ON public.subcategories USING btree (family_id, updated_at);


--
-- Name: taxonomy_aliases_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX taxonomy_aliases_lookup ON public.taxonomy_aliases USING btree (family_id, kind, old_name);


--
-- Name: user_notifications_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_notifications_unread_idx ON public.user_notifications USING btree (user_id) WHERE (read_at IS NULL);


--
-- Name: user_notifications_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_notifications_user_idx ON public.user_notifications USING btree (user_id, created_at DESC);


--
-- Name: categories trg_categories_late_bind; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_categories_late_bind AFTER INSERT ON public.categories FOR EACH ROW EXECUTE FUNCTION public.categories_late_bind();


--
-- Name: categories trg_categories_propagate_rename; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_categories_propagate_rename AFTER UPDATE OF name ON public.categories FOR EACH ROW EXECUTE FUNCTION public.categories_propagate_rename();


--
-- Name: bank_accounts trg_deleted_at_server; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_deleted_at_server BEFORE INSERT OR UPDATE OF deleted_at ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.set_deleted_at_server();


--
-- Name: categories trg_deleted_at_server; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_deleted_at_server BEFORE INSERT OR UPDATE OF deleted_at ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_deleted_at_server();


--
-- Name: debts trg_deleted_at_server; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_deleted_at_server BEFORE INSERT OR UPDATE OF deleted_at ON public.debts FOR EACH ROW EXECUTE FUNCTION public.set_deleted_at_server();


--
-- Name: dictionary trg_deleted_at_server; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_deleted_at_server BEFORE INSERT OR UPDATE OF deleted_at ON public.dictionary FOR EACH ROW EXECUTE FUNCTION public.set_deleted_at_server();


--
-- Name: expenses trg_deleted_at_server; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_deleted_at_server BEFORE INSERT OR UPDATE OF deleted_at ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_deleted_at_server();


--
-- Name: hidden_entities trg_deleted_at_server; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_deleted_at_server BEFORE INSERT OR UPDATE OF deleted_at ON public.hidden_entities FOR EACH ROW EXECUTE FUNCTION public.set_deleted_at_server();


--
-- Name: incomes trg_deleted_at_server; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_deleted_at_server BEFORE INSERT OR UPDATE OF deleted_at ON public.incomes FOR EACH ROW EXECUTE FUNCTION public.set_deleted_at_server();


--
-- Name: installment_accounts trg_deleted_at_server; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_deleted_at_server BEFORE INSERT OR UPDATE OF deleted_at ON public.installment_accounts FOR EACH ROW EXECUTE FUNCTION public.set_deleted_at_server();


--
-- Name: subcategories trg_deleted_at_server; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_deleted_at_server BEFORE INSERT OR UPDATE OF deleted_at ON public.subcategories FOR EACH ROW EXECUTE FUNCTION public.set_deleted_at_server();


--
-- Name: expenses trg_expenses_resolve_refs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_expenses_resolve_refs BEFORE INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.expenses_resolve_refs();


--
-- Name: expenses trg_mono_expense_sync_del; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mono_expense_sync_del AFTER DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.mono_expense_sync();


--
-- Name: expenses trg_mono_expense_sync_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mono_expense_sync_upd AFTER UPDATE OF deleted_at ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.mono_expense_sync();


--
-- Name: mono_inbox trg_mono_inbox_autoread; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mono_inbox_autoread AFTER UPDATE OF status ON public.mono_inbox FOR EACH ROW EXECUTE FUNCTION public.mono_inbox_autoread();


--
-- Name: bank_accounts trg_purge_epoch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purge_epoch AFTER DELETE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.bump_purge_epoch();


--
-- Name: categories trg_purge_epoch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purge_epoch AFTER DELETE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.bump_purge_epoch();


--
-- Name: debts trg_purge_epoch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purge_epoch AFTER DELETE ON public.debts FOR EACH ROW EXECUTE FUNCTION public.bump_purge_epoch();


--
-- Name: dictionary trg_purge_epoch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purge_epoch AFTER DELETE ON public.dictionary FOR EACH ROW EXECUTE FUNCTION public.bump_purge_epoch();


--
-- Name: expenses trg_purge_epoch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purge_epoch AFTER DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.bump_purge_epoch();


--
-- Name: hidden_entities trg_purge_epoch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purge_epoch AFTER DELETE ON public.hidden_entities FOR EACH ROW EXECUTE FUNCTION public.bump_purge_epoch();


--
-- Name: incomes trg_purge_epoch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purge_epoch AFTER DELETE ON public.incomes FOR EACH ROW EXECUTE FUNCTION public.bump_purge_epoch();


--
-- Name: installment_accounts trg_purge_epoch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purge_epoch AFTER DELETE ON public.installment_accounts FOR EACH ROW EXECUTE FUNCTION public.bump_purge_epoch();


--
-- Name: subcategories trg_purge_epoch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purge_epoch AFTER DELETE ON public.subcategories FOR EACH ROW EXECUTE FUNCTION public.bump_purge_epoch();


--
-- Name: bank_accounts trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_if_changed();


--
-- Name: categories trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_if_changed();


--
-- Name: debts trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.debts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_if_changed();


--
-- Name: dictionary trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.dictionary FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_if_changed();


--
-- Name: expenses trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_if_changed();


--
-- Name: hidden_entities trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.hidden_entities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_if_changed();


--
-- Name: incomes trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.incomes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_if_changed();


--
-- Name: installment_accounts trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.installment_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_if_changed();


--
-- Name: mono_accounts trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.mono_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_if_changed();


--
-- Name: mono_connections trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.mono_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_if_changed();


--
-- Name: notification_settings trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.notification_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_if_changed();


--
-- Name: subcategories trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.subcategories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_if_changed();


--
-- Name: subcategory_priority trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.subcategory_priority FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


--
-- Name: bank_accounts trg_set_updated_at_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at_insert BEFORE INSERT ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_on_insert();


--
-- Name: categories trg_set_updated_at_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at_insert BEFORE INSERT ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_on_insert();


--
-- Name: debts trg_set_updated_at_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at_insert BEFORE INSERT ON public.debts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_on_insert();


--
-- Name: dictionary trg_set_updated_at_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at_insert BEFORE INSERT ON public.dictionary FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_on_insert();


--
-- Name: expenses trg_set_updated_at_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at_insert BEFORE INSERT ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_on_insert();


--
-- Name: hidden_entities trg_set_updated_at_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at_insert BEFORE INSERT ON public.hidden_entities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_on_insert();


--
-- Name: incomes trg_set_updated_at_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at_insert BEFORE INSERT ON public.incomes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_on_insert();


--
-- Name: installment_accounts trg_set_updated_at_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at_insert BEFORE INSERT ON public.installment_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_on_insert();


--
-- Name: subcategories trg_set_updated_at_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at_insert BEFORE INSERT ON public.subcategories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_on_insert();


--
-- Name: subcategories trg_subcategories_late_bind; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_subcategories_late_bind AFTER INSERT ON public.subcategories FOR EACH ROW EXECUTE FUNCTION public.subcategories_late_bind();


--
-- Name: subcategories trg_subcategories_propagate_rename; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_subcategories_propagate_rename AFTER UPDATE OF name ON public.subcategories FOR EACH ROW EXECUTE FUNCTION public.subcategories_propagate_rename();


--
-- Name: installment_accounts trg_sync_debt_names; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_debt_names AFTER UPDATE OF name ON public.installment_accounts FOR EACH ROW EXECUTE FUNCTION public.sync_debt_names_on_installment_rename();


--
-- Name: bank_accounts trg_sync_debt_names_bank; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_debt_names_bank AFTER UPDATE OF name ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.sync_debt_names_on_bank_rename();


--
-- Name: snapshot_rows snapshot_rows_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: backup; Owner: -
--

ALTER TABLE ONLY backup.snapshot_rows
    ADD CONSTRAINT snapshot_rows_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES backup.snapshots(id) ON DELETE CASCADE;


--
-- Name: bank_accounts bank_accounts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: bank_accounts bank_accounts_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;


--
-- Name: bank_accounts bank_accounts_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: categories categories_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: categories categories_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;


--
-- Name: categories categories_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: client_debug_logs client_debug_logs_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_debug_logs
    ADD CONSTRAINT client_debug_logs_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;


--
-- Name: client_debug_logs client_debug_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_debug_logs
    ADD CONSTRAINT client_debug_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: debts debts_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id);


--
-- Name: debts debts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: debts debts_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;


--
-- Name: debts debts_installment_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_installment_account_id_fkey FOREIGN KEY (installment_account_id) REFERENCES public.installment_accounts(id);


--
-- Name: debts debts_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: dictionary dictionary_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dictionary
    ADD CONSTRAINT dictionary_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: dictionary dictionary_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dictionary
    ADD CONSTRAINT dictionary_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: dictionary dictionary_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dictionary
    ADD CONSTRAINT dictionary_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;


--
-- Name: dictionary dictionary_subcategory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dictionary
    ADD CONSTRAINT dictionary_subcategory_id_fkey FOREIGN KEY (subcategory_id) REFERENCES public.subcategories(id);


--
-- Name: dictionary dictionary_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dictionary
    ADD CONSTRAINT dictionary_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: expenses expenses_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: expenses expenses_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;


--
-- Name: expenses expenses_linked_installment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_linked_installment_id_fkey FOREIGN KEY (linked_installment_id) REFERENCES public.installment_accounts(id);


--
-- Name: expenses expenses_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: family_members family_members_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_members
    ADD CONSTRAINT family_members_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;


--
-- Name: family_members family_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_members
    ADD CONSTRAINT family_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: hidden_entities hidden_entities_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hidden_entities
    ADD CONSTRAINT hidden_entities_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: hidden_entities hidden_entities_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hidden_entities
    ADD CONSTRAINT hidden_entities_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;


--
-- Name: hidden_entities hidden_entities_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hidden_entities
    ADD CONSTRAINT hidden_entities_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: incomes incomes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incomes
    ADD CONSTRAINT incomes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: incomes incomes_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incomes
    ADD CONSTRAINT incomes_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;


--
-- Name: incomes incomes_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incomes
    ADD CONSTRAINT incomes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: installment_accounts installment_accounts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installment_accounts
    ADD CONSTRAINT installment_accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: installment_accounts installment_accounts_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installment_accounts
    ADD CONSTRAINT installment_accounts_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;


--
-- Name: installment_accounts installment_accounts_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installment_accounts
    ADD CONSTRAINT installment_accounts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: mono_accounts mono_accounts_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mono_accounts
    ADD CONSTRAINT mono_accounts_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;


--
-- Name: mono_accounts mono_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mono_accounts
    ADD CONSTRAINT mono_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: mono_connections mono_connections_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mono_connections
    ADD CONSTRAINT mono_connections_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;


--
-- Name: mono_connections mono_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mono_connections
    ADD CONSTRAINT mono_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: mono_inbox mono_inbox_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mono_inbox
    ADD CONSTRAINT mono_inbox_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;


--
-- Name: mono_inbox mono_inbox_suggested_installment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mono_inbox
    ADD CONSTRAINT mono_inbox_suggested_installment_id_fkey FOREIGN KEY (suggested_installment_id) REFERENCES public.installment_accounts(id) ON DELETE SET NULL;


--
-- Name: mono_inbox mono_inbox_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mono_inbox
    ADD CONSTRAINT mono_inbox_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: mono_mcc_rules mono_mcc_rules_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mono_mcc_rules
    ADD CONSTRAINT mono_mcc_rules_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;


--
-- Name: notification_settings notification_settings_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;


--
-- Name: notification_settings notification_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notification_state notification_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_state
    ADD CONSTRAINT notification_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: push_delivery_log push_delivery_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_delivery_log
    ADD CONSTRAINT push_delivery_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: subcategories subcategories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategories
    ADD CONSTRAINT subcategories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: subcategories subcategories_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategories
    ADD CONSTRAINT subcategories_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: subcategories subcategories_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategories
    ADD CONSTRAINT subcategories_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;


--
-- Name: subcategories subcategories_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategories
    ADD CONSTRAINT subcategories_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: subcategory_priority subcategory_priority_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategory_priority
    ADD CONSTRAINT subcategory_priority_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;


--
-- Name: subcategory_priority subcategory_priority_subcategory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategory_priority
    ADD CONSTRAINT subcategory_priority_subcategory_id_fkey FOREIGN KEY (subcategory_id) REFERENCES public.subcategories(id) ON DELETE CASCADE;


--
-- Name: user_notifications user_notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT user_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: snapshot_rows; Type: ROW SECURITY; Schema: backup; Owner: -
--

ALTER TABLE backup.snapshot_rows ENABLE ROW LEVEL SECURITY;

--
-- Name: snapshots; Type: ROW SECURITY; Schema: backup; Owner: -
--

ALTER TABLE backup.snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: bank_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: client_debug_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_debug_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: client_debug_logs client_debug_logs_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_debug_logs_delete_own ON public.client_debug_logs FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: client_debug_logs client_debug_logs_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_debug_logs_insert_own ON public.client_debug_logs FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (family_id IN ( SELECT f.family_id
   FROM public.auth_family_ids() f(family_id)))));


--
-- Name: client_debug_logs client_debug_logs_select_family; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_debug_logs_select_family ON public.client_debug_logs FOR SELECT TO authenticated USING ((family_id IN ( SELECT f.family_id
   FROM public.auth_family_ids() f(family_id))));


--
-- Name: debts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

--
-- Name: dictionary; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dictionary ENABLE ROW LEVEL SECURITY;

--
-- Name: expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: families; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

--
-- Name: bank_accounts family members full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "family members full access" ON public.bank_accounts USING ((family_id IN ( SELECT auth_family_ids.family_id
   FROM public.auth_family_ids() auth_family_ids(family_id)))) WITH CHECK ((family_id IN ( SELECT auth_family_ids.family_id
   FROM public.auth_family_ids() auth_family_ids(family_id))));


--
-- Name: categories family members full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "family members full access" ON public.categories USING ((family_id IN ( SELECT auth_family_ids.family_id
   FROM public.auth_family_ids() auth_family_ids(family_id)))) WITH CHECK ((family_id IN ( SELECT auth_family_ids.family_id
   FROM public.auth_family_ids() auth_family_ids(family_id))));


--
-- Name: debts family members full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "family members full access" ON public.debts USING ((family_id IN ( SELECT auth_family_ids.family_id
   FROM public.auth_family_ids() auth_family_ids(family_id)))) WITH CHECK ((family_id IN ( SELECT auth_family_ids.family_id
   FROM public.auth_family_ids() auth_family_ids(family_id))));


--
-- Name: dictionary family members full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "family members full access" ON public.dictionary USING ((family_id IN ( SELECT auth_family_ids.family_id
   FROM public.auth_family_ids() auth_family_ids(family_id)))) WITH CHECK ((family_id IN ( SELECT auth_family_ids.family_id
   FROM public.auth_family_ids() auth_family_ids(family_id))));


--
-- Name: expenses family members full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "family members full access" ON public.expenses USING ((family_id IN ( SELECT auth_family_ids.family_id
   FROM public.auth_family_ids() auth_family_ids(family_id)))) WITH CHECK ((family_id IN ( SELECT auth_family_ids.family_id
   FROM public.auth_family_ids() auth_family_ids(family_id))));


--
-- Name: hidden_entities family members full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "family members full access" ON public.hidden_entities USING ((family_id IN ( SELECT auth_family_ids.family_id
   FROM public.auth_family_ids() auth_family_ids(family_id)))) WITH CHECK ((family_id IN ( SELECT auth_family_ids.family_id
   FROM public.auth_family_ids() auth_family_ids(family_id))));


--
-- Name: incomes family members full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "family members full access" ON public.incomes USING ((family_id IN ( SELECT auth_family_ids.family_id
   FROM public.auth_family_ids() auth_family_ids(family_id)))) WITH CHECK ((family_id IN ( SELECT auth_family_ids.family_id
   FROM public.auth_family_ids() auth_family_ids(family_id))));


--
-- Name: installment_accounts family members full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "family members full access" ON public.installment_accounts USING ((family_id IN ( SELECT auth_family_ids.family_id
   FROM public.auth_family_ids() auth_family_ids(family_id)))) WITH CHECK ((family_id IN ( SELECT auth_family_ids.family_id
   FROM public.auth_family_ids() auth_family_ids(family_id))));


--
-- Name: subcategories family members full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "family members full access" ON public.subcategories USING ((family_id IN ( SELECT auth_family_ids.family_id
   FROM public.auth_family_ids() auth_family_ids(family_id)))) WITH CHECK ((family_id IN ( SELECT auth_family_ids.family_id
   FROM public.auth_family_ids() auth_family_ids(family_id))));


--
-- Name: subcategory_priority family members full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "family members full access" ON public.subcategory_priority USING ((family_id IN ( SELECT auth_family_ids.family_id
   FROM public.auth_family_ids() auth_family_ids(family_id)))) WITH CHECK ((family_id IN ( SELECT auth_family_ids.family_id
   FROM public.auth_family_ids() auth_family_ids(family_id))));


--
-- Name: sync_epochs family members read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "family members read" ON public.sync_epochs FOR SELECT TO authenticated USING ((family_id IN ( SELECT auth_family_ids.family_id
   FROM public.auth_family_ids() auth_family_ids(family_id))));


--
-- Name: family_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

--
-- Name: hidden_entities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hidden_entities ENABLE ROW LEVEL SECURITY;

--
-- Name: incomes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;

--
-- Name: installment_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.installment_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: users members can view family users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members can view family users" ON public.users FOR SELECT USING (((id = auth.uid()) OR (id IN ( SELECT fm.user_id
   FROM public.family_members fm
  WHERE (fm.family_id IN ( SELECT auth_family_ids.family_id
           FROM public.auth_family_ids() auth_family_ids(family_id)))))));


--
-- Name: families members can view own family; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members can view own family" ON public.families FOR SELECT USING ((id IN ( SELECT auth_family_ids.family_id
   FROM public.auth_family_ids() auth_family_ids(family_id))));


--
-- Name: family_members members can view own membership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members can view own membership" ON public.family_members FOR SELECT USING ((family_id IN ( SELECT auth_family_ids.family_id
   FROM public.auth_family_ids() auth_family_ids(family_id))));


--
-- Name: mono_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mono_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: mono_accounts mono_accounts_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mono_accounts_select_own ON public.mono_accounts FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: mono_accounts mono_accounts_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mono_accounts_update_own ON public.mono_accounts FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: mono_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mono_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: mono_connections mono_connections_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mono_connections_select_own ON public.mono_connections FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: mono_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mono_events ENABLE ROW LEVEL SECURITY;

--
-- Name: mono_inbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mono_inbox ENABLE ROW LEVEL SECURITY;

--
-- Name: mono_inbox mono_inbox_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mono_inbox_select_own ON public.mono_inbox FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: mono_mcc_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mono_mcc_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: mono_mcc_rules mono_mcc_rules_select_family; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mono_mcc_rules_select_family ON public.mono_mcc_rules FOR SELECT TO authenticated USING ((family_id IN ( SELECT f.family_id
   FROM public.auth_family_ids() f(family_id))));


--
-- Name: notification_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_settings notification_settings_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_settings_insert_own ON public.notification_settings FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (family_id IN ( SELECT f.family_id
   FROM public.auth_family_ids() f(family_id)))));


--
-- Name: notification_settings notification_settings_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_settings_select_own ON public.notification_settings FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notification_settings notification_settings_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_settings_update_own ON public.notification_settings FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (family_id IN ( SELECT f.family_id
   FROM public.auth_family_ids() f(family_id)))));


--
-- Name: notification_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_state ENABLE ROW LEVEL SECURITY;

--
-- Name: push_cron_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_cron_state ENABLE ROW LEVEL SECURITY;

--
-- Name: push_delivery_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_delivery_log ENABLE ROW LEVEL SECURITY;

--
-- Name: push_delivery_log push_delivery_log_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY push_delivery_log_select_own ON public.push_delivery_log FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: push_receipts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_receipts ENABLE ROW LEVEL SECURITY;

--
-- Name: push_receipts push_receipts_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY push_receipts_insert_own ON public.push_receipts FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: push_sent_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_sent_log ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions push_subscriptions_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY push_subscriptions_delete_own ON public.push_subscriptions FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: push_subscriptions push_subscriptions_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY push_subscriptions_insert_own ON public.push_subscriptions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: push_subscriptions push_subscriptions_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY push_subscriptions_select_own ON public.push_subscriptions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: push_subscriptions push_subscriptions_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY push_subscriptions_update_own ON public.push_subscriptions FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: push_test_series; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_test_series ENABLE ROW LEVEL SECURITY;

--
-- Name: subcategories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;

--
-- Name: subcategory_priority; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subcategory_priority ENABLE ROW LEVEL SECURITY;

--
-- Name: sync_epochs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sync_epochs ENABLE ROW LEVEL SECURITY;

--
-- Name: taxonomy_aliases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.taxonomy_aliases ENABLE ROW LEVEL SECURITY;

--
-- Name: user_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: user_notifications user_notifications_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_notifications_select_own ON public.user_notifications FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users can update own profile" ON public.users FOR UPDATE USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION restore_rows(p_snapshot_id bigint, p_table text, p_ids uuid[]); Type: ACL; Schema: backup; Owner: -
--

REVOKE ALL ON FUNCTION backup.restore_rows(p_snapshot_id bigint, p_table text, p_ids uuid[]) FROM PUBLIC;


--
-- Name: FUNCTION take_snapshot(); Type: ACL; Schema: backup; Owner: -
--

REVOKE ALL ON FUNCTION backup.take_snapshot() FROM PUBLIC;


--
-- Name: FUNCTION auth_family_ids(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.auth_family_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.auth_family_ids() TO authenticated;
GRANT ALL ON FUNCTION public.auth_family_ids() TO service_role;


--
-- Name: FUNCTION build_backup_reminder(p_today date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.build_backup_reminder(p_today date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.build_backup_reminder(p_today date) TO service_role;


--
-- Name: FUNCTION build_daily_reminder(p_today date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.build_daily_reminder(p_today date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.build_daily_reminder(p_today date) TO service_role;


--
-- Name: FUNCTION build_installment_deadlines(p_today date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.build_installment_deadlines(p_today date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.build_installment_deadlines(p_today date) TO service_role;


--
-- Name: FUNCTION build_mono_inbox_notification(p_user uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.build_mono_inbox_notification(p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.build_mono_inbox_notification(p_user uuid) TO service_role;


--
-- Name: FUNCTION build_month_start(p_today date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.build_month_start(p_today date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.build_month_start(p_today date) TO service_role;


--
-- Name: FUNCTION build_other_actor_summary_for(p_user uuid, p_since timestamp with time zone, p_until timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.build_other_actor_summary_for(p_user uuid, p_since timestamp with time zone, p_until timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.build_other_actor_summary_for(p_user uuid, p_since timestamp with time zone, p_until timestamp with time zone) TO service_role;


--
-- Name: FUNCTION bump_purge_epoch(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.bump_purge_epoch() FROM PUBLIC;
GRANT ALL ON FUNCTION public.bump_purge_epoch() TO authenticated;
GRANT ALL ON FUNCTION public.bump_purge_epoch() TO service_role;


--
-- Name: FUNCTION categories_late_bind(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.categories_late_bind() TO anon;
GRANT ALL ON FUNCTION public.categories_late_bind() TO authenticated;
GRANT ALL ON FUNCTION public.categories_late_bind() TO service_role;


--
-- Name: FUNCTION categories_propagate_rename(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.categories_propagate_rename() TO anon;
GRANT ALL ON FUNCTION public.categories_propagate_rename() TO authenticated;
GRANT ALL ON FUNCTION public.categories_propagate_rename() TO service_role;


--
-- Name: FUNCTION claim_push_subscription(p_endpoint text, p_p256dh text, p_auth text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_push_subscription(p_endpoint text, p_p256dh text, p_auth text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_push_subscription(p_endpoint text, p_p256dh text, p_auth text) TO authenticated;
GRANT ALL ON FUNCTION public.claim_push_subscription(p_endpoint text, p_p256dh text, p_auth text) TO service_role;


--
-- Name: FUNCTION clear_notifications(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.clear_notifications() FROM PUBLIC;
GRANT ALL ON FUNCTION public.clear_notifications() TO authenticated;
GRANT ALL ON FUNCTION public.clear_notifications() TO service_role;


--
-- Name: FUNCTION delete_notification(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_notification(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_notification(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_notification(p_id uuid) TO service_role;


--
-- Name: FUNCTION expenses_resolve_refs(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.expenses_resolve_refs() TO anon;
GRANT ALL ON FUNCTION public.expenses_resolve_refs() TO authenticated;
GRANT ALL ON FUNCTION public.expenses_resolve_refs() TO service_role;


--
-- Name: FUNCTION fmt_date_ua(d date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fmt_date_ua(d date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fmt_date_ua(d date) TO service_role;


--
-- Name: FUNCTION fmt_money_ua(n numeric, plus boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fmt_money_ua(n numeric, plus boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fmt_money_ua(n numeric, plus boolean) TO service_role;


--
-- Name: FUNCTION is_quiet_now(p_user uuid, p_ts timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_quiet_now(p_user uuid, p_ts timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_quiet_now(p_user uuid, p_ts timestamp with time zone) TO service_role;


--
-- Name: FUNCTION mark_notifications_read(p_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mark_notifications_read(p_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_notifications_read(p_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.mark_notifications_read(p_ids uuid[]) TO service_role;


--
-- Name: FUNCTION mono_accept(p_inbox_id uuid, p_category text, p_subcategory text, p_note text, p_amount integer, p_installment_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mono_accept(p_inbox_id uuid, p_category text, p_subcategory text, p_note text, p_amount integer, p_installment_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mono_accept(p_inbox_id uuid, p_category text, p_subcategory text, p_note text, p_amount integer, p_installment_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mono_accept(p_inbox_id uuid, p_category text, p_subcategory text, p_note text, p_amount integer, p_installment_id uuid) TO service_role;


--
-- Name: FUNCTION mono_apply_refund(p_inbox_id uuid, p_expense_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mono_apply_refund(p_inbox_id uuid, p_expense_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mono_apply_refund(p_inbox_id uuid, p_expense_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mono_apply_refund(p_inbox_id uuid, p_expense_id uuid) TO service_role;


--
-- Name: FUNCTION mono_bigint(p_text text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mono_bigint(p_text text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mono_bigint(p_text text) TO service_role;


--
-- Name: FUNCTION mono_expense_sync(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mono_expense_sync() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mono_expense_sync() TO service_role;


--
-- Name: FUNCTION mono_ignore(p_inbox_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mono_ignore(p_inbox_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mono_ignore(p_inbox_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mono_ignore(p_inbox_id uuid) TO service_role;


--
-- Name: FUNCTION mono_inbox_autoread(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mono_inbox_autoread() TO anon;
GRANT ALL ON FUNCTION public.mono_inbox_autoread() TO authenticated;
GRANT ALL ON FUNCTION public.mono_inbox_autoread() TO service_role;


--
-- Name: FUNCTION mono_ingest(p_user uuid, p_item jsonb, p_source text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mono_ingest(p_user uuid, p_item jsonb, p_source text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mono_ingest(p_user uuid, p_item jsonb, p_source text) TO service_role;


--
-- Name: FUNCTION mono_refund_candidates(p_inbox_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mono_refund_candidates(p_inbox_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mono_refund_candidates(p_inbox_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mono_refund_candidates(p_inbox_id uuid) TO service_role;


--
-- Name: FUNCTION mono_round_uah(p_minor bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mono_round_uah(p_minor bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mono_round_uah(p_minor bigint) TO service_role;


--
-- Name: FUNCTION notif_enabled(p_user uuid, p_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notif_enabled(p_user uuid, p_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.notif_enabled(p_user uuid, p_key text) TO service_role;


--
-- Name: FUNCTION notif_installment_days(p_user uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notif_installment_days(p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.notif_installment_days(p_user uuid) TO service_role;


--
-- Name: FUNCTION notify_backup_reminder(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_backup_reminder() FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_backup_reminder() TO service_role;


--
-- Name: FUNCTION notify_daily_expense_reminder(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_daily_expense_reminder() FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_daily_expense_reminder() TO service_role;


--
-- Name: FUNCTION notify_debt_and_installment_deadlines(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_debt_and_installment_deadlines() FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_debt_and_installment_deadlines() TO service_role;


--
-- Name: FUNCTION notify_mono_inbox(p_user uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_mono_inbox(p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_mono_inbox(p_user uuid) TO service_role;


--
-- Name: FUNCTION notify_other_actor_summary(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_other_actor_summary() FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_other_actor_summary() TO service_role;


--
-- Name: FUNCTION ops_guard(p_dry_run boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ops_guard(p_dry_run boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ops_guard(p_dry_run boolean) TO service_role;


--
-- Name: FUNCTION ping(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ping() TO anon;
GRANT ALL ON FUNCTION public.ping() TO authenticated;
GRANT ALL ON FUNCTION public.ping() TO service_role;


--
-- Name: FUNCTION pl_noun(kind text, n bigint, acc boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pl_noun(kind text, n bigint, acc boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pl_noun(kind text, n bigint, acc boolean) TO service_role;


--
-- Name: FUNCTION pl_ua(n bigint, one text, few text, many text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pl_ua(n bigint, one text, few text, many text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pl_ua(n bigint, one text, few text, many text) TO service_role;


--
-- Name: FUNCTION purge_deleted_accounts(p_days integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.purge_deleted_accounts(p_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.purge_deleted_accounts(p_days integer) TO service_role;


--
-- Name: FUNCTION purge_deleted_taxonomy(p_days integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.purge_deleted_taxonomy(p_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.purge_deleted_taxonomy(p_days integer) TO service_role;


--
-- Name: FUNCTION push_actor_title(p_name text, p_gender text, p_act text, p_object text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.push_actor_title(p_name text, p_gender text, p_act text, p_object text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.push_actor_title(p_name text, p_gender text, p_act text, p_object text) TO service_role;


--
-- Name: FUNCTION push_call_headers(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.push_call_headers() FROM PUBLIC;
GRANT ALL ON FUNCTION public.push_call_headers() TO service_role;


--
-- Name: FUNCTION push_send(p_user uuid, p_title text, p_body text, p_data jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.push_send(p_user uuid, p_title text, p_body text, p_data jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.push_send(p_user uuid, p_title text, p_body text, p_data jsonb) TO service_role;


--
-- Name: FUNCTION report_push_receipts(p_items jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.report_push_receipts(p_items jsonb) TO anon;
GRANT ALL ON FUNCTION public.report_push_receipts(p_items jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.report_push_receipts(p_items jsonb) TO service_role;


--
-- Name: FUNCTION run_backup_reminder_kyiv(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.run_backup_reminder_kyiv() FROM PUBLIC;
GRANT ALL ON FUNCTION public.run_backup_reminder_kyiv() TO service_role;


--
-- Name: FUNCTION run_daily_expense_reminder_kyiv(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.run_daily_expense_reminder_kyiv() FROM PUBLIC;
GRANT ALL ON FUNCTION public.run_daily_expense_reminder_kyiv() TO service_role;


--
-- Name: FUNCTION run_debt_deadlines_kyiv(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.run_debt_deadlines_kyiv() FROM PUBLIC;
GRANT ALL ON FUNCTION public.run_debt_deadlines_kyiv() TO service_role;


--
-- Name: FUNCTION run_test_push_series(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.run_test_push_series() FROM PUBLIC;
GRANT ALL ON FUNCTION public.run_test_push_series() TO service_role;


--
-- Name: FUNCTION set_deleted_at_server(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_deleted_at_server() TO anon;
GRANT ALL ON FUNCTION public.set_deleted_at_server() TO authenticated;
GRANT ALL ON FUNCTION public.set_deleted_at_server() TO service_role;


--
-- Name: FUNCTION set_updated_at_if_changed(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_updated_at_if_changed() FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_updated_at_if_changed() TO service_role;


--
-- Name: FUNCTION set_updated_at_now(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_updated_at_now() FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_updated_at_now() TO service_role;


--
-- Name: FUNCTION set_updated_at_on_insert(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at_on_insert() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at_on_insert() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at_on_insert() TO service_role;


--
-- Name: FUNCTION start_test_push_series(p_count integer, p_intervals_s integer[], p_tag text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.start_test_push_series(p_count integer, p_intervals_s integer[], p_tag text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.start_test_push_series(p_count integer, p_intervals_s integer[], p_tag text) TO authenticated;
GRANT ALL ON FUNCTION public.start_test_push_series(p_count integer, p_intervals_s integer[], p_tag text) TO service_role;


--
-- Name: FUNCTION subcategories_late_bind(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.subcategories_late_bind() TO anon;
GRANT ALL ON FUNCTION public.subcategories_late_bind() TO authenticated;
GRANT ALL ON FUNCTION public.subcategories_late_bind() TO service_role;


--
-- Name: FUNCTION subcategories_propagate_rename(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.subcategories_propagate_rename() TO anon;
GRANT ALL ON FUNCTION public.subcategories_propagate_rename() TO authenticated;
GRANT ALL ON FUNCTION public.subcategories_propagate_rename() TO service_role;


--
-- Name: FUNCTION sync_debt_names_on_bank_rename(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_debt_names_on_bank_rename() TO anon;
GRANT ALL ON FUNCTION public.sync_debt_names_on_bank_rename() TO authenticated;
GRANT ALL ON FUNCTION public.sync_debt_names_on_bank_rename() TO service_role;


--
-- Name: FUNCTION sync_debt_names_on_installment_rename(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_debt_names_on_installment_rename() TO anon;
GRANT ALL ON FUNCTION public.sync_debt_names_on_installment_rename() TO authenticated;
GRANT ALL ON FUNCTION public.sync_debt_names_on_installment_rename() TO service_role;


--
-- Name: FUNCTION sync_heads(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sync_heads() FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_heads() TO authenticated;
GRANT ALL ON FUNCTION public.sync_heads() TO service_role;


--
-- Name: FUNCTION trunc_push(t text, max_len integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.trunc_push(t text, max_len integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.trunc_push(t text, max_len integer) TO service_role;


--
-- Name: FUNCTION verify_push_secret(p_secret text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.verify_push_secret(p_secret text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.verify_push_secret(p_secret text) TO service_role;


--
-- Name: TABLE bank_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bank_accounts TO authenticated;
GRANT ALL ON TABLE public.bank_accounts TO service_role;


--
-- Name: TABLE categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.categories TO authenticated;
GRANT ALL ON TABLE public.categories TO service_role;


--
-- Name: TABLE client_debug_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.client_debug_logs TO authenticated;
GRANT ALL ON TABLE public.client_debug_logs TO service_role;


--
-- Name: TABLE debts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.debts TO authenticated;
GRANT ALL ON TABLE public.debts TO service_role;


--
-- Name: TABLE dictionary; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dictionary TO authenticated;
GRANT ALL ON TABLE public.dictionary TO service_role;


--
-- Name: TABLE expenses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.expenses TO authenticated;
GRANT ALL ON TABLE public.expenses TO service_role;


--
-- Name: TABLE families; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.families TO authenticated;
GRANT ALL ON TABLE public.families TO service_role;


--
-- Name: TABLE family_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.family_members TO authenticated;
GRANT ALL ON TABLE public.family_members TO service_role;


--
-- Name: TABLE hidden_entities; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hidden_entities TO authenticated;
GRANT ALL ON TABLE public.hidden_entities TO service_role;


--
-- Name: TABLE installment_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.installment_accounts TO authenticated;
GRANT ALL ON TABLE public.installment_accounts TO service_role;


--
-- Name: TABLE hidden_entities_readable; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.hidden_entities_readable TO authenticated;
GRANT ALL ON TABLE public.hidden_entities_readable TO service_role;


--
-- Name: TABLE incomes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.incomes TO authenticated;
GRANT ALL ON TABLE public.incomes TO service_role;


--
-- Name: TABLE mono_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mono_accounts TO service_role;
GRANT SELECT ON TABLE public.mono_accounts TO authenticated;


--
-- Name: COLUMN mono_accounts.tracked; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(tracked) ON TABLE public.mono_accounts TO authenticated;


--
-- Name: TABLE mono_connections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mono_connections TO service_role;


--
-- Name: COLUMN mono_connections.user_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(user_id) ON TABLE public.mono_connections TO authenticated;


--
-- Name: COLUMN mono_connections.family_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(family_id) ON TABLE public.mono_connections TO authenticated;


--
-- Name: COLUMN mono_connections.status; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(status) ON TABLE public.mono_connections TO authenticated;


--
-- Name: COLUMN mono_connections.connected_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(connected_at) ON TABLE public.mono_connections TO authenticated;


--
-- Name: COLUMN mono_connections.last_event_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(last_event_at) ON TABLE public.mono_connections TO authenticated;


--
-- Name: COLUMN mono_connections.last_error; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(last_error) ON TABLE public.mono_connections TO authenticated;


--
-- Name: COLUMN mono_connections.backfill_done; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(backfill_done) ON TABLE public.mono_connections TO authenticated;


--
-- Name: COLUMN mono_connections.auto_add; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(auto_add) ON TABLE public.mono_connections TO authenticated;


--
-- Name: TABLE mono_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mono_events TO service_role;


--
-- Name: SEQUENCE mono_events_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.mono_events_id_seq TO service_role;


--
-- Name: TABLE mono_inbox; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mono_inbox TO service_role;
GRANT SELECT ON TABLE public.mono_inbox TO authenticated;


--
-- Name: TABLE mono_mcc_rules; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mono_mcc_rules TO service_role;
GRANT SELECT ON TABLE public.mono_mcc_rules TO authenticated;


--
-- Name: TABLE notification_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notification_settings TO authenticated;
GRANT ALL ON TABLE public.notification_settings TO service_role;


--
-- Name: TABLE notification_state; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notification_state TO service_role;


--
-- Name: TABLE push_cron_state; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.push_cron_state TO authenticated;
GRANT ALL ON TABLE public.push_cron_state TO service_role;


--
-- Name: TABLE push_delivery_log; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.push_delivery_log TO authenticated;
GRANT ALL ON TABLE public.push_delivery_log TO service_role;


--
-- Name: TABLE push_receipts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.push_receipts TO authenticated;
GRANT ALL ON TABLE public.push_receipts TO service_role;


--
-- Name: TABLE push_sent_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.push_sent_log TO authenticated;
GRANT ALL ON TABLE public.push_sent_log TO service_role;


--
-- Name: TABLE push_latency; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.push_latency TO authenticated;
GRANT ALL ON TABLE public.push_latency TO service_role;


--
-- Name: SEQUENCE push_receipts_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.push_receipts_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.push_receipts_id_seq TO service_role;


--
-- Name: SEQUENCE push_sent_log_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.push_sent_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.push_sent_log_id_seq TO service_role;


--
-- Name: TABLE push_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.push_subscriptions TO authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;


--
-- Name: TABLE push_test_series; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.push_test_series TO authenticated;
GRANT ALL ON TABLE public.push_test_series TO service_role;


--
-- Name: SEQUENCE push_test_series_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.push_test_series_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.push_test_series_id_seq TO service_role;


--
-- Name: TABLE subcategories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subcategories TO authenticated;
GRANT ALL ON TABLE public.subcategories TO service_role;


--
-- Name: TABLE subcategory_priority; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subcategory_priority TO authenticated;
GRANT ALL ON TABLE public.subcategory_priority TO service_role;


--
-- Name: TABLE sync_epochs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sync_epochs TO authenticated;
GRANT ALL ON TABLE public.sync_epochs TO service_role;


--
-- Name: TABLE taxonomy_aliases; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.taxonomy_aliases TO authenticated;
GRANT ALL ON TABLE public.taxonomy_aliases TO service_role;


--
-- Name: TABLE user_notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_notifications TO service_role;
GRANT SELECT ON TABLE public.user_notifications TO authenticated;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--


