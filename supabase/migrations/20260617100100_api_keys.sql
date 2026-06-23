-- Static API keys for the external rate-calculator endpoint.
-- The plaintext key is never stored; only its SHA-256 hex digest.
-- key_prefix (first 8 chars) is kept for admin display (e.g. "lf_ab12cd34").

CREATE TABLE public.api_keys (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  text        NOT NULL REFERENCES public.customers(customer_id) ON DELETE CASCADE,
  key_hash     text        UNIQUE NOT NULL,
  key_prefix   text        NOT NULL,
  active       boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX api_keys_customer_id_idx ON public.api_keys (customer_id);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
