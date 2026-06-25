-- Fix FK cascades on rate_requests so customer deletion works end-to-end.
--
-- Problem: deleting a customer cascades to api_keys (api_keys has ON DELETE CASCADE),
-- but rate_requests.customer_id and rate_requests.api_key_id have no cascade clause.
-- Postgres blocks the delete with a FK violation before the cascade can run.
--
-- Fix: both FKs get ON DELETE CASCADE so the full chain works:
--   customers → (cascade) → api_keys → (cascade) → rate_requests
--   customers → (cascade) → rate_requests  (via customer_id directly)
--
-- Also adds two missing indexes flagged in the June 2026 audit.

-- 1. rate_requests.customer_id
ALTER TABLE public.rate_requests
  DROP CONSTRAINT rate_requests_customer_id_fkey,
  ADD CONSTRAINT rate_requests_customer_id_fkey
    FOREIGN KEY (customer_id)
    REFERENCES public.customers(customer_id)
    ON DELETE CASCADE;

-- 2. rate_requests.api_key_id
ALTER TABLE public.rate_requests
  DROP CONSTRAINT rate_requests_api_key_id_fkey,
  ADD CONSTRAINT rate_requests_api_key_id_fkey
    FOREIGN KEY (api_key_id)
    REFERENCES public.api_keys(id)
    ON DELETE CASCADE;

-- 3. Index: customers.user_id — used in every RLS subquery
CREATE INDEX IF NOT EXISTS customers_user_id_idx
  ON public.customers (user_id);

-- 4. Index: rate_requests.api_key_id — FK + future reporting queries
CREATE INDEX IF NOT EXISTS rate_requests_api_key_id_idx
  ON public.rate_requests (api_key_id);
