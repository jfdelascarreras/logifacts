-- Add key_type to api_keys to distinguish live keys from sandbox (test) keys.
-- Sandbox keys route to mock rate logic and return deterministic fake rates.
-- Existing keys default to 'live'.

alter table api_keys
  add column if not exists key_type text not null default 'live'
    check (key_type in ('live', 'test'));

comment on column api_keys.key_type is
  '''live'' = real carrier rates; ''test'' = mock rates (9.99 flat, no carrier calls)';
