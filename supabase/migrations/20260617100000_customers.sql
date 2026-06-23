-- External API customers: maps a customer_id slug (e.g. 'club_colors') to a Logifacts user.
-- Decoupled from auth so external callers never need to know Supabase UUIDs.

CREATE TABLE public.customers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text        UNIQUE NOT NULL,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
