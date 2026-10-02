-- Dedup between the three ways one payment can arrive:
--   account alert  (alerts@ - account, amount, type; no merchant)
--   card alert     (ebanking@ - card, amount, merchant; arrives seconds before the account alert)
--   statement row  (statement CSV, imported later; authoritative)
--
-- Rules
--   card <-> account alert  same account, amount and direction, times within 10 minutes:
--                           one transaction; the card alert supplies the merchant as description.
--   alert <-> statement     same account, amount and direction, alert date within one day of the
--                           statement's value/posting dates: one transaction; the statement's data
--                           wins, the row keeps its id, category and note.
-- transactions.merged_refs lists the alerts folded into a row ('<alert_type>:<message_id>:<line>'),
-- which is what stops the same alert being matched twice.
-- Idempotent: safe to run again.

alter table public.transactions add column if not exists merged_refs text[] not null default '{}';
alter table public.accounts add column if not exists card_masks text[] not null default '{}';

alter table public.raw_email_transactions add column if not exists currency text;
alter table public.raw_email_transactions add column if not exists txn_type text;
alter table public.raw_email_transactions drop constraint if exists raw_email_transactions_status_check;
alter table public.raw_email_transactions add constraint raw_email_transactions_status_check
  check (status in ('staged', 'inserted', 'matched', 'duplicate', 'rejected'));

-- Resolves the account from a printed account or card mask ('***123', '****1111').
create or replace function public.fin_account_for_mask(p_mask text)
returns smallint
language sql
stable
set search_path = public, pg_temp
as $$
  with d as (select regexp_replace(coalesce(p_mask, ''), '\D', '', 'g') as digits)
  select coalesce(
    (select a.id from accounts a, d
      where d.digits <> ''
        and (right(regexp_replace(coalesce(a.alert_mask, ''), '\D', '', 'g'), length(d.digits)) = d.digits
          or right(regexp_replace(coalesce(a.iban, ''), '\D', '', 'g'), length(d.digits)) = d.digits
          or exists (select 1 from unnest(a.card_masks) m where right(regexp_replace(m, '\D', '', 'g'), length(d.digits)) = d.digits))
      order by a.id limit 1),
    (select min(id) from accounts having count(*) = 1)
  )
$$;
revoke all on function public.fin_account_for_mask(text) from public, anonymous, authenticated;

