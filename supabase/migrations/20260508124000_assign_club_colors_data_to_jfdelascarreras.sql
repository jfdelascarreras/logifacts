-- Reassign Club Colors invoice data to a specific user account.
-- Target user: jfdelascarreras@logifacts.com
-- This migration is idempotent and scoped to uploads that contain "CLUB COLOR" in csv_text.

do $$
declare
  target_user_id uuid;
begin
  select id
    into target_user_id
  from auth.users
  where lower(email) = 'jfdelascarreras@logifacts.com'
  limit 1;

  if target_user_id is null then
    raise exception 'Target auth user not found for email %', 'jfdelascarreras@logifacts.com';
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'invoice_uploads'
  ) then
    update public.invoice_uploads
       set user_id = target_user_id
     where coalesce(csv_text, '') ilike '%CLUB COLOR%';
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'invoice_upload_analyses'
  ) then
    update public.invoice_upload_analyses a
       set user_id = target_user_id
      from public.invoice_uploads u
     where a.invoice_upload_id = u.id
       and u.user_id = target_user_id
       and coalesce(u.csv_text, '') ilike '%CLUB COLOR%';
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'invoice_spend_by_date'
  ) then
    -- Reset spend cache for this user; dashboard recompute repopulates from reassigned uploads.
    delete from public.invoice_spend_by_date
     where user_id = target_user_id;
  end if;
end $$;
