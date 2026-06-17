-- Per-user UPS/FedEx contract discount rates (Shipment Calculator + Premium Analysis).

CREATE TABLE public.user_contract_discounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  transportation numeric(5, 4) CHECK (transportation IS NULL OR (transportation >= 0 AND transportation <= 0.95)),
  fuel_surcharge numeric(5, 4) CHECK (fuel_surcharge IS NULL OR (fuel_surcharge >= 0 AND fuel_surcharge <= 0.95)),
  residential numeric(5, 4) CHECK (residential IS NULL OR (residential >= 0 AND residential <= 0.95)),
  das numeric(5, 4) CHECK (das IS NULL OR (das >= 0 AND das <= 0.95)),
  additional_handling numeric(5, 4) CHECK (additional_handling IS NULL OR (additional_handling >= 0 AND additional_handling <= 0.95)),
  large_package numeric(5, 4) CHECK (large_package IS NULL OR (large_package >= 0 AND large_package <= 0.95)),
  address_correction numeric(5, 4) CHECK (address_correction IS NULL OR (address_correction >= 0 AND address_correction <= 0.95)),
  declared_value numeric(5, 4) CHECK (declared_value IS NULL OR (declared_value >= 0 AND declared_value <= 0.95)),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_contract_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_contract_discounts_select_own
  ON public.user_contract_discounts FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY user_contract_discounts_insert_own
  ON public.user_contract_discounts FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY user_contract_discounts_update_own
  ON public.user_contract_discounts FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY user_contract_discounts_delete_own
  ON public.user_contract_discounts FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.touch_user_contract_discounts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_contract_discounts_updated_at
  BEFORE UPDATE ON public.user_contract_discounts
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_user_contract_discounts_updated_at();

-- Backfill from legacy auth.users.user_metadata.contract_discounts (camelCase JSON keys).
INSERT INTO public.user_contract_discounts (
  user_id,
  transportation,
  fuel_surcharge,
  residential,
  das,
  additional_handling,
  large_package,
  address_correction,
  declared_value
)
SELECT
  u.id,
  NULLIF(u.raw_user_meta_data->'contract_discounts'->>'transportation', '')::numeric,
  NULLIF(u.raw_user_meta_data->'contract_discounts'->>'fuelSurcharge', '')::numeric,
  NULLIF(u.raw_user_meta_data->'contract_discounts'->>'residential', '')::numeric,
  NULLIF(u.raw_user_meta_data->'contract_discounts'->>'das', '')::numeric,
  NULLIF(u.raw_user_meta_data->'contract_discounts'->>'additionalHandling', '')::numeric,
  NULLIF(u.raw_user_meta_data->'contract_discounts'->>'largePackage', '')::numeric,
  NULLIF(u.raw_user_meta_data->'contract_discounts'->>'addressCorrection', '')::numeric,
  NULLIF(u.raw_user_meta_data->'contract_discounts'->>'declaredValue', '')::numeric
FROM auth.users u
WHERE jsonb_typeof(u.raw_user_meta_data->'contract_discounts') = 'object'
ON CONFLICT (user_id) DO NOTHING;
