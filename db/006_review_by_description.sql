-- Review queue: one row per description instead of one per description and
-- direction. Rules match on the description only, so a rule made from a row
-- always covers exactly that row's payments and credits together.

drop view if exists public.v_review_queue;

create view public.v_review_queue with (security_invoker = true) as
select
  description_norm,
  min(description) as sample_description,
  count(*) as txn_count,
  count(*) filter (where direction = 'debit') as debit_count,
  count(*) filter (where direction = 'credit') as credit_count,
  coalesce(sum(amount) filter (where direction = 'debit'), 0) as total_out,
  coalesce(sum(amount) filter (where direction = 'credit'), 0) as total_in,
  sum(signed_amount) as net_amount,
  min(posting_date) as first_seen,
  max(posting_date) as last_seen
from public.transactions
where category_id is null
group by description_norm;

grant select on public.v_review_queue to authenticated;
