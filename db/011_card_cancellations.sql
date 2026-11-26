-- 011: card purchase cancellations ("ΧΡΕΩΣΤ.ΚΑΡΤΑ-ΑΚΥΡΩΣΗ").
--
-- When a card payment is reversed the bank sends a credit for the same amount,
-- usually minutes after the purchase (a cancelled delivery or ride). Left alone the
-- credit has no category while the purchase counts as spending. Each cancellation
-- is now linked to the purchase it reverses (same account and amount, the latest
-- one in the three days before it, not already cancelled) and takes its category,
-- so the pair nets to zero; it follows the purchase if that is recategorised.
-- A category you set on a cancellation by hand is kept.
-- Idempotent: safe to run again.

alter table public.transactions add column if not exists cancels_txn_id bigint references public.transactions(id) on delete set null;
create unique index if not exists transactions_cancels_txn on public.transactions (cancels_txn_id) where cancels_txn_id is not null;

-- Pairs new cancellations and brings their categories in line. Returns the rows changed.
create or replace function public.fin_match_cancellations()
returns integer language plpgsql set search_path = public, pg_temp as $function$
declare
  r record;
  v_at timestamptz;
  v_pid bigint;
  v_n int := 0;
  v_m int;
begin
  for r in
    select t.id, t.account_id, t.amount, t.txn_at, coalesce(t.value_date, t.posting_date) as d
    from transactions t
    where t.direction = 'credit' and t.cancels_txn_id is null
      and t.description_norm like 'XPEΩΣT.KAPTA-AKYPΩΣH%'
    order by coalesce(t.txn_at, coalesce(t.value_date, t.posting_date)::timestamp at time zone 'Europe/Athens'), t.id
  loop
    v_at := coalesce(r.txn_at, (r.d + time '23:59') at time zone 'Europe/Athens');
    select p.id into v_pid
    from transactions p
    where p.account_id = r.account_id and p.direction = 'debit' and p.amount = r.amount
      and coalesce(p.txn_at, coalesce(p.value_date, p.posting_date)::timestamp at time zone 'Europe/Athens') between v_at - interval '3 days' and v_at
      and not exists (select 1 from transactions o where o.cancels_txn_id = p.id)
    order by coalesce(p.txn_at, coalesce(p.value_date, p.posting_date)::timestamp at time zone 'Europe/Athens') desc, p.id desc
    limit 1;
    if v_pid is not null then
      update transactions set cancels_txn_id = v_pid, updated_at = now() where id = r.id;
      v_n := v_n + 1;
    end if;
  end loop;

  update transactions c set
    category_id = p.category_id,
    category_source = case when p.category_id is null then null else 'rule' end,
    note = coalesce(c.note, 'Cancels ' || coalesce(m.name, p.description)),
    updated_at = now()
  from transactions p
  left join merchants m on m.id = p.merchant_id
  where c.cancels_txn_id = p.id
    and c.category_source is distinct from 'manual'
    and (c.category_id is distinct from p.category_id or c.note is null);
  get diagnostics v_m = row_count;
  return v_n + v_m;
end $function$;

-- A purchase recategorised (by hand or by a rule) takes its cancellation along.
create or replace function public.fin_sync_cancellation()
returns trigger language plpgsql set search_path = public, pg_temp as $function$
begin
  update transactions c set
    category_id = new.category_id,
    category_source = case when new.category_id is null then null else 'rule' end,
    updated_at = now()
  where c.cancels_txn_id = new.id
    and c.category_source is distinct from 'manual'
    and c.category_id is distinct from new.category_id;
  return null;
end $function$;

drop trigger if exists transactions_sync_cancellation on public.transactions;
create trigger transactions_sync_cancellation
  after update of category_id on public.transactions
  for each row when (new.direction = 'debit' and old.category_id is distinct from new.category_id)
  execute function public.fin_sync_cancellation();

-- Runs after every import and rule change, with the transfer matching.
create or replace function public.fin_apply_rules(p_batch integer DEFAULT NULL::integer)
returns integer language plpgsql as $function$
declare
  v_n int;
begin
  with best as (
    select distinct on (t.id) t.id, r.id as rule_id, r.merchant_id,
           coalesce(r.category_id, m.default_category_id) as category_id, r.txn_type
    from transactions t
    join category_rules r on ((r.match_type = 'exact' and t.description_norm = r.pattern_norm)
                           or (r.match_type = 'prefix' and starts_with(t.description_norm, r.pattern_norm))
                           or (r.match_type = 'contains' and position(r.pattern_norm in t.description_norm) > 0))
    left join merchants m on m.id = r.merchant_id
    where t.category_source is distinct from 'manual' and (p_batch is null or t.batch_id = p_batch)
    order by t.id, r.priority, case r.match_type when 'exact' then 1 when 'prefix' then 2 else 3 end, length(r.pattern_norm) desc
  )
  update transactions t set
    rule_id = b.rule_id,
    merchant_id = coalesce(b.merchant_id, t.merchant_id),
    category_id = coalesce(b.category_id, t.category_id),
    category_source = case when b.category_id is not null then 'rule' else t.category_source end,
    txn_type = coalesce(b.txn_type, t.txn_type),
    updated_at = now()
  from best b
  where b.id = t.id;
  get diagnostics v_n = row_count;
  return v_n + fin_match_transfers() + fin_match_cancellations();
end
$function$;

-- Pair the cancellations already on record.
select public.fin_match_cancellations();
