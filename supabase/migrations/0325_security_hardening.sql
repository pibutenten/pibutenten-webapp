-- 0325_security_hardening.sql
-- 2026-07-02 -- DB security hardening (package D of improvement plan v2).
--
-- PURPOSE:
--   1) get_research_panel(): add is_admin() guard.
--   2) public.profiles: REVOKE PII columns from anon (defense-in-depth).
--   3) public.follows: REVOKE SELECT FROM anon (defense-in-depth).
--   4) current_active_profile_id(): REVOKE intentionally skipped --
--      cards_public_read (roles={public}) calls this function;
--      revoking EXECUTE from anon would break public card reads.
--
-- APPLICATION: Apply via Supabase Management API (CLAUDE.md sec 8).
--   DO NOT apply to production until reviewed by project director.
--
-- IDEMPOTENCY: CREATE OR REPLACE and REVOKE are both idempotent.

BEGIN;

-- =========================================================================
-- 1) get_research_panel() -- add is_admin() guard
--
-- Background: 0236 rewrote body but omitted authorization check.
--   SECURITY DEFINER + GRANT TO authenticated = any logged-in user can
--   call it and read aggregate member counts (same defect as pre-0119).
-- Strategy: convert sql->plpgsql, prepend guard block (0119 KPI pattern).
--   Return type and search_path unchanged from 0236.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_research_panel()
RETURNS TABLE(total_members integer, active_90d integer, reviewers integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $func$
BEGIN
  -- Admin-only guard (mirrors 0119 pattern for admin KPI functions)
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*)::int
       FROM profiles
      WHERE deleted_at IS NULL),
    (SELECT count(DISTINCT sv.profile_id)::int
       FROM site_visits sv
       JOIN profiles p ON p.id = sv.profile_id
      WHERE p.deleted_at IS NULL
        AND sv.created_at >= now() - interval '90 days'),
    (SELECT count(DISTINCT r.author_id)::int
       FROM procedure_reviews r
       JOIN profiles p ON p.id = r.author_id
      WHERE p.deleted_at IS NULL);
END;
$func$;

-- Preserve GRANT from 0236 (authenticated only; anon never held EXECUTE).
GRANT EXECUTE ON FUNCTION public.get_research_panel() TO authenticated;


-- =========================================================================
-- 2) public.profiles -- REVOKE PII columns from anon (defense-in-depth)
--
-- Background: 0123 whitelisted safe columns for anon. Later migrations
--   added new columns outside that list without GRANTing them to anon.
--   Explicit REVOKE prevents silent re-exposure via future table-level GRANT.
--
-- Live verification (2026-07-02, information_schema.column_privileges):
--   anon SELECT: 16 columns (0123 whitelist subset).
--   None of the 15 PII columns below have anon SELECT. REVOKE is defensive.
--
-- PII classification:
--   birthdate, gender              -- personal demographic data
--   face_shape, skin_type, skin_concerns,
--   interested_procedures          -- personal skin/body profile
--   contact_email                  -- direct contact PII
--   skin_info_consent_at, privacy_agreed_at  -- consent timestamps
--   news_email_consent, news_email_consent_at,
--   marketing_email_consent_at     -- consent flags/timestamps
--   terms_agreed_version, privacy_agreed_version  -- policy version metadata
--   fitzpatrick                    -- skin phototype (health-adjacent data)
-- =========================================================================

REVOKE SELECT (
  birthdate,
  gender,
  face_shape,
  skin_type,
  skin_concerns,
  interested_procedures,
  contact_email,
  skin_info_consent_at,
  privacy_agreed_at,
  news_email_consent,
  news_email_consent_at,
  marketing_email_consent_at,
  terms_agreed_version,
  privacy_agreed_version,
  fitzpatrick
) ON public.profiles FROM anon;


-- =========================================================================
-- 3) public.follows -- REVOKE SELECT from anon (defense-in-depth)
--
-- Verification (2026-07-02):
--   src/ grep .from("follows"): 0 matches -- no app code reads this table.
--   table_privileges: anon holds only REFERENCES, TRIGGER, TRUNCATE.
--   RLS enabled with 0 policies = default-deny already blocks all access.
--   REVOKE adds explicit layer against accidental future table-level GRANT.
--   authenticated is NOT revoked; future follows feature adds GRANT+RLS.
-- =========================================================================

REVOKE SELECT ON public.follows FROM anon;


-- =========================================================================
-- 4) current_active_profile_id() -- REVOKE intentionally omitted
--
-- Live pg_policies check (2026-07-02):
--   cards_public_read (roles={public}, includes anon) references
--   current_active_profile_id() in its qual:
--     author_id = COALESCE(current_active_profile_id(), auth.uid())
--
--   PostgreSQL evaluates the full policy expression per row.
--   Revoking EXECUTE from anon raises permission denied on every
--   anonymous card SELECT, breaking public browsing.
--
-- Resolution path (future work):
--   Split cards_public_read into (a) anon-specific: status='published' only,
--   no function call; (b) authenticated: full logic with current_active_profile_id().
--   After that split, REVOKE EXECUTE FROM anon becomes safe.
-- =========================================================================


COMMIT;

-- -------------------------------------------------------------------------
-- Post-apply verification (run after director applies migration):
--
-- 1) Confirm is_admin() guard:
--    SELECT pg_get_functiondef(oid) FROM pg_proc
--     WHERE proname = 'get_research_panel'
--       AND pronamespace = 'public'::regnamespace;
--
-- 2) Confirm no anon SELECT on PII columns:
--    SELECT column_name FROM information_schema.column_privileges
--     WHERE grantee = 'anon' AND table_schema = 'public'
--       AND table_name = 'profiles' AND privilege_type = 'SELECT'
--     ORDER BY column_name;
--    -- Must NOT include any of the 15 revoked columns.
--
-- 3) Confirm follows anon SELECT revoked:
--    SELECT privilege_type FROM information_schema.table_privileges
--     WHERE grantee = 'anon' AND table_schema = 'public'
--       AND table_name = 'follows' AND privilege_type = 'SELECT';
--    -- Must return 0 rows.
-- -------------------------------------------------------------------------

SELECT '0325_security_hardening OK' AS status;