create or replace function public.fin_ingest_email_transactions(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_row jsonb;
  v_raw_id bigint;
  v_new_raw int := 0;
  v_staged int := 0;
  v_inserted int := 0;
  v_matched int := 0;
  v_duplicate int := 0;
  v_rejected int := 0;
  v_waiting int := 0;
  v_ruled int := 0;
  v_account smallint;
  v_date date;
  v_at timestamptz;
  v_amount numeric;
  v_currency text;
  v_ext text;
  v_ref text;
  v_target bigint;
  v_txn_id bigint;
  v_batch int;
  v_batches int[] := '{}';
  v_rerule int[] := '{}';
  v_error text;
  r record;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'at most 500 rows per call' using errcode = '22023';
  end if;

  -- 1. Stage every row as received (text only); an email seen before is skipped here.
  for v_row in select * from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row) <> 'object' or nullif(btrim(v_row->>'message_id'), '') is null then
      v_rejected := v_rejected + 1;
      continue;
    end if;
    insert into raw_email_transactions (message_id, line_no, received_at, sender, subject, alert_type, account_mask,
      txn_date, txn_time, amount, currency, direction, txn_type, description, cardholder, snippet)
    values (
      left(btrim(v_row->>'message_id'), 100),
      coalesce(nullif(v_row->>'line_no', '')::int, 0),
      case when (v_row->>'received_at') ~ '^\d{4}-\d{2}-\d{2}T' then (v_row->>'received_at')::timestamptz end,
      left(v_row->>'sender', 200), left(v_row->>'subject', 300), left(v_row->>'alert_type', 30),
      left(v_row->>'account_mask', 40), left(v_row->>'txn_date', 20), left(v_row->>'txn_time', 10),
      left(v_row->>'amount', 30), left(upper(v_row->>'currency'), 3), left(v_row->>'direction', 10),
      left(v_row->>'txn_type', 30), left(v_row->>'description', 300),
      left(v_row->>'cardholder', 100), left(v_row->>'snippet', 500))
    on conflict (message_id, line_no) do nothing
    returning id into v_raw_id;
    if v_raw_id is not null then v_new_raw := v_new_raw + 1; end if;
    v_staged := v_staged + 1;
  end loop;

  -- 2. Validate, match and load everything still staged, oldest transaction first.
  for r in select * from raw_email_transactions where status = 'staged'
           order by txn_date, txn_time nulls first, id loop
    v_error := null;
    v_account := null;
    v_target := null;
    begin
      if r.alert_type not in ('account_alert', 'card_alert') then v_error := 'unknown alert_type'; end if;
      if v_error is null and r.direction not in ('debit', 'credit') then v_error := 'direction must be debit or credit'; end if;
      if v_error is null and coalesce(r.txn_date, '') !~ '^\d{4}-\d{2}-\d{2}$' then v_error := 'txn_date must be YYYY-MM-DD'; end if;
      if v_error is null and coalesce(r.txn_time, '') <> '' and r.txn_time !~ '^\d{1,2}:\d{2}$' then v_error := 'txn_time must be HH:MM'; end if;
      if v_error is null and coalesce(r.amount, '') !~ '^\d+(\.\d{1,2})?$' then v_error := 'amount must be a positive number like 12.34'; end if;
      if v_error is null and coalesce(r.currency, 'EUR') !~ '^[A-Z]{3}$' then v_error := 'currency must be a 3-letter code'; end if;
      if v_error is null and coalesce(r.txn_type, 'other') not in ('card_purchase', 'card_refund', 'atm_withdrawal', 'transfer', 'payment', 'other') then v_error := 'unknown txn_type'; end if;
      if v_error is null and nullif(fin_clean(r.description), '') is null then v_error := 'empty description'; end if;
      if v_error is null then
        v_date := r.txn_date::date;
        v_amount := r.amount::numeric;
        v_currency := coalesce(r.currency, 'EUR');
        v_at := case when coalesce(r.txn_time, '') <> '' then (v_date + r.txn_time::time) at time zone 'Europe/Athens' end;
        v_account := fin_account_for_mask(r.account_mask);
        if v_account is null then v_error := 'no account matches the mask'; end if;
      end if;
    exception when others then
      v_error := 'unparseable: ' || sqlerrm;
    end;

    if v_error is not null then
      update raw_email_transactions set status = 'rejected', error = v_error where id = r.id;
      v_rejected := v_rejected + 1;
      continue;
    end if;

    v_ext := r.message_id || ':' || r.line_no;
    v_ref := r.alert_type || ':' || v_ext;

    -- Already loaded or merged somewhere (e.g. staging was reset)?
    select t.id into v_target from transactions t
    where (t.source = r.alert_type and t.external_id = v_ext) or v_ref = any (t.merged_refs)
    limit 1;
    if v_target is not null then
      update raw_email_transactions set status = 'duplicate', transaction_id = v_target where id = r.id;
      v_duplicate := v_duplicate + 1;
      continue;
    end if;

    -- a) A statement row for the same payment already exists: link to it (EUR amounts only).
    if v_currency = 'EUR' then
      select t.id into v_target from transactions t
      where t.account_id = v_account and t.source = 'statement_csv' and t.direction = r.direction and t.amount = v_amount
        and v_date between least(t.posting_date, coalesce(t.value_date, t.posting_date)) - 1
                       and greatest(t.posting_date, coalesce(t.value_date, t.posting_date)) + 1
        and not exists (select 1 from unnest(t.merged_refs) x where x like r.alert_type || ':%')
      order by abs(coalesce(t.value_date, t.posting_date) - v_date), t.id
      limit 1;
      if v_target is not null then
        update transactions set merged_refs = merged_refs || v_ref, updated_at = now() where id = v_target;
        update raw_email_transactions set status = 'matched', transaction_id = v_target where id = r.id;
        v_matched := v_matched + 1;
        continue;
      end if;
    end if;

    -- b) The other alert for the same payment already exists.
    if r.alert_type = 'card_alert' then
      select t.id into v_target from transactions t
      where t.account_id = v_account and t.source = 'account_alert' and t.direction = r.direction
        and (t.amount = v_amount or v_currency <> 'EUR')
        and ((v_at is not null and t.txn_at between v_at - interval '10 minutes' and v_at + interval '10 minutes')
             or (v_at is null and t.posting_date = v_date))
        and not exists (select 1 from unnest(t.merged_refs) x where x like 'card_alert:%')
      order by abs(extract(epoch from (t.txn_at - coalesce(v_at, t.txn_at)))), t.id
      limit 1;
      if v_target is not null then
        -- The card alert names the merchant: use it as the description.
        update transactions set
          description = fin_clean(r.description),
          txn_type = case when txn_type = 'other' then coalesce(r.txn_type, case when r.direction = 'debit' then 'card_purchase' else 'card_refund' end) else txn_type end,
          cardholder = coalesce(cardholder, nullif(btrim(r.cardholder), '')),
          merged_refs = merged_refs || v_ref,
          updated_at = now()
        where id = v_target
        returning batch_id into v_batch;
        if v_batch is not null and not v_batch = any (v_rerule) then v_rerule := v_rerule || v_batch; end if;
        update raw_email_transactions set status = 'matched', transaction_id = v_target where id = r.id;
        v_matched := v_matched + 1;
        continue;
      end if;
      -- Foreign-currency card payment: the EUR amount only comes with the account alert. Wait for it
      -- (it stays staged and is retried next run); give up after three days.
      if v_currency <> 'EUR' then
        if r.loaded_at < now() - interval '3 days' then
          update raw_email_transactions set status = 'rejected', error = 'foreign-currency card payment with no matching account alert' where id = r.id;
          v_rejected := v_rejected + 1;
        else
          v_waiting := v_waiting + 1;
        end if;
        continue;
      end if;
    else
      select t.id into v_target from transactions t
      where t.account_id = v_account and t.source = 'card_alert' and t.direction = r.direction and t.amount = v_amount
        and ((v_at is not null and t.txn_at between v_at - interval '10 minutes' and v_at + interval '10 minutes')
             or (v_at is null and t.posting_date = v_date))
        and not exists (select 1 from unnest(t.merged_refs) x where x like 'account_alert:%')
      order by abs(extract(epoch from (t.txn_at - coalesce(v_at, t.txn_at)))), t.id
      limit 1;
      if v_target is not null then
        update transactions set merged_refs = merged_refs || v_ref, updated_at = now() where id = v_target;
        update raw_email_transactions set status = 'matched', transaction_id = v_target where id = r.id;
        v_matched := v_matched + 1;
        continue;
      end if;
    end if;

    -- c) New payment: insert it.
    select b.id into v_batch from import_batches b
    where b.id = any (v_batches) and b.account_id = v_account and b.source = r.alert_type;
    if v_batch is null then
      insert into import_batches (account_id, source, file_name, status)
      values (v_account, r.alert_type, 'gmail ' || to_char(now() at time zone 'Europe/Athens', 'YYYY-MM-DD HH24:MI'), 'staged')
      returning id into v_batch;
      v_batches := v_batches || v_batch;
    end if;

    v_txn_id := null;
    insert into transactions (account_id, batch_id, source, external_id, posting_date, value_date, txn_at,
      description, amount, direction, txn_type, cardholder)
    values (v_account, v_batch, r.alert_type, v_ext, v_date, v_date, v_at,
      fin_clean(r.description), v_amount, r.direction,
      coalesce(r.txn_type, case when r.alert_type = 'card_alert' then (case when r.direction = 'debit' then 'card_purchase' else 'card_refund' end) else 'other' end),
      nullif(btrim(r.cardholder), ''))
    on conflict do nothing
    returning id into v_txn_id;

    if v_txn_id is null then
      update raw_email_transactions set status = 'duplicate', batch_id = v_batch where id = r.id;
      v_duplicate := v_duplicate + 1;
    else
      update raw_email_transactions set status = 'inserted', batch_id = v_batch, transaction_id = v_txn_id where id = r.id;
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  -- 3. Categorise new and enriched rows, close the batches.
  foreach v_batch in array v_batches || v_rerule loop
    v_ruled := v_ruled + fin_apply_rules(v_batch);
  end loop;
  foreach v_batch in array v_batches loop
    update import_batches b set
      rows_staged = s.staged, rows_inserted = s.inserted, rows_duplicate = s.duplicate, rows_rejected = 0,
      status = 'processed', processed_at = now()
    from (select count(*) staged, count(*) filter (where status = 'inserted') inserted, count(*) filter (where status = 'duplicate') duplicate
          from raw_email_transactions where batch_id = v_batch) s
    where b.id = v_batch;
  end loop;

  return jsonb_build_object('received', jsonb_array_length(p_rows), 'new', v_new_raw, 'inserted', v_inserted,
    'matched', v_matched, 'duplicates', v_duplicate + (v_staged - v_new_raw), 'rejected', v_rejected,
    'waiting', v_waiting, 'matched_by_rules', v_ruled);
