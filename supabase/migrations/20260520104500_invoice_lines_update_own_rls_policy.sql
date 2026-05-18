-- Add missing UPDATE policy for invoice_lines so RLS aligns with SELECT/INSERT/DELETE (parent invoice owns row).
-- Same isolation: only lines whose invoice belongs to auth.uid().
-- Applies idempotently (safe when policy already exists, e.g. after manual fixes).

alter table if exists public.invoice_lines enable row level security;

do $$
begin
  if exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'invoice_lines'
    )
    and exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'invoices'
    )
    and not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'invoice_lines'
        and policyname = 'invoice_lines_update_own'
    ) then
    create policy invoice_lines_update_own
      on public.invoice_lines
      for update
      using (
        exists (
          select 1
          from public.invoices i
          where i.id = invoice_lines.invoice_id
            and i.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from public.invoices i
          where i.id = invoice_lines.invoice_id
            and i.user_id = auth.uid()
        )
      );
  end if;
end $$;
