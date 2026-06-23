-- Audit log for every external rate-calculator API call.
-- Rows are inserted as 'pending' before calculation and updated to
-- 'completed' or 'error' once the calculation finishes.

CREATE TABLE public.rate_requests (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text        NOT NULL REFERENCES public.customers(customer_id),
  api_key_id  uuid        NOT NULL REFERENCES public.api_keys(id),

  -- request inputs
  origin_zip         text           NOT NULL,
  destination_zip    text           NOT NULL,
  residential        boolean        NOT NULL DEFAULT false,
  weight_lbs         numeric(8, 2)  NOT NULL,
  carrier            text           NOT NULL,  -- 'ups' | 'fedex'
  service_type       text           NOT NULL,
  non_standard       boolean        NOT NULL DEFAULT false,
  address_correction boolean        NOT NULL DEFAULT false,
  markup_pct         numeric(5, 2)  NOT NULL DEFAULT 0,

  -- calculated outputs
  published_rate             numeric(10, 2),
  fuel_surcharge             numeric(10, 2),
  accessorial_charges        numeric(10, 2),
  contract_discount_applied  numeric(10, 2),
  markup_applied             numeric(10, 2),
  final_rate                 numeric(10, 2),
  breakdown                  jsonb,

  -- lifecycle
  status        text        NOT NULL DEFAULT 'pending',  -- 'pending' | 'completed' | 'error'
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);

CREATE INDEX rate_requests_customer_id_idx ON public.rate_requests (customer_id);
CREATE INDEX rate_requests_created_at_idx  ON public.rate_requests (created_at DESC);

ALTER TABLE public.rate_requests ENABLE ROW LEVEL SECURITY;