end
$function$;

revoke all on function public.fin_ingest_email_transactions(jsonb) from public, anonymous, authenticated;
grant execute on function public.fin_ingest_email_transactions(jsonb) to etl_ingest;

-- Statement rows: fold into a matching alert transaction instead of inserting a second row.
create or replace function public.fin_merge_statement_into_alert()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_target bigint;
  v_low date := least(new.posting_date, coalesce(new.value_date, new.posting_date)) - 1;
  v_high date := greatest(new.posting_date, coalesce(new.value_date, new.posting_date)) + 1;
begin
  -- An identical statement row already exists: let the unique index treat it as a duplicate.
  if new.txn_ref is not null and exists (
    select 1 from transactions t
    where t.account_id = new.account_id and t.txn_ref = new.txn_ref and t.amount = new.amount
      and t.direction = new.direction and t.description_norm = fin_normalize(new.description)
  ) then
    return new;
  end if;

  select t.id into v_target from transactions t
  where t.account_id = new.account_id and t.source in ('account_alert', 'card_alert')
    and t.amount = new.amount and t.direction = new.direction
    and t.posting_date between v_low and v_high
  order by abs(t.posting_date - coalesce(new.value_date, new.posting_date)), t.id
  limit 1
  for update skip locked;

  if v_target is null then
    return new;
  end if;

  update transactions t set
    merged_refs = t.merged_refs || (t.source || ':' || t.external_id),
    source = 'statement_csv',
    batch_id = new.batch_id,
    posting_date = new.posting_date,
    value_date = new.value_date,
    description = new.description,
    branch_code = new.branch_code,
    txn_ref = new.txn_ref,
    txn_type = case when new.txn_type <> 'other' then new.txn_type else t.txn_type end,
    updated_at = now()
  where t.id = v_target;
  return null; -- merged; skip the insert
end
$function$;

drop trigger if exists transactions_merge_statement on public.transactions;
create trigger transactions_merge_statement
  before insert on public.transactions
  for each row when (new.source = 'statement_csv')
  execute function public.fin_merge_statement_into_alert();
