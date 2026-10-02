-- Category editing from the web app: add, rename, recolour, re-parent, reorder, delete.
-- Writes go through these security-definer functions, which check the allow-list,
-- like fin_categorize and fin_set_category. One level of nesting only: a category
-- is either top-level or the child of a top-level category, and a child always has
-- its parent's kind.

-- Every top-level category gets a colour of its own; children without one show
-- their parent's colour. Only fills colours that are not set yet.
with palette(color, i) as (
  select * from unnest(array['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7',
                             '#e34948', '#0e9aa7', '#8a5a44', '#b04fc6', '#7d9c1f', '#d4719a'])
         with ordinality as p(color, i)
), ranked as (
  select id, kind, row_number() over (partition by kind order by sort_order, id) as n
  from public.categories
  where parent_id is null and color is null
)
update public.categories c set color = case r.kind
    when 'expense' then (select color from palette where i = (r.n - 1) % 12 + 1)
    when 'income' then (array['#0b8a3e', '#5aa469', '#2e7d6b'])[(r.n - 1) % 3 + 1]
    else (array['#6c8893', '#8a94a6', '#5f7a8a'])[(r.n - 1) % 3 + 1]
  end
from ranked r
where r.id = c.id;

create or replace function public.fin_save_category(
  p_id integer,            -- null to add a category
  p_name text,
  p_kind text,             -- ignored for a child: it takes its parent's kind
  p_parent_id integer default null,
  p_color text default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_kind text := p_kind;
  v_color text := nullif(btrim(coalesce(p_color, '')), '');
  v_parent categories%rowtype;
  v_id integer := p_id;
  v_sort integer;
begin
  if not public.fin_is_allowed() then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if v_name = '' or length(v_name) > 60 then
    raise exception 'A name of 1 to 60 characters is required' using errcode = '22023';
  end if;
  if v_color is not null and v_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Colour must look like #1a2b3c' using errcode = '22023';
  end if;
  if p_id is not null and not exists (select 1 from categories where id = p_id) then
    raise exception 'Category not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from categories where lower(name) = lower(v_name) and id is distinct from p_id) then
    raise exception 'A category with this name already exists' using errcode = '23505';
  end if;

  if p_parent_id is not null then
    select * into v_parent from categories where id = p_parent_id;
    if not found then
      raise exception 'Parent category not found' using errcode = 'P0002';
    end if;
    if p_parent_id = p_id then
      raise exception 'A category cannot be its own parent' using errcode = '22023';
    end if;
    if v_parent.parent_id is not null then
      raise exception 'Subcategories cannot have subcategories of their own' using errcode = '22023';
    end if;
    if p_id is not null and exists (select 1 from categories where parent_id = p_id) then
      raise exception 'This category has subcategories, so it cannot become one' using errcode = '22023';
    end if;
    v_kind := v_parent.kind;
  end if;
  if v_kind not in ('expense', 'income', 'transfer') then
    raise exception 'Kind must be expense, income or transfer' using errcode = '22023';
  end if;

  if p_id is null then
    -- New categories go last among their siblings.
    select coalesce(max(sort_order), case when p_parent_id is null then 0 else v_parent.sort_order end) + 1 into v_sort
    from categories
    where parent_id is not distinct from p_parent_id and (p_parent_id is not null or kind = v_kind);
    insert into categories (name, kind, parent_id, color, sort_order)
    values (v_name, v_kind, p_parent_id::smallint, v_color, least(v_sort, 32767)::smallint)
    returning id into v_id;
  else
    update categories set name = v_name, kind = v_kind, parent_id = p_parent_id::smallint, color = v_color
    where id = p_id;
    -- Children always share their parent's kind.
    update categories set kind = v_kind where parent_id = p_id and kind <> v_kind;
  end if;
  return v_id;
end
$function$;

-- Deletes a category. Its transactions, rules, merchants and budgets move to
-- p_replace_id, or with no replacement the transactions become uncategorised and
-- the rules and budgets that pointed at it are removed.
create or replace function public.fin_delete_category(p_id integer, p_replace_id integer default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_moved integer;
begin
  if not public.fin_is_allowed() then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if not exists (select 1 from categories where id = p_id) then
    raise exception 'Category not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from categories where parent_id = p_id) then
    raise exception 'Move or delete its subcategories first' using errcode = '22023';
  end if;
  if p_replace_id is not null and (p_replace_id = p_id or not exists (select 1 from categories where id = p_replace_id)) then
    raise exception 'Choose another existing category to move its transactions to' using errcode = '22023';
  end if;

  if p_replace_id is null then
    update transactions set category_id = null, category_source = null, rule_id = null, updated_at = now() where category_id = p_id;
    get diagnostics v_moved = row_count;
    delete from category_rules where category_id = p_id;
    delete from budgets where category_id = p_id;
    update merchants set default_category_id = null where default_category_id = p_id;
  else
    update transactions set category_id = p_replace_id::smallint, updated_at = now() where category_id = p_id;
    get diagnostics v_moved = row_count;
    update category_rules set category_id = p_replace_id::smallint where category_id = p_id;
    update budgets set category_id = p_replace_id::smallint where category_id = p_id;
    update merchants set default_category_id = p_replace_id::smallint where default_category_id = p_id;
  end if;
  delete from categories where id = p_id;
  return v_moved;
end
$function$;

-- Moves a category one place up (-1) or down (+1) among its siblings.
create or replace function public.fin_move_category(p_id integer, p_direction integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_cat categories%rowtype;
  v_other categories%rowtype;
begin
  if not public.fin_is_allowed() then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  select * into v_cat from categories where id = p_id;
  if not found then
    raise exception 'Category not found' using errcode = 'P0002';
  end if;
  if p_direction < 0 then
    select * into v_other from categories c
    where c.parent_id is not distinct from v_cat.parent_id and c.kind = v_cat.kind
      and (c.sort_order, c.id) < (v_cat.sort_order, v_cat.id)
    order by c.sort_order desc, c.id desc
    limit 1;
  else
    select * into v_other from categories c
    where c.parent_id is not distinct from v_cat.parent_id and c.kind = v_cat.kind
      and (c.sort_order, c.id) > (v_cat.sort_order, v_cat.id)
    order by c.sort_order, c.id
    limit 1;
  end if;
  if not found then
    return; -- already first or last
  end if;
  if v_other.sort_order = v_cat.sort_order then
    -- Equal sort orders: separate them first so the swap changes something.
    update categories set sort_order = sort_order + 1 where id = greatest(v_cat.id, v_other.id);
    select * into v_cat from categories where id = p_id;
    select * into v_other from categories where id = v_other.id;
  end if;
  update categories set sort_order = v_other.sort_order where id = v_cat.id;
  update categories set sort_order = v_cat.sort_order where id = v_other.id;
end
$function$;

revoke all on function public.fin_save_category(integer, text, text, integer, text) from public, anonymous;
revoke all on function public.fin_delete_category(integer, integer) from public, anonymous;
revoke all on function public.fin_move_category(integer, integer) from public, anonymous;
grant execute on function public.fin_save_category(integer, text, text, integer, text) to authenticated;
grant execute on function public.fin_delete_category(integer, integer) to authenticated;
grant execute on function public.fin_move_category(integer, integer) to authenticated;
