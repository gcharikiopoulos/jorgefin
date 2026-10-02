-- Access control for the Data API (applied to the personal-finance project, branch main).
-- Signed-in users get read-only access through RLS, limited to an email allow-list.
-- Writes only go through fin_categorize and fin_set_category (security definer, allow-list checked).
-- No data and no emails in this file: add people with
--   insert into public.app_allowed_users (email) values ('someone@example.com');

create table if not exists public.app_allowed_users (
  email text primary key check (email = lower(email)),
  note text,
  added_at timestamptz not null default now()
);
alter table public.app_allowed_users enable row level security;
revoke all on public.app_allowed_users from public, authenticated, anonymous;

-- True when the JWT user is a verified, unbanned Neon Auth user on the allow-list.
create or replace function public.fin_is_allowed() returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1 from neon_auth."user" u
    join public.app_allowed_users a on a.email = lower(u.email)
    where u.id = auth.uid() and u."emailVerified" and not coalesce(u.banned, false)
  )
$$;

-- RLS on every table; with no policy a table is closed.
alter table public.accounts enable row level security;
alter table public.account_balances enable row level security;
alter table public.budgets enable row level security;
alter table public.categories enable row level security;
alter table public.category_rules enable row level security;
alter table public.import_batches enable row level security;
alter table public.merchants enable row level security;
alter table public.raw_statement_rows enable row level security;
alter table public.transactions enable row level security;

-- Read policies for the tables the (security_invoker) views read from.
create policy allowed_read on public.transactions for select to authenticated using ((select public.fin_is_allowed()));
create policy allowed_read on public.categories for select to authenticated using ((select public.fin_is_allowed()));
create policy allowed_read on public.merchants for select to authenticated using ((select public.fin_is_allowed()));
create policy allowed_read on public.account_balances for select to authenticated using ((select public.fin_is_allowed()));
create policy allowed_read on public.budgets for select to authenticated using ((select public.fin_is_allowed()));

grant usage on schema public to authenticated;
revoke all on all tables in schema public from anonymous, authenticated;
grant select on public.transactions, public.categories, public.merchants, public.account_balances, public.budgets to authenticated;
grant select on public.v_transactions, public.v_monthly_summary, public.v_monthly_by_category, public.v_daily_spend,
  public.v_merchant_summary, public.v_review_queue, public.v_balance_daily, public.v_budget_status to authenticated;

-- The two write functions run as owner and refuse callers not on the allow-list.
create or replace function public.fin_set_category(p_txn_id bigint, p_category_id integer, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $function$
begin
  if not public.fin_is_allowed() then raise exception 'not authorised' using errcode = '42501'; end if;
  update transactions set category_id = p_category_id::smallint, category_source = 'manual',
    note = coalesce(p_note, note), updated_at = now()
  where id = p_txn_id;
end $function$;

create or replace function public.fin_categorize(p_pattern text, p_category_id integer, p_merchant_name text default null, p_match_type text default 'exact')
returns integer language plpgsql security definer set search_path = public, pg_temp as $function$
declare v_merchant int;
begin
  if not public.fin_is_allowed() then raise exception 'not authorised' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_merchant_name, '')), '') is not null then
    insert into merchants (name, default_category_id) values (btrim(p_merchant_name), p_category_id::smallint)
    on conflict (name) do update set default_category_id = excluded.default_category_id
    returning id into v_merchant;
  end if;
  insert into category_rules (pattern, match_type, merchant_id, category_id, priority, created_by)
  values (p_pattern, p_match_type, v_merchant, p_category_id::smallint, 50, 'user')
  on conflict (pattern_norm, match_type) do update set category_id = excluded.category_id,
    merchant_id = coalesce(excluded.merchant_id, category_rules.merchant_id),
    priority = least(category_rules.priority, excluded.priority);
  return fin_apply_rules();
end $function$;

revoke execute on all functions in schema public from public, anonymous, authenticated;
grant execute on function public.fin_is_allowed(), public.fin_set_category(bigint, integer, text),
  public.fin_categorize(text, integer, text, text) to authenticated;
alter default privileges in schema public revoke execute on functions from public;
