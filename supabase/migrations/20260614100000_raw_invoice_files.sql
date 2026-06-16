-- S6: optional raw multipart file retention for re-parse / audit (behind RAW_INVOICE_FILES_RETAIN=1).

create table if not exists public.raw_invoice_files (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  filename            text not null,
  carrier             text,
  content_sha256      text not null,
  byte_size           bigint not null,
  mime_type           text,
  file_payload        bytea,
  source_invoice_id   uuid references public.invoices(id) on delete cascade,
  invoice_upload_id   uuid references public.invoice_uploads(id) on delete set null,
  created_at          timestamptz not null default now()
);

comment on table public.raw_invoice_files is
  'Optional retention of uploaded multipart invoice bytes (FedEx/WWE). UPS CSV remains in invoice_uploads.csv_text.';

create unique index if not exists raw_invoice_files_user_sha_uidx
  on public.raw_invoice_files (user_id, content_sha256);

create index if not exists raw_invoice_files_user_created_idx
  on public.raw_invoice_files (user_id, created_at desc);

alter table public.raw_invoice_files enable row level security;

create policy raw_invoice_files_select_own
  on public.raw_invoice_files for select to authenticated
  using ((select auth.uid()) = user_id);

create policy raw_invoice_files_insert_own
  on public.raw_invoice_files for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy raw_invoice_files_delete_own
  on public.raw_invoice_files for delete to authenticated
  using ((select auth.uid()) = user_id);
