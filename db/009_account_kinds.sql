-- 009: account kinds, and investments kept as a black box at cost.
--
-- * accounts.kind: 'cash' (day-to-day), 'savings' or 'investment'. The overview
--   shows cash and savings + investments as separate lines.
-- * An investment account (a fund, a broker) is not revalued: its balance is what
--   went in minus what came out. Money is moved into one by giving the payment a
--   category tied to that account (accounts.invest_category_id, a 'transfer'
--   category, so the payment counts as neither income nor expense);
--   fin_mirror_investments then books the opposite entry on the investment account
--   (a trigger runs it after every insert or category change).
-- * v_balance_daily gains the account kind and runs every account to today; the app
--   may read id, bank, name and kind of accounts (not IBANs or masks).
--
-- The accounts, categories and opening amounts are rows in the database, added in
-- the SQL editor, not here: this repository is public.
-- Idempotent: safe to run again.

alter table public.accounts add column if not exists kind text not null default 'cash';
alter table public.accounts add column if not exists invest_category_id smallint references public.categories(id);
do $$ begin
  alter table public.accounts add constraint accounts_kind_check check (kind in ('cash', 'savings', 'investment'));
exception when duplicate_object then null; end $$;

-- The app reads the account list (no account numbers) to split balances by kind.
grant select (id, bank, name, kind) on public.accounts to authenticated;
drop policy if exists allowed_read on public.accounts;
create policy allowed_read on public.accounts for select to authenticated using ((select fin_is_allowed()));

-- Opposite entry on the investment account for every payment categorised to it.
create or replace function public.fin_mirror_investments()
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_n int;
begin
  insert into transactions (account_id, source, external_id, posting_date, value_date, txn_at,
    description, amount, direction, txn_type, category_id, category_source, note)
  select inv.id, 'manual', 'mirror:' || t.id, t.posting_date, t.value_date, t.txn_at,
    t.description, t.amount, case t.direction when 'debit' then 'credit' else 'debit' end, 'transfer',
    t.category_id, 'manual', 'Mirror of a payment from ' || src.name
  from transactions t
  join accounts src on src.id = t.account_id and src.kind <> 'investment'
  join accounts inv on inv.invest_category_id = t.category_id and inv.kind = 'investment'
  on conflict do nothing;
  get diagnostics v_n = row_count;
  -- A payment re-categorised away from an investment loses its mirror.
  delete from transactions m
  where m.source = 'manual' and m.external_id like 'mirror:%'
    and not exists (select 1 from transactions t join accounts inv on inv.invest_category_id = t.category_id
                    where t.id = substr(m.external_id, 8)::bigint and inv.id = m.account_id);
  return v_n;
end
$$;

revoke all on function public.fin_mirror_investments() from public, anonymous, authenticated;

-- Run after any insert or category change (rules, imports, the app's category
-- edits). The mirrors it inserts fire it again one level down; that call stops.
create or replace function public.fin_mirror_investments_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if pg_trigger_depth() = 1 then
    perform fin_mirror_investments();
  end if;
  return null;
end
$$;

revoke all on function public.fin_mirror_investments_trigger() from public, anonymous, authenticated;

drop trigger if exists transactions_mirror_investments on public.transactions;
create trigger transactions_mirror_investments
after insert or update of category_id on public.transactions
for each statement execute function public.fin_mirror_investments_trigger();

-- As in 007, plus the account kind, and every account runs to today (an account
-- with no recent movement, like an investment, keeps its last balance).
create or replace view public.v_balance_daily with (security_invoker = true) as
with anchor as (
  select distinct on (account_id) account_id, as_of, balance
  from account_balances
  order by account_id, as_of desc
), counted as (
  select t.account_id, t.posting_date, t.signed_amount
  from transactions t
  join anchor a on a.account_id = t.account_id
  where t.source not in ('account_alert', 'card_alert') or t.posting_date > a.as_of
     or not exists (select 1 from transactions s where s.account_id = t.account_id and s.source = 'statement_csv')
), bounds as (
  select a.account_id, least(min(c.posting_date), a.as_of) as d0, greatest(max(c.posting_date), a.as_of, current_date) as d1
  from anchor a
  left join counted c on c.account_id = a.account_id
  group by a.account_id, a.as_of
), days as (
  select b.account_id, gs::date as day
  from bounds b
  cross join lateral generate_series(b.d0::timestamp, b.d1::timestamp, interval '1 day') gs
), net as (
  select d.account_id, d.day, coalesce(sum(c.signed_amount), 0::numeric) as net_change
  from days d
  left join counted c on c.account_id = d.account_id and c.posting_date = d.day
  group by d.account_id, d.day
), cum as (
  select n.account_id, n.day, n.net_change, sum(n.net_change) over (partition by n.account_id order by n.day) as running
  from net n
)
select c.account_id, c.day, c.net_change, a.balance + c.running - ca.running as balance,
       coalesce(acc.kind, 'cash') as kind
from cum c
join anchor a on a.account_id = c.account_id
join cum ca on ca.account_id = a.account_id and ca.day = a.as_of
left join accounts acc on acc.id = c.account_id;

grant select on public.v_balance_daily to authenticated;
