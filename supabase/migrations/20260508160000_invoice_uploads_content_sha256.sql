-- Content fingerprint for deduplicating invoice uploads (same CSV under different names / folder re-uploads).

alter table if exists public.invoice_uploads
  add column if not exists content_sha256 text;

comment on column public.invoice_uploads.content_sha256 is
  'SHA-256 (hex) of normalized CSV text; used to skip duplicate uploads regardless of file name.';

create index if not exists invoice_uploads_user_content_sha256_idx
  on public.invoice_uploads (user_id, content_sha256)
  where content_sha256 is not null;
