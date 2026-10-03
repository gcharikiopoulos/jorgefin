-- 008: money moved between the owner's own accounts.
--
-- A transfer between two tracked accounts shows up twice: a debit on one, a credit
-- on the other. Both belong in a 'transfer' category (kind 'transfer' counts as
-- neither income nor expense). Rules catch the side whose description names the
-- other account or the owner; fin_match_transfers then gives the other side, whose
-- description often says nothing useful ("ΜΕΤΑΦΟΡΑ ΑΠΟ ΤΟΝ ΛΟΓΑΡΙΑΣΜΟ"), the same
-- category when it finds exactly one counterpart:
--   uncategorised, another account, opposite direction, same amount, within 3 days
--   of a transfer that has no counterpart yet.
-- fin_apply_rules runs it after every import and every new rule.
--
-- The rules themselves name accounts and people, so they are added in the SQL
-- editor (or from the Review screen), not here: this repository is public.
-- Idempotent: safe to run again.

create or replace function public.fin_match_transfers()
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_n int;
begin
  with t as (
    select x.id, x.account_id, x.direction, x.amount, x.category_id, c.kind,
           coalesce(x.value_date, x.posting_date) as d
    from transactions x
    left join categories c on c.id = x.category_id
  ),
  open_transfer as (            -- a transfer with no counterpart on another account yet
    select y.* from t y
    where y.kind = 'transfer'
      and not exists (select 1 from t z
                      where z.kind = 'transfer' and z.account_id <> y.account_id and z.direction <> y.direction
                        and z.amount = y.amount and abs(z.d - y.d) <= 3)
  ),
  candidate as (
    select x.id, y.id as transfer_id, y.category_id
    from t x
    join open_transfer y on y.account_id <> x.account_id and y.direction <> x.direction
                        and y.amount = x.amount and abs(y.d - x.d) <= 3
    join transactions tx on tx.id = x.id
    where x.category_id is null and tx.category_source is distinct from 'manual'
  ),
  unique_pair as (              -- only where both sides have exactly one candidate
    select c.* from candidate c
    where (select count(*) from candidate c2 where c2.id = c.id) = 1
      and (select count(*) from candidate c2 where c2.transfer_id = c.transfer_id) = 1
  )
  update transactions tx set
    category_id = p.category_id, category_source = 'rule', rule_id = null,
    txn_type = case when tx.txn_type = 'other' then 'transfer' else tx.txn_type end,
    updated_at = now()
  from unique_pair p
  where tx.id = p.id;
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

revoke all on function public.fin_match_transfers() from public, anonymous, authenticated;

-- As before (rules for the batch, or for everything), then the transfer pairing.
create or replace function public.fin_apply_rules(p_batch integer default null)
returns integer
language plpgsql
as $function$
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
  return v_n + fin_match_transfers();
end
$function$;

revoke all on function public.fin_apply_rules(integer) from public, anonymous, authenticated;
