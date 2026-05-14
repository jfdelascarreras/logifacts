-- Structured invoice row storage.
-- One row per unique charge line per user, deduplicated by a composite key of
-- (invoice_number, tracking_number, charge_category_code, charge_category_detail_code, net_amount).
-- Replaces re-parsing raw csv_text on every analysis run.

create table if not exists public.invoice_rows (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  -- Nullable so rows are retained if the source upload record is deleted.
  invoice_upload_id           uuid references public.invoice_uploads(id) on delete set null,
  -- SHA-256 of the 5-field natural key (see invoiceRowHash in dedupe-hash-server.ts).
  row_hash                    text not null,
  created_at                  timestamptz not null default now(),

  -- Analysis fields (all text — matches InvoiceRecord type, avoids coercion at ingest).
  account_number              text,
  invoice_date                text,
  invoice_number              text,
  tracking_number             text,
  charge_category_code        text,
  charge_category_detail_code text,
  charge_classification_code  text,
  charge_description_code     text,
  charge_description          text,
  net_amount                  text,
  invoice_amount              text,
  duty_amount                 text,
  billed_weight               text,
  entered_weight              text,
  package_quantity            text,
  zone                        text,
  carrier_name                text,
  original_service_description text,
  lead_shipment_number        text,
  shipment_reference_number_1 text
);

-- Deduplication: one row per user per charge line regardless of which file it came from.
create unique index if not exists invoice_rows_user_hash_uidx
  on public.invoice_rows (user_id, row_hash);

-- Query performance for date-range and account filters.
create index if not exists invoice_rows_user_date_idx
  on public.invoice_rows (user_id, invoice_date);

create index if not exists invoice_rows_user_account_idx
  on public.invoice_rows (user_id, account_number);

-- RLS: users may only access their own rows.
alter table public.invoice_rows enable row level security;

create policy "invoice_rows: users read own rows"
  on public.invoice_rows for select
  using (auth.uid() = user_id);

create policy "invoice_rows: users insert own rows"
  on public.invoice_rows for insert
  with check (auth.uid() = user_id);

create policy "invoice_rows: users delete own rows"
  on public.invoice_rows for delete
  using (auth.uid() = user_id);
