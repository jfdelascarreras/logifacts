-- RLS policies for portal users (authenticated customers reading their own data).
-- All write operations go through API routes that use the admin client (service role),
-- so only SELECT policies are needed here.

-- customers: each user reads only their own row
CREATE POLICY "customers: portal owner read"
  ON public.customers
  FOR SELECT
  USING (auth.uid() = user_id);

-- api_keys: customer reads keys belonging to their customer_id
CREATE POLICY "api_keys: portal owner read"
  ON public.api_keys
  FOR SELECT
  USING (
    customer_id IN (
      SELECT customer_id FROM public.customers WHERE user_id = auth.uid()
    )
  );

-- rate_requests: customer reads requests scoped to their customer_id
CREATE POLICY "rate_requests: portal owner read"
  ON public.rate_requests
  FOR SELECT
  USING (
    customer_id IN (
      SELECT customer_id FROM public.customers WHERE user_id = auth.uid()
    )
  );
