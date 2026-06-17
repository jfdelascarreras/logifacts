-- Saved package profiles for the Shipment Calculator (per user, max 25).

CREATE TABLE public.user_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  weight_lbs numeric(10, 2) NOT NULL CHECK (weight_lbs > 0),
  length_in numeric(10, 2) NOT NULL CHECK (length_in > 0),
  width_in numeric(10, 2) NOT NULL CHECK (width_in > 0),
  height_in numeric(10, 2) NOT NULL CHECK (height_in > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_products_name_user_unique UNIQUE (user_id, name)
);

CREATE INDEX user_products_user_id_name_idx
  ON public.user_products (user_id, name);

ALTER TABLE public.user_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_products_select_own
  ON public.user_products FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY user_products_insert_own
  ON public.user_products FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY user_products_update_own
  ON public.user_products FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY user_products_delete_own
  ON public.user_products FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.enforce_user_products_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*)::int FROM public.user_products WHERE user_id = NEW.user_id) >= 25 THEN
    RAISE EXCEPTION 'product_limit_reached'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_products_limit_before_insert
  BEFORE INSERT ON public.user_products
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_user_products_limit();

CREATE OR REPLACE FUNCTION public.touch_user_products_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_products_updated_at
  BEFORE UPDATE ON public.user_products
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_user_products_updated_at();
