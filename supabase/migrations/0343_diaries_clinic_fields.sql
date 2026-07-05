-- 0343_diaries_clinic_fields.sql
-- 병원 계정 · 시술노트 대행 — Part B: diaries 에 병원 대행 작성용 5컬럼 추가 (2026-07-05)
--
-- 계획 SSOT: docs/plans/260704 병원계정 시술기록 대행입력 계획.md §5.3·§F-M1·§F-M2·§F-M4
--
-- 운영 DB 실측(2026-07-05): 아래 5컬럼 전부 부재 확인 → 전부 신규 additive. 기존 diaries 컬럼은 보존.
--
-- ⚠ 도메인 주의(§F-M2): diaries.source('member'/'clinic') 는 procedure_reviews.source
--   ('standalone'/'diary_linked') 와 **동명·다른 도메인**이다. 혼동 금지.
--     - diaries.source           = 이 시술노트를 누가 작성했나(회원 본인 / 병원 대행)
--     - procedure_reviews.source = 후기가 독립 작성인가 / 일기에서 파생됐나
--
-- ⚠ RLS 변경 없음(§F-M1): 병원의 '회원 소유 diaries' 생성은 SECURITY DEFINER RPC(owner=postgres,
--   relforcerowsecurity=false 로 RLS 우회)만 수행한다(0345, 별도). authenticated 직접 INSERT 는
--   기존 RLS 로 self-owned 만 허용. 이 마이그에서는 diaries 정책을 손대지 않는다.

BEGIN;

-- 1. source — 시술노트 작성 주체. 기본 'member'(회원 본인). 병원 대행분은 'clinic'.
ALTER TABLE public.diaries
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'member'
  CHECK (source IN ('member', 'clinic'));

-- 2. created_by_clinic_profile_id — 병원 대행 작성 감사(작성한 병원 계정 명함).
--    소유자(diaries.profile_id)는 회원 명함 그대로, 이 컬럼은 '누가 대행 입력했나' 기록.
ALTER TABLE public.diaries
  ADD COLUMN IF NOT EXISTS created_by_clinic_profile_id uuid
  REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. linked_consent_at — 병원 대행 작성 시 연결 동의 시각 스냅샷(감사).
ALTER TABLE public.diaries
  ADD COLUMN IF NOT EXISTS linked_consent_at timestamptz;

-- 4. next_appointment_date — 다음 예약일(회원·병원 공통, 선택). 재방문 리마인더용.
ALTER TABLE public.diaries
  ADD COLUMN IF NOT EXISTS next_appointment_date date;

-- 5. doctor_id — 병원 모드 담당 원장(드롭다운 선택). 병원 작성(source='clinic') 전용 —
--    회원 write 경로(create_visit_with_entries)엔 p_doctor_id 없음(§F-M4). '과거 담당 원장 불변'은
--    병원 작성분 한정. 원장 승급 시 자동 귀속 참조.
ALTER TABLE public.diaries
  ADD COLUMN IF NOT EXISTS doctor_id uuid
  REFERENCES public.doctors(id) ON DELETE SET NULL;

COMMIT;
