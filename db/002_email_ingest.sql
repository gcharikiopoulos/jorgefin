-- Email ingest: the Apps Script ETL (etl/) sends transactions parsed from bank
-- alert emails to fin_ingest_email_transactions(). Nothing else is reachable
-- with the ETL's credential.
--
-- Contract (p_rows is a JSON array, at most 500 items, all values strings):
--   message_id   Gmail message id (required)
--   line_no      0-based index when one email holds several transactions (default 0)
--   received_at  ISO timestamp of the email
--   sender, subject
--   alert_type   'account_alert' | 'card_alert'
--   account_mask masked account or card number as printed in the email, e.g. '***123'
--   txn_date     'YYYY-MM-DD'
--   txn_time     'HH:MM' (optional, Europe/Athens local time)
--   amount       '1234.56' (dot decimal, positive)
--   direction    'debit' | 'credit'
--   description  merchant or payee text
--   cardholder   optional
--   snippet      short source text for troubleshooting (optional)
--
-- Re-sending the same email is harmless: staging is keyed on (message_id, line_no)
-- and transactions on (source, external_id) with external_id = message_id:line_no.

create table if not exists public.raw_email_transactions (
  id bigint generated always as identity primary key,
  message_id text not null,
  line_no int not null default 0,
  received_at timestamptz,
  sender text,
  subject text,
  alert_type text,
  account_mask text,
  txn_date text,
  txn_time text,
  amount text,
  direction text,
  description text,
  cardholder text,
  snippet text,
  batch_id int references public.import_batches(id) on delete set null,
  transaction_id bigint references public.transactions(id) on delete set null,
  status text not null default 'staged' check (status in ('staged', 'inserted', 'duplicate', 'rejected')),
  error text,
  loaded_at timestamptz not null default now(),
  unique (message_id, line_no)
);
alter table public.raw_email_transactions enable row level security;
revoke all on public.raw_email_transactions from public, authenticated, anonymous;

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
  v_duplicate int := 0;
  v_rejected int := 0;
  v_matched int := 0;
  v_account smallint;
  v_digits text;
  v_date date;
  v_amount numeric;
  v_txn_id bigint;
  v_batch int;
  v_batches int[] := '{}';
  v_error text;
  r record;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'at most 500 rows per call' using errcode = '22023';
  end if;

  -- 1. Stage every row as received (text only), skipping ones seen before.
  for v_row in select * from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row) <> 'object' or nullif(btrim(v_row->>'message_id'), '') is null then
      v_rejected := v_rejected + 1;
      continue;
    end if;
    insert into raw_email_transactions (message_id, line_no, received_at, sender, subject, alert_type, account_mask,
      txn_date, txn_time, amount, direction, description, cardholder, snippet)
    values (
      left(btrim(v_row->>'message_id'), 100),
      coalesce(nullif(v_row->>'line_no', '')::int, 0),
      case when (v_row->>'received_at') ~ '^\d{4}-\d{2}-\d{2}T' then (v_row->>'received_at')::timestamptz end,
      left(v_row->>'sender', 200), left(v_row->>'subject', 300), left(v_row->>'alert_type', 30),
      left(v_row->>'account_mask', 40), left(v_row->>'txn_date', 20), left(v_row->>'txn_time', 10),
      left(v_row->>'amount', 30), left(v_row->>'direction', 10), left(v_row->>'description', 300),
      left(v_row->>'cardholder', 100), left(v_row->>'snippet', 500))
    on conflict (message_id, line_no) do nothing
    returning id into v_raw_id;
    if v_raw_id is not null then v_new_raw := v_new_raw + 1; end if;
    v_staged := v_staged + 1;
  end loop;

  -- 2. Validate and load the rows not yet processed.
  for r in select * from raw_email_transactions where status = 'staged' order by id loop
    v_error := null;
    v_account := null;
    begin
      if r.alert_type not in ('account_alert', 'card_alert') then v_error := 'unknown alert_type'; end if;
      if v_error is null and r.direction not in ('debit', 'credit') then v_error := 'direction must be debit or credit'; end if;
      if v_error is null and coalesce(r.txn_date, '') !~ '^\d{4}-\d{2}-\d{2}$' then v_error := 'txn_date must be YYYY-MM-DD'; end if;
      if v_error is null and coalesce(r.txn_time, '') <> '' and r.txn_time !~ '^\d{1,2}:\d{2}$' then v_error := 'txn_time must be HH:MM'; end if;
      if v_error is null and coalesce(r.amount, '') !~ '^\d+(\.\d{1,2})?$' then v_error := 'amount must be a positive number like 12.34'; end if;
      if v_error is null and nullif(fin_clean(r.description), '') is null then v_error := 'empty description'; end if;
      if v_error is null then
        v_date := r.txn_date::date;
        v_amount := r.amount::numeric;
        -- Account: digits of the printed mask must end the account's alert mask or IBAN.
        -- With no match and exactly one account on file, that account is used.
        v_digits := regexp_replace(coalesce(r.account_mask, ''), '\D', '', 'g');
        if v_digits <> '' then
          select a.id into v_account from accounts a
          where right(regexp_replace(coalesce(a.alert_mask, ''), '\D', '', 'g'), length(v_digits)) = v_digits
             or right(regexp_replace(coalesce(a.iban, ''), '\D', '', 'g'), length(v_digits)) = v_digits
          order by a.id limit 1;
        end if;
        if v_account is null and (select count(*) from accounts) = 1 then
          select id into v_account from accounts;
        end if;
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

    -- One import batch per account and alert type per call.
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
    values (v_account, v_batch, r.alert_type, r.message_id || ':' || r.line_no, v_date, v_date,
      case when coalesce(r.txn_time, '') <> '' then (v_date + r.txn_time::time) at time zone 'Europe/Athens' end,
      fin_clean(r.description), v_amount, r.direction,
      case when r.alert_type = 'card_alert' then (case when r.direction = 'debit' then 'card_purchase' else 'card_refund' end) else 'other' end,
      nullif(btrim(r.cardholder), ''))
    on conflict do nothing
    returning id into v_txn_id;

    if v_txn_id is null then
      update raw_email_transactions set status = 'duplicate', batch_id = v_batch,
        transaction_id = (select t.id from transactions t where t.source = r.alert_type and t.external_id = r.message_id || ':' || r.line_no)
      where id = r.id;
      v_duplicate := v_duplicate + 1;
    else
      update raw_email_transactions set status = 'inserted', batch_id = v_batch, transaction_id = v_txn_id where id = r.id;
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  -- 3. Categorise and close the batches.
  foreach v_batch in array v_batches loop
    v_matched := v_matched + fin_apply_rules(v_batch);
    update import_batches b set
      rows_staged = s.staged, rows_inserted = s.inserted, rows_duplicate = s.duplicate, rows_rejected = 0,
      status = 'processed', processed_at = now()
    from (select count(*) staged, count(*) filter (where status = 'inserted') inserted, count(*) filter (where status = 'duplicate') duplicate
          from raw_email_transactions where batch_id = v_batch) s
    where b.id = v_batch;
  end loop;

  return jsonb_build_object('received', jsonb_array_length(p_rows), 'new', v_new_raw, 'inserted', v_inserted,
    'duplicates', v_duplicate + (v_staged - v_new_raw), 'rejected', v_rejected, 'matched_by_rules', v_matched);
end
$function$;

revoke all on function public.fin_ingest_email_transactions(jsonb) from public, anonymous, authenticated;

-- Login role for the ETL: may call the ingest function and nothing else.
-- Created without a password; set one yourself in the Neon SQL Editor (see etl/README.md):
--   alter role etl_ingest with login password '<long random password>';
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'etl_ingest') then
    create role etl_ingest nologin noinherit;
  end if;
end $$;
revoke all on schema public from etl_ingest;
grant usage on schema public to etl_ingest;
grant execute on function public.fin_ingest_email_transactions(jsonb) to etl_ingest;
