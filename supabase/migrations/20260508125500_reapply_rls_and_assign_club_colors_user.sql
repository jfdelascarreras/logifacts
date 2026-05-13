-- Reapply security + data assignment in an executable migration.
-- Ensures Club Colors data is linked to jfdelascarreras@logifacts.com.

-- RLS enforcement (idempotent)
alter table if exists public.invoice_uploads enable row level security;
alter table if exists public.invoice_upload_analyses enable row level security;
alter table if exists public.invoice_spend_by_date enable row level security;

do $$
declare
  target_user_id uuid;
begin
  -- Ensure policies exist for user-scoped reads/writes.
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='invoice_uploads' and column_name='user_id'
  ) then
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='invoice_uploads' and policyname='invoice_uploads_select_own') then
      create policy invoice_uploads_select_own on public.invoice_uploads for select using (auth.uid() = user_id);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='invoice_uploads' and policyname='invoice_uploads_insert_own') then
      create policy invoice_uploads_insert_own on public.invoice_uploads for insert with check (auth.uid() = user_id);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='invoice_uploads' and policyname='invoice_uploads_update_own') then
      create policy invoice_uploads_update_own on public.invoice_uploads for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='invoice_uploads' and policyname='invoice_uploads_delete_own') then
      create policy invoice_uploads_delete_own on public.invoice_uploads for delete using (auth.uid() = user_id);
    end if;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='invoice_upload_analyses' and column_name='user_id'
  ) then
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='invoice_upload_analyses' and policyname='invoice_upload_analyses_select_own') then
      create policy invoice_upload_analyses_select_own on public.invoice_upload_analyses for select using (auth.uid() = user_id);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='invoice_upload_analyses' and policyname='invoice_upload_analyses_insert_own') then
      create policy invoice_upload_analyses_insert_own on public.invoice_upload_analyses for insert with check (auth.uid() = user_id);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='invoice_upload_analyses' and policyname='invoice_upload_analyses_update_own') then
      create policy invoice_upload_analyses_update_own on public.invoice_upload_analyses for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='invoice_upload_analyses' and policyname='invoice_upload_analyses_delete_own') then
      create policy invoice_upload_analyses_delete_own on public.invoice_upload_analyses for delete using (auth.uid() = user_id);
    end if;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='invoice_spend_by_date' and column_name='user_id'
  ) then
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='invoice_spend_by_date' and policyname='invoice_spend_by_date_select_own') then
      create policy invoice_spend_by_date_select_own on public.invoice_spend_by_date for select using (auth.uid() = user_id);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='invoice_spend_by_date' and policyname='invoice_spend_by_date_insert_own') then
      create policy invoice_spend_by_date_insert_own on public.invoice_spend_by_date for insert with check (auth.uid() = user_id);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='invoice_spend_by_date' and policyname='invoice_spend_by_date_update_own') then
      create policy invoice_spend_by_date_update_own on public.invoice_spend_by_date for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='invoice_spend_by_date' and policyname='invoice_spend_by_date_delete_own') then
      create policy invoice_spend_by_date_delete_own on public.invoice_spend_by_date for delete using (auth.uid() = user_id);
    end if;
  end if;

  -- Link Club Colors data to target user.
  select id into target_user_id
  from auth.users
  where lower(email) = 'jfdelascarreras@logifacts.com'
  limit 1;

  if target_user_id is null then
    raise exception 'Target auth user not found for email %', 'jfdelascarreras@logifacts.com';
  end if;

  update public.invoice_uploads
     set user_id = target_user_id
   where coalesce(csv_text, '') ilike '%CLUB COLOR%';

  update public.invoice_upload_analyses a
     set user_id = target_user_id
    from public.invoice_uploads u
   where a.invoice_upload_id = u.id
     and u.user_id = target_user_id
     and coalesce(u.csv_text, '') ilike '%CLUB COLOR%';

  delete from public.invoice_spend_by_date
   where user_id = target_user_id;
end $$;
