-- Mastermind / podcast session registrations (leads — not auth users).

create table if not exists public.mastermind_registrations (
  id                uuid primary key default gen_random_uuid(),
  event_slug        text not null default 'upcoming-mastermind',
  email             text not null,
  email_normalized  text not null generated always as (lower(trim(email))) stored,
  full_name         text not null,
  company_name      text not null,
  user_id           uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint mastermind_registrations_email_nonempty check (char_length(trim(email)) > 0),
  constraint mastermind_registrations_full_name_nonempty check (char_length(trim(full_name)) > 0),
  constraint mastermind_registrations_company_name_nonempty check (char_length(trim(company_name)) > 0)
);

comment on table public.mastermind_registrations is
  'Lead registrations for Mastermind / podcast sessions. Optional link to auth.users when the attendee has an account.';

create unique index if not exists mastermind_registrations_event_email_uidx
  on public.mastermind_registrations (event_slug, email_normalized);

create index if not exists mastermind_registrations_user_id_idx
  on public.mastermind_registrations (user_id)
  where user_id is not null;

create index if not exists mastermind_registrations_created_at_idx
  on public.mastermind_registrations (created_at desc);

alter table public.mastermind_registrations enable row level security;

-- No anon/authenticated policies: registrations are written via the server API (service role).
