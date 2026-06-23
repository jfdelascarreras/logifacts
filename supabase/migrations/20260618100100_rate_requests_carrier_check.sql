-- Add CHECK constraint to carrier column to include 'ups+fedex' (both-carrier requests).
-- Previous comment said 'ups' | 'fedex' only, but the rate calculator always queries both.
-- Backfill rows written before this migration used 'both' as the value.

UPDATE public.rate_requests SET carrier = 'ups+fedex' WHERE carrier = 'both';

ALTER TABLE public.rate_requests
  ADD CONSTRAINT rate_requests_carrier_check
  CHECK (carrier IN ('ups', 'fedex', 'ups+fedex'));
