-- 0339_api_rate_limits_purge.sql
--
-- Goal: prevent unbounded growth of api_rate_limits.
--
-- Context:
--   - Table has no purge path (migration 0105). Measured 1,848 rows on 2026-07-04.
--   - Max window in use: 86,400 s (24 h) -- find_duplicate_profiles_day bucket.
--   - Retention cutoff: now() - INTERVAL '2 days'  (2x max-window = 48 h).
--     Any row older than 48 h is at least 1 full window past expiry and is safe
--     to delete regardless of bucket type.
--   - window_start index (api_rate_limits_window_idx) already exists -> DELETE is
--     index-scan, not seq-scan.
--   - Purge is opportunistic: fires only when random() < 0.02 (approx 1-in-50
--     calls). This check is evaluated at the top of the function before any I/O,
--     so the 98% path has zero extra cost.
--
-- Strategy: CREATE OR REPLACE -- signature, SECURITY DEFINER, search_path,
-- owner, and ACL (proacl=NULL => PUBLIC EXECUTE) are all preserved by Postgres
-- when using CREATE OR REPLACE on a matching signature. No GRANT/REVOKE needed.

CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
  p_bucket_key     text,
  p_max_count      integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start  timestamptz;
  v_current_count integer;
BEGIN
  -- Opportunistic purge: ~2% of calls clean up expired windows.
  -- Cutoff = 2x max window (86400 s = 24 h) => 48 h retention.
  -- Uses api_rate_limits_window_idx for an efficient range delete.
  IF random() < 0.02 THEN
    DELETE FROM public.api_rate_limits
    WHERE window_start < now() - INTERVAL '2 days';
  END IF;

  -- Window start = floor(now) to window_seconds boundary.
  v_window_start := date_trunc('seconds', now())
                  - (EXTRACT(EPOCH FROM date_trunc('seconds', now()))::bigint
                     % p_window_seconds) * INTERVAL '1 second';

  -- Upsert: increment existing counter or insert fresh row.
  INSERT INTO public.api_rate_limits (bucket_key, window_start, count)
  VALUES (p_bucket_key, v_window_start, 1)
  ON CONFLICT (bucket_key, window_start)
  DO UPDATE SET count = public.api_rate_limits.count + 1
  RETURNING count INTO v_current_count;

  RETURN v_current_count <= p_max_count;
END;
$$;
