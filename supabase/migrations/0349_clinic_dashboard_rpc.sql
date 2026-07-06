-- 0349_clinic_dashboard_rpc.sql
-- 병원 대시보드(/clinic) 현황 숫자 집계 RPC.
-- 병원이 자기 지점의 환자 연결·대행 작성 노트를 집계 조회(0345 미포함분 — B4 재설계 §3).
-- SECURITY DEFINER + 호출자 병원 명함 검증(auth.uid() 대조, 0345 패턴 계승).
-- diaries 는 회원 소유 RLS 라 병원이 직접 SELECT 불가 → 이 RPC(owner 권한)로만 집계.

CREATE OR REPLACE FUNCTION public.get_clinic_dashboard(p_clinic_profile_id uuid)
RETURNS TABLE (
  patient_total bigint,   -- 연결/대기 환자 합(관리 중)
  pending_count bigint,   -- 동의 대기
  active_count  bigint,   -- 연결됨
  notes_today   bigint,   -- 오늘(KST) 대행 작성 노트
  notes_month   bigint    -- 이번 달(KST) 대행 작성 노트
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_clinic_id bigint;
BEGIN
  -- 병원 명함 검증(호출자 소유 + role=clinic + 소속 지점)
  SELECT p.clinic_id INTO v_clinic_id
  FROM public.profiles p
  WHERE p.id = p_clinic_profile_id
    AND p.auth_user_id = auth.uid()
    AND p.role = 'clinic'
    AND p.clinic_id IS NOT NULL
    AND p.deleted_at IS NULL;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized_clinic' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.clinic_member_links l
       WHERE l.clinic_id = v_clinic_id AND l.status IN ('pending', 'active')),
    (SELECT count(*) FROM public.clinic_member_links l
       WHERE l.clinic_id = v_clinic_id AND l.status = 'pending'),
    (SELECT count(*) FROM public.clinic_member_links l
       WHERE l.clinic_id = v_clinic_id AND l.status = 'active'),
    (SELECT count(*) FROM public.diaries d
       WHERE d.source = 'clinic' AND d.clinic_id = v_clinic_id
         AND (d.created_at AT TIME ZONE 'Asia/Seoul')::date
             = (now() AT TIME ZONE 'Asia/Seoul')::date),
    (SELECT count(*) FROM public.diaries d
       WHERE d.source = 'clinic' AND d.clinic_id = v_clinic_id
         AND date_trunc('month', d.created_at AT TIME ZONE 'Asia/Seoul')
             = date_trunc('month', now() AT TIME ZONE 'Asia/Seoul'));
END;
$$;

REVOKE ALL ON FUNCTION public.get_clinic_dashboard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clinic_dashboard(uuid) TO authenticated;
