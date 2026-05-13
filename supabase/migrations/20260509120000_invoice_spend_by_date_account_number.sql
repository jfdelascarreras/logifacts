-- Daily spend cache: one row per (user, invoice_date, account_number) so rollups match invoice account detail.

alter table public.invoice_spend_by_date
  add column if not exists account_number text not null default '(legacy)';

do $$
declare
  cname text;
begin
  for cname in
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    where t.relname = 'invoice_spend_by_date'
      and t.relnamespace = (select oid from pg_namespace where nspname = 'public')
      and c.contype = 'u'
  loop
    execute format('alter table public.invoice_spend_by_date drop constraint %I', cname);
  end loop;
end $$;

create unique index if not exists invoice_spend_by_date_user_invoice_date_account_uidx
  on public.invoice_spend_by_date (user_id, invoice_date, account_number);
