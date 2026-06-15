-- Allow public registration inserts; authenticated users can read/update their own row by email.

create policy mastermind_registrations_insert_public
  on public.mastermind_registrations for insert
  to anon, authenticated
  with check (true);

create policy mastermind_registrations_select_own_email
  on public.mastermind_registrations for select
  to authenticated
  using (
    email_normalized = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );

create policy mastermind_registrations_update_own_email
  on public.mastermind_registrations for update
  to authenticated
  using (
    email_normalized = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  )
  with check (
    email_normalized = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );
