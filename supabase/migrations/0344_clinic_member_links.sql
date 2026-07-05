-- 0344_clinic_member_links.sql
-- 병원 계정 · 시술노트 대행 — Part B: 병원-회원 연결 + 병원 환자 기록(스냅샷) 테이블 (2026-07-05)
--
-- 계획 SSOT: docs/plans/260704 병원계정 시술기록 대행입력 계획.md §5.4·§F-M3·§7
--
-- 역할: 병원(지점 계정)과 회원 명함의 연결(비귀속 다대다) + 병원이 보유하는 환자 기록(동의 시
--   profiles 에서 1회 복사한 스냅샷 + 병원 자체 항목). 라이브 아님 — 이후 병원만 조회·수정.
--
-- 보안(§7): 테이블 직접 GRANT 없음 → 전부 SECURITY DEFINER RPC(0345) 경유.
--   RLS ENABLE + anon/authenticated REVOKE ALL(정책 없음 = 직접 접근 완전 차단).
--   시퀀스도 authenticated 에 GRANT 하지 않는다(RPC 는 owner 권한으로 INSERT).

BEGIN;

-- 1. 테이블 (§5.4 그대로).
CREATE TABLE IF NOT EXISTS public.clinic_member_links (
  id                            bigserial PRIMARY KEY,
  clinic_id                     bigint NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  profile_id                    uuid   NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,   -- 회원 명함
  status                        text NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'active', 'rejected', 'revoked')),
  created_by_clinic_profile_id  uuid   NOT NULL REFERENCES public.profiles(id),                     -- 등록한 병원 계정
  consent_at                    timestamptz,
  consent_version               text,
  requested_legal_name          text,   -- 병원 입력(대조·감사용, 반환 금지)
  requested_birthdate           date,   -- 병원 입력(대조·감사용, 반환 금지)
  registration_number           text,   -- 병원 등록번호(그 병원 내부, 고유값 아님)
  patient_phone                 text,   -- 병원 직접입력(앱에 없는 값)
  patient_address               text,   -- 병원 직접입력(앱에 없는 값)
  patient_name                  text,   -- 회원→병원 제공 스냅샷(병원 수정 가능)
  patient_birthdate             date,   -- 회원→병원 제공 스냅샷
  patient_email                 text,   -- 회원→병원 제공 스냅샷
  patient_skin_profile          jsonb,  -- {gender,skin_type,skin_concerns,face_shape,fitzpatrick,interested_procedures} 스냅샷
  created_at                    timestamptz NOT NULL DEFAULT now(),
  revoked_at                    timestamptz
);

-- 2. 조회 인덱스.
CREATE INDEX IF NOT EXISTS clinic_member_links_clinic_id_idx
  ON public.clinic_member_links (clinic_id);
CREATE INDEX IF NOT EXISTS clinic_member_links_profile_id_idx
  ON public.clinic_member_links (profile_id);

-- 3. 부분 UNIQUE — pending 중복 + active 중복을 동시 차단(§F-M3).
--    한 병원↔회원 쌍에 대해 미처리(pending) 또는 유효(active) 연결은 최대 1건.
--    rejected/revoked 는 재요청 가능(비귀속 다대다는 병원↔회원 쌍 단위, 여러 병원과는 각각 연결).
CREATE UNIQUE INDEX IF NOT EXISTS clinic_member_links_active_uniq
  ON public.clinic_member_links (clinic_id, profile_id)
  WHERE status IN ('pending', 'active');

-- 4. RLS ENABLE + 직접 권한 완전 차단(정책 없음 → RPC 전용).
ALTER TABLE public.clinic_member_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clinic_member_links FROM anon, authenticated;

COMMIT;
