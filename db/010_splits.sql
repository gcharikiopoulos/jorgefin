-- 010: split a transaction across categories.
--
-- A split keeps the transaction as it is and adds lines (category, amount, note).
-- Whatever the lines do not cover stays in the transaction's own category: a
-- 1.000 € cash withdrawal split into 300 € groceries and 200 € kiosk leaves 500 €
-- as "Cash withdrawal". v_txn_lines is the transactions as those lines; every
-- total (monthly summary, by category, daily, merchants) now reads from it, while
-- v_transactions stays one row per transaction for the ledger, with split_count
-- and split_total added at the end.
-- Idempotent: safe to run again.

create table if not exists public.transaction_splits (
  id bigint generated always as identity primary key,
  txn_id bigint not null references public.transactions(id) on delete cascade,
  category_id smallint not null references public.categories(id),
  amount numeric(12,2) not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists transaction_splits_txn on public.transaction_splits (txn_id);

alter table public.transaction_splits enable row level security;
drop policy if exists allowed_read on public.transaction_splits;
create policy allowed_read on public.transaction_splits for select to authenticated using ((select public.fin_is_allowed()));
revoke all on public.transaction_splits from public, anonymous, authenticated;
grant select on public.transaction_splits to authenticated;

-- One row per transaction, as before, plus how much of it is split off.
create or replace view public.v_transactions with (security_invoker = true) as
select id, account_id, source, posting_date, value_date, txn_at, txn_date, month, description, description_norm,
  amount, direction, signed_amount, txn_type, merchant_id, merchant_name, category_id, category, parent_category,
  kind, color, category_source, cardholder, note,
  case when kind = 'expense' then -signed_amount else 0::numeric end as expense_amount,
  case when kind = 'income' then signed_amount else 0::numeric end as income_amount,
  split_count, split_total
from (
  select t.id, t.account_id, t.source, t.posting_date, t.value_date, t.txn_at,
    coalesce((t.txn_at at time zone 'Europe/Athens')::date, t.value_date, t.posting_date) as txn_date,
    date_trunc('month', coalesce((t.txn_at at time zone 'Europe/Athens')::date, t.value_date, t.posting_date)::timestamptz)::date as month,
    t.description, t.description_norm, t.amount, t.direction, t.signed_amount, t.txn_type, t.merchant_id,
    coalesce(m.name, t.description) as merchant_name, t.category_id, coalesce(c.name, 'Uncategorized') as category,
    pc.name as parent_category,
    coalesce(c.kind, case when t.direction = 'credit' then 'income' else 'expense' end) as kind,
    c.color, t.category_source, t.cardholder, t.note,
    coalesce(sp.n, 0)::int as split_count, coalesce(sp.total, 0)::numeric(12,2) as split_total
  from public.transactions t
  left join public.merchants m on m.id = t.merchant_id
  left join public.categories c on c.id = t.category_id
  left join public.categories pc on pc.id = c.parent_id
  left join (select txn_id, count(*) as n, sum(amount) as total from public.transaction_splits group by txn_id) sp on sp.txn_id = t.id
) x;

-- The transactions as category lines: split lines, plus the part not split off.
create or replace view public.v_txn_lines with (security_invoker = true) as
with sp as (
  select txn_id, sum(amount) as total from public.transaction_splits group by txn_id
), lines as (
  select t.id as txn_id, null::bigint as split_id, t.category_id, (t.amount - coalesce(sp.total, 0))::numeric(12,2) as amount, t.note
  from public.transactions t left join sp on sp.txn_id = t.id
  where sp.txn_id is null or t.amount - sp.total > 0
  union all
  select s.txn_id, s.id, s.category_id, s.amount, coalesce(s.note, t.note)
  from public.transaction_splits s join public.transactions t on t.id = s.txn_id
)
select id, account_id, source, posting_date, value_date, txn_at, txn_date, month, description, description_norm,
  amount, direction, signed_amount, txn_type, merchant_id, merchant_name, category_id, category, parent_category,
  kind, color, category_source, cardholder, note,
  case when kind = 'expense' then -signed_amount else 0::numeric end as expense_amount,
  case when kind = 'income' then signed_amount else 0::numeric end as income_amount,
  split_id
from (
  select t.id, t.account_id, t.source, t.posting_date, t.value_date, t.txn_at,
    coalesce((t.txn_at at time zone 'Europe/Athens')::date, t.value_date, t.posting_date) as txn_date,
    date_trunc('month', coalesce((t.txn_at at time zone 'Europe/Athens')::date, t.value_date, t.posting_date)::timestamptz)::date as month,
    t.description, t.description_norm, l.amount, t.direction,
    case when t.direction = 'credit' then l.amount else -l.amount end as signed_amount,
    t.txn_type, t.merchant_id, coalesce(m.name, t.description) as merchant_name, l.category_id,
    coalesce(c.name, 'Uncategorized') as category, pc.name as parent_category,
    coalesce(c.kind, case when t.direction = 'credit' then 'income' else 'expense' end) as kind,
    c.color, t.category_source, t.cardholder, l.note, l.split_id
  from lines l
  join public.transactions t on t.id = l.txn_id
  left join public.merchants m on m.id = t.merchant_id
  left join public.categories c on c.id = l.category_id
  left join public.categories pc on pc.id = c.parent_id
) x;
grant select on public.v_txn_lines to authenticated;

-- Totals read the lines; counts stay per transaction.
create or replace view public.v_monthly_summary with (security_invoker = true) as
select month,
  sum(income_amount) as income,
  sum(expense_amount) as expenses,
  sum(income_amount) - sum(expense_amount) as net,
  coalesce(sum(-signed_amount) filter (where kind = 'transfer'), 0::numeric) as transfers_out,
  round((sum(income_amount) - sum(expense_amount)) / nullif(sum(income_amount), 0::numeric), 3) as savings_rate,
  count(distinct id) as txn_count,
  count(distinct id) filter (where category_id is null) as uncategorized_count
from public.v_txn_lines
group by month;

create or replace view public.v_monthly_by_category with (security_invoker = true) as
select month, category_id, category, parent_category, kind, color, total, txn_count,
  round(total / nullif(sum(total) over (partition by month, kind), 0::numeric), 4) as share_of_kind
from (
  select month, category_id, category, parent_category, kind, color,
    sum(case kind when 'expense' then expense_amount when 'income' then income_amount else -signed_amount end) as total,
    count(distinct id) as txn_count
  from public.v_txn_lines
  group by month, category_id, category, parent_category, kind, color
) s;

create or replace view public.v_daily_spend with (security_invoker = true) as
select txn_date, sum(expense_amount) as spend, count(distinct id) filter (where kind = 'expense') as txn_count
from public.v_txn_lines
group by txn_date;

create or replace view public.v_merchant_summary with (security_invoker = true) as
select merchant_id, merchant_name, category, count(distinct id) as txn_count, sum(expense_amount) as total_spend,
  round(avg(expense_amount), 2) as avg_spend, min(txn_date) as first_seen, max(txn_date) as last_seen
from public.v_txn_lines
where kind = 'expense'
group by merchant_id, merchant_name, category;

-- An uncategorised transaction that is fully split needs no review.
create or replace view public.v_review_queue with (security_invoker = true) as
select description_norm,
  min(description) as sample_description,
  count(*) as txn_count,
  count(*) filter (where direction = 'debit') as debit_count,
  count(*) filter (where direction = 'credit') as credit_count,
  coalesce(sum(amount) filter (where direction = 'debit'), 0::numeric) as total_out,
  coalesce(sum(amount) filter (where direction = 'credit'), 0::numeric) as total_in,
  sum(signed_amount) as net_amount,
  min(posting_date) as first_seen,
  max(posting_date) as last_seen
from public.transactions t
where category_id is null
  and t.amount > coalesce((select sum(s.amount) from public.transaction_splits s where s.txn_id = t.id), 0)
group by description_norm;

-- Replaces a transaction's split lines. p_lines: [{ "category_id": 1, "amount": 12.5, "note": "…" }];
-- an empty list removes the split. Returns the number of lines saved.
create or replace function public.fin_set_splits(p_txn_id bigint, p_lines jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_amount numeric;
  v_total numeric;
  v_n int;
  v_lines jsonb := coalesce(p_lines, '[]'::jsonb);
begin
  if not public.fin_is_allowed() then raise exception 'not authorised' using errcode = '42501'; end if;
  if jsonb_typeof(v_lines) <> 'array' then raise exception 'Lines must be a list'; end if;
  select amount into v_amount from transactions where id = p_txn_id for update;
  if v_amount is null then raise exception 'Transaction not found'; end if;
  if exists (select 1 from jsonb_array_elements(v_lines) e
             where (e->>'category_id') is null or coalesce((e->>'amount')::numeric, 0) <= 0) then
    raise exception 'Every line needs a category and an amount above zero';
  end if;
  if exists (select 1 from jsonb_array_elements(v_lines) e
             where not exists (select 1 from categories c where c.id = (e->>'category_id')::int)) then
    raise exception 'Unknown category';
  end if;
  select coalesce(sum(round((e->>'amount')::numeric, 2)), 0) into v_total from jsonb_array_elements(v_lines) e;
  if v_total > v_amount then
    raise exception 'The lines add up to % €, more than the payment (% €)', v_total, v_amount;
  end if;
  delete from transaction_splits where txn_id = p_txn_id;
  insert into transaction_splits (txn_id, category_id, amount, note)
  select p_txn_id, (e->>'category_id')::smallint, round((e->>'amount')::numeric, 2), nullif(btrim(e->>'note'), '')
  from jsonb_array_elements(v_lines) e;
  get diagnostics v_n = row_count;
  update transactions set updated_at = now() where id = p_txn_id;
  return v_n;
end $function$;

revoke all on function public.fin_set_splits(bigint, jsonb) from public, anonymous, authenticated;
grant execute on function public.fin_set_splits(bigint, jsonb) to authenticated;
