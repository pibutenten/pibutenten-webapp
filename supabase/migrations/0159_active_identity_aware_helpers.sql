-- 0159: GUC 기반 active identity 인식 헬퍼 + 핵심 함수 본문 교체 (2026-05-26)
--
-- ADR 0001 원칙 정합 — Phase 1/3 (가) 안:
--   "묶음 동등 독립 + active 신분 단위 권한"
--
-- 배경:
--   기존 핵심 함수 (is_admin, current_doctor_id, same_group_profile_ids) 와
--   마이그레이션 0153, 0155 의 RLS 정책이 모두 "묶음 단위" 로 동작.
--   너구리(회원) 로 active 전환한 상태에서도 묶음 안에 admin/doctor 매핑이 있으면
--   admin/doctor 권한 자동 상속 → ADR 0001 의 active 단위 권한 원칙 위배.
--
-- 인프라:
--   Supabase 의 PostgREST 는 매 요청의 HTTP 헤더를 GUC `request.headers` (JSON) 로
--   노출. 클라이언트(server/browser supabase client) 가 cookie 의 active profile.id
--   를 읽어 `x-active-profile-id` 헤더로 전송 → DB 함수가 그 값을 읽음.
--
--   `current_active_profile_id()` 헬퍼: 헤더 값 반환, 없으면 NULL.
--   기존 함수들은 active 가 있으면 active 단위, 없으면 auth.uid() (primary) fallback.
--   → 헤더 미설정 레거시 호출자도 정상 동작 (회귀 0).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. current_active_profile_id() — HTTP 헤더 GUC 읽기 헬퍼
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_active_profile_id()
  RETURNS uuid
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_headers json;
  v_active text;
BEGIN
  BEGIN
    v_headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  IF v_headers IS NULL THEN RETURN NULL; END IF;
  v_active := v_headers ->> 'x-active-profile-id';
  IF v_active IS NULL OR v_active = '' THEN RETURN NULL; END IF;
  -- UUID 형식 검증 (위조 차단 1차)
  IF v_active !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  RETURN v_active::uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.current_active_profile_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_active_profile_id() TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────
-- 2. is_admin() — active 인식. fallback: auth.uid() 의 primary profile
--    위조 차단: active profile 이 호출자(auth.uid()) 묶음에 속하는 경우만 인정.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid DEFAULT auth.uid())
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.role = 'admin'
      AND p.id = COALESCE(public.current_active_profile_id(), uid)
      AND (p.id = uid OR p.auth_user_id = uid)
  );
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. current_doctor_id() — active 인식. fallback: auth.uid() 의 primary profile
--    위조 차단: active profile 이 호출자 묶음에 속하는 경우만 매핑 반환.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_doctor_id(uid uuid DEFAULT auth.uid())
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT da.doctor_id
  FROM public.doctor_accounts da
  JOIN public.profiles p ON p.id = da.profile_id
  WHERE p.id = COALESCE(public.current_active_profile_id(), uid)
    AND (p.id = uid OR p.auth_user_id = uid)
  LIMIT 1;
$$;

-- 검증 출력
SELECT 'is_admin redefined' AS step, prosecdef AS sec_definer
FROM pg_proc WHERE proname = 'is_admin';
SELECT 'current_doctor_id redefined' AS step, prosecdef AS sec_definer
FROM pg_proc WHERE proname = 'current_doctor_id';
SELECT 'current_active_profile_id created' AS step, prosecdef AS sec_definer
FROM pg_proc WHERE proname = 'current_active_profile_id';

COMMIT;
