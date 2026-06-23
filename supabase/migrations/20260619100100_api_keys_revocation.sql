-- Revocation tracking for api_keys.
-- revoked_at: set when the key is invalidated (regenerated, compromised, or admin action).
-- revoked_reason: one of 'regenerated' | 'compromised' | 'admin'.

ALTER TABLE public.api_keys
  ADD COLUMN revoked_at     timestamptz,
  ADD COLUMN revoked_reason text;

-- Null revoked_at means the key is still potentially active (check active column).
-- When revoking: set active = false, revoked_at = now(), revoked_reason = '<reason>'.

CREATE INDEX api_keys_revoked_at_idx ON public.api_keys (revoked_at) WHERE revoked_at IS NOT NULL;
