-- Deployment ledger for carrier rate files.
-- One row per rate update per carrier. Answers "what rate was in effect on date X"
-- without moving rate data out of JSON. Cross-reference with rate_requests.breakdown->>'rates_version'.

CREATE TABLE public.rate_versions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier        text        NOT NULL CHECK (carrier IN ('ups', 'fedex')),
  effective_date date        NOT NULL,
  deployed_at    timestamptz NOT NULL DEFAULT now(),
  notes          text,
  UNIQUE (carrier, effective_date)
);

ALTER TABLE public.rate_versions ENABLE ROW LEVEL SECURITY;

-- Seed current versions (matches lib/pricing/rates-version.ts)
INSERT INTO public.rate_versions (carrier, effective_date, notes) VALUES
  ('ups',   '2025-12-22', 'UPS 2026 daily rates — daily-rates-us-en.xlsx'),
  ('fedex', '2026-01-05', 'FedEx 2026 list rates — FedEx_Standard_List_Rates_2026.pdf, updated 2026-06-01');
