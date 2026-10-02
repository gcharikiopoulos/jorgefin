-- Daily balance, worked back from the latest known balance (account_balances).
-- That balance comes from a bank statement, which only holds posted transactions.
-- Email alerts the statement does not have yet (not merged into a statement row)
-- are left out up to the balance date and counted after it; otherwise every
-- earlier day would be off by their total.

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
), bounds as (
  select a.account_id, least(min(c.posting_date), a.as_of) as d0, greatest(max(c.posting_date), a.as_of) as d1
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
select c.account_id, c.day, c.net_change, a.balance + c.running - ca.running as balance
from cum c
join anchor a on a.account_id = c.account_id
join cum ca on ca.account_id = a.account_id and ca.day = a.as_of;

grant select on public.v_balance_daily to authenticated;
