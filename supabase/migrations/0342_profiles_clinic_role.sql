-- 0342_profiles_clinic_role.sql
-- 병원 계정 · 시술노트 대행 — Part B: profiles 에 clinic 역할·소속·실명 도입 (2026-07-05)
--
-- 계획 SSOT: docs/plans/260704 병원계정 시술기록 대행입력 계획.md §5.1·§C·§D-B1·§E-H4·§E-H5·§E-H6
--
-- ★★ 적용은 반드시 2회의 개별 POST 로 나눈다 (§D-B1) ★★
--   profiles.role 은 PostgreSQL ENUM(public.user_role, 현 admin/doctor/user/developer).
--   ALTER TYPE ... ADD VALUE 는 ① 트랜잭션(BEGIN/COMMIT) 안에서 실행 불가,
--   ② 같은 트랜잭션 안에서 방금 추가한 새 값을 사용 불가.
--   따라서:
--     Part 1 = ALTER TYPE ADD VALUE 'clinic' 단독(트랜잭션 밖) → 커밋 확인
--     Part 2 = 나머지 DDL(BEGIN/COMMIT) — clinic_id·legal_name·is_clinic·reserved_handles
--   0152(qa_status ADD VALUE 'hidden') 선례와 동일 패턴.

-- ============================================================================
-- Part 1 — 트랜잭션 밖 단독 실행 (첫 번째 POST). BEGIN/COMMIT 로 감싸지 말 것.
-- ============================================================================
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'clinic';

-- ============================================================================
-- Part 2 — 별도 트랜잭션 (두 번째 POST). Part 1 커밋 확인 후 실행.
--   ('clinic' 라벨을 이 블록에서 참조하므로 반드시 별 트랜잭션이어야 한다.)
-- ============================================================================
BEGIN;

-- 1. profiles.clinic_id — role='clinic' 병원 명함의 소속 지점(건보 심평원 clinics 코드 참조, 불변).
--    doctor_id 와 대칭. clinics 원본은 수정하지 않는다. 지점 삭제 시 NULL(하드삭제 정책상 실제 삭제는 없음).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS clinic_id bigint REFERENCES public.clinics(id) ON DELETE SET NULL;

-- 2. profiles.legal_name — ★선택 복원(2026-07-05 §C). 회원이 온보딩에서 입력하면 유지
--    (향후 쇼핑몰 주문·결제·배송 등). 회원이 안 넣어도 됨. 병원 매칭은 이 값에 의존하지 않는다
--    (매칭 하드키 = handle + 생일. 실명은 병원이 clinic_member_links 에 입력).
--    ★PII: 탈퇴 시 anonymize 가 legal_name + clinic_member_links 스냅샷 함께 NULL 처리(§E-H5, 별도 마이그).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS legal_name text;

-- 2b. legal_name 길이 제약 (NULL 허용, 1~50자). 이미 있으면 무시(멱등).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_legal_name_len'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_legal_name_len
      CHECK (legal_name IS NULL OR char_length(legal_name) BETWEEN 1 AND 50);
  END IF;
END $$;

-- 2c. legal_name = PII. 0335 컬럼단 GRANT 체제라 신규 컬럼은 anon/authenticated 에 자동 미부여
--     (SELECT/UPDATE 차단 유지). 방어적으로 REVOKE ALL — REFERENCES 까지 명시 제거.
--     본인/관리자 조회는 SECURITY DEFINER RPC 경유(0334/0335 패턴).
REVOKE ALL (legal_name) ON public.profiles FROM anon, authenticated;

-- 3. is_clinic(p_clinic_id) — active 명함이 role='clinic' 이고 clinic_id 일치 +
--    그 명함이 호출자(auth.uid()) 소유일 때만 true. 묶음 위조 차단(다른 명함으로 우회 불가).
--    diaries RLS 등이 쓰는 기존 current_active_profile_id() 재사용.
CREATE OR REPLACE FUNCTION public.is_clinic(p_clinic_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.profiles p
    WHERE p.id = public.current_active_profile_id()
      AND p.auth_user_id = auth.uid()
      AND p.role = 'clinic'
      AND p.clinic_id = p_clinic_id
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_clinic(bigint) TO authenticated;

-- 4. /clinic 예약어 — reserved_handles 에 'clinic' 추가(§E-H6).
--    없으면 clinic 핸들 회원이 /clinic 라우트와 충돌. route-class.ts::RESERVED_FIRST_SEGMENT 는 코드측 갱신(별도).
INSERT INTO public.reserved_handles (handle) VALUES ('clinic')
ON CONFLICT (handle) DO NOTHING;

COMMIT;
