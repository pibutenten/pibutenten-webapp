-- 0337: Drop invalid DEFAULT 'diary' from cards.category
--
-- Background:
--   cards.category is NOT NULL with CHECK (category IN ('qa','doodle','review','review_summary')).
--   The column had DEFAULT 'diary' which violates its own CHECK constraint ('diary' was
--   a retired category not present in the 4-value allowlist).
--   This default was never reached in practice: all INSERT paths (api/articles POST,
--   admin draft publish, procedure review RPCs) supply category explicitly.
--   Dropping the default means any future INSERT that omits category raises error 23502
--   (NOT NULL violation) immediately, making the omission visible rather than silently
--   inserting an invalid value.
--
-- Change: DROP DEFAULT only. No other DDL. CHECK constraint untouched.
-- Rollback (emergency): ALTER TABLE public.cards ALTER COLUMN category SET DEFAULT 'doodle';
--   Note: 'doodle' is the safest fallback among the 4 allowed values, but DROP is preferred.

ALTER TABLE public.cards ALTER COLUMN category DROP DEFAULT;
