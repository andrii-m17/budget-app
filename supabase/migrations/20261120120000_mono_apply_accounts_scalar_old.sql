-- MONO-PENDING (20.11.2026): mono_apply_accounts падала на кожній банці та картці без номера («record "old" is not assigned yet»),
-- бо `old := null` робив змінну-запис невизначеною, а `old.id` читалось далі. Тепер окремі скалярні змінні v_old_id / v_old_tracked.
-- Текст узято з робочої бази лише читанням (pg_get_functiondef); застосовано на обох базах чатом. Тут лише для історії в репозиторії.
CREATE OR REPLACE FUNCTION public.mono_apply_accounts(p_user uuid, p_accounts jsonb, p_mark_backfill boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- MONO-PENDING (20.11): запис «old := null» робив змінну-запис невизначеною, і «old.id» падав
-- («record "old" is not assigned yet») для кожної банки та картки без номера. Тепер окремі скалярні змінні.
declare conn record; r record; v_old_id uuid; v_old_tracked boolean; v_added int := 0; v_replaced int := 0; v_removed int := 0; v_tracked boolean; v_from timestamptz;
begin
  select * into conn from public.mono_connections where user_id = p_user;
  if not found then return jsonb_build_object('error','no_connection'); end if;
  if jsonb_typeof(p_accounts) is distinct from 'array' or jsonb_array_length(p_accounts) = 0
     or not exists (select 1 from jsonb_array_elements(p_accounts) x where nullif(btrim(coalesce(x->>'id','')), '') is not null) then
    return jsonb_build_object('error','empty');
  end if;
  v_from := case when conn.last_event_at is not null then greatest(conn.last_event_at, now() - interval '2682000 seconds') end;
  for r in
    select left(btrim(x->>'id'),64) as id, coalesce(x->>'masked_pan','') as pan, nullif(x->>'type','') as typ,
           public.mono_bigint(x->>'currency_code')::int as cur, coalesce((x->>'is_jar') = 'true', false) as jar
      from jsonb_array_elements(p_accounts) x where nullif(btrim(coalesce(x->>'id','')), '') is not null
  loop
    update public.mono_accounts set masked_pan = r.pan, account_type = r.typ, currency_code = r.cur, is_jar = r.jar,
           backfill_from = case when p_mark_backfill and tracked and v_from is not null then coalesce(backfill_from, v_from) else backfill_from end
     where user_id = p_user and mono_account_id = r.id;
    if found then continue; end if;
    v_old_id := null; v_old_tracked := null;
    if not r.jar and r.pan <> '' then
      select a.id, a.tracked into v_old_id, v_old_tracked from public.mono_accounts a
       where a.user_id = p_user and not a.is_jar and a.masked_pan = r.pan
         and a.account_type is not distinct from r.typ and a.currency_code is not distinct from r.cur
         and not exists (select 1 from jsonb_array_elements(p_accounts) y where y->>'id' = a.mono_account_id)
       order by a.created_at desc limit 1;
    end if;
    if v_old_id is not null then v_tracked := v_old_tracked; v_replaced := v_replaced + 1;
    else v_tracked := (not r.jar and r.cur = 980 and coalesce(r.typ,'') not in ('fop','eAid')); v_added := v_added + 1;
    end if;
    insert into public.mono_accounts (user_id, family_id, mono_account_id, masked_pan, account_type, currency_code, is_jar, tracked, backfill_from)
    values (p_user, conn.family_id, r.id, r.pan, r.typ, r.cur, r.jar, v_tracked, case when v_tracked then v_from end);
  end loop;
  delete from public.mono_accounts a where a.user_id = p_user
     and not exists (select 1 from jsonb_array_elements(p_accounts) y where left(btrim(y->>'id'),64) = a.mono_account_id);
  get diagnostics v_removed = row_count;
  return jsonb_build_object('added', v_added, 'replaced', v_replaced, 'removed', v_removed);
end $function$;
