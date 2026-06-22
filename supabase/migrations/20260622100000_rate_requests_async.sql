-- Async webhook support for rate_requests.
-- Adds callback_url, delivery tracking columns, and expands the status enum.

ALTER TABLE public.rate_requests
  ADD COLUMN callback_url        text,
  ADD COLUMN delivery_attempts   integer     NOT NULL DEFAULT 0,
  ADD COLUMN delivered_at        timestamptz;

-- Expand status to include 'delivery_failed'.
-- Existing values: 'pending' | 'completed' | 'error'
ALTER TABLE public.rate_requests
  ADD CONSTRAINT rate_requests_status_check
  CHECK (status IN ('pending', 'completed', 'error', 'delivery_failed'));

-- Index for the polling endpoint (customer-scoped lookup by request_id is already on PK,
-- but we want fast lookups of pending/in-flight async requests per customer).
CREATE INDEX rate_requests_customer_id_status_idx
  ON public.rate_requests (customer_id, status)
  WHERE callback_url IS NOT NULL;
