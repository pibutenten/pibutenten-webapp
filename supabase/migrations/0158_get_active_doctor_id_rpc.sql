-- 0158: get_active_doctor_id RPC — active 신분 단위 doctor 매핑 lookup (2026-05-26)
--
-- 배경 (정한미 원장 우상단 클릭 → 홈으로 튕김 회귀):
--   ADR 0001 (multi-profile identity) 원칙:
--     "같은 auth_user_id 묶음의 모든 profile row 가 동등하게 독립"
--     "의사 vs 회원 구분은 오직 doctor_accounts 매핑 유무로 판단"
--
--   현 RLS 정책 `doctor_accounts_select` = `(auth.uid() = profile_id) OR is_admin()`
--   는 active identity 전환 개념을 모름. PostgreSQL auth.uid() 는 JWT sub 클레임
--   기반이라 항상 최초 auth user.id 만 가리킴 — cookie 로 active 를 의사 본계
--   sub-identity 로 전환해도 auth.uid() 는 primary 그대로.
--
--   정한미 원장 케이스:
--     - auth.uid() = 1b6a2dfd... (너구리 = primary auth user)
--     - 의사 본계 profile.id = 4f5096cc... ≠ auth.uid()
--     - 의사 본계로 active 전환 → /doctor/page.tsx 가 getDoctorIdForProfile(4f5096cc..)
--       → doctor_accounts SELECT 가 RLS 에 차단 → doctorId=null → / redirect.
--
--   이도영 원장은 본계 = primary 라 회귀 없음 (auth.uid() = profile_id 통과).
--   본계가 primary 가 아닌 의사 = 정한미 1명 해당.
--
-- 설계 (사용자 규칙 일치):
--   ADR 0001 의 "active 신분 단위 권한" 정책을 위배하지 않도록:
--     ❌ RLS 정책을 "본인 묶음 전체" 로 확장 (= 묶음 단위 권한 합산 — ADR 위배)
--     ✅ SECURITY DEFINER RPC 로 active 신분의 매핑만 정확히 lookup
--
--   RPC `get_active_doctor_id(p_profile_id)`:
--     1) p_profile_id 가 호출자(auth.uid()) 묶음에 속하는지 검증 (위조 차단)
--     2) 통과 시 그 profile_id 의 doctor_accounts 매핑 반환 (RLS 우회)
--     3) 매핑 없거나 묶음 외 profile 이면 null
--
--   효과:
--     - 정한미 의사 본계로 active → RPC 가 의사 본계 profile.id 매핑 반환 → /doctor 정상
--     - 정한미 너구리로 active 전환 → RPC 가 너구리 profile.id 매핑 lookup → null (너구리
--       는 doctor 매핑 없음) → 의사 권한 자동 상속 차단 (ADR 0001 일치)
--     - 다른 사용자 묶음 profile.id 위조 시 same_group_profile_ids 검증으로 차단
--
--   RLS 정책 doctor_accounts_select 그대로 유지 — 묶음 단위 권한 확장 없음.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_active_doctor_id(p_profile_id uuid)
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT da.doctor_id
  FROM public.doctor_accounts da
  WHERE da.profile_id = p_profile_id
    -- 위조 차단: p_profile_id 가 호출자 묶음에 속하는 경우만
    AND p_profile_id IN (SELECT public.same_group_profile_ids(auth.uid()))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_active_doctor_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_doctor_id(uuid) TO authenticated;

-- 검증: 함수 정의 + owner 확인 (BYPASSRLS 필수)
SELECT p.proname, r.rolname AS owner, r.rolbypassrls
FROM pg_proc p
JOIN pg_roles r ON r.oid = p.proowner
WHERE p.proname = 'get_active_doctor_id';

COMMIT;
