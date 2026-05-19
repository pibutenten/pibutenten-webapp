-- 0140_audit_logs.sql (2026-05-19, 보안 2.5차 F묶음)
--
-- 가벼운 audit log 시스템. PIPA 안전성 확보조치 기준 제8조 충족:
--   - 정보주체 5만 명 미만: 최소 1년 보관
--   - 5만 명 이상 또는 민감/고유식별정보 처리: 최소 2년 보관
--
-- 기록 대상 (Phase 1): 민감 API 3개
--   - profile.delete (회원 탈퇴)
--   - admin.role_change (역할 변경)
--   - identity.switch (active identity 전환)
--
-- INSERT: service_role 만 (서버 코드 경유). RLS 로 anon/authenticated INSERT 차단.
-- SELECT: admin 만.

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id                  bigserial PRIMARY KEY,
  actor_profile_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_auth_user_id  uuid,           -- profile 삭제 후에도 추적용 (FK 없음)
  action              text NOT NULL,  -- 'profile.delete' / 'admin.role_change' / 'identity.switch' 등
  target_table        text,           -- 'profiles' / 'doctor_accounts' 등
  target_id           text,           -- 자유 형식 (uuid·int·shortcode)
  ip_masked           text,           -- maskIp() 처리된 값만 저장
  metadata            jsonb,          -- 자유 메타 (from/to·notes 등) — PII 입력 금지
  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.audit_logs IS
  '운영 감사 로그 (보안 2.5차, PIPA 안전성 확보조치 §8). 1년 이상 보관';

CREATE INDEX IF NOT EXISTS idx_audit_logs_created
  ON public.audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_auth
  ON public.audit_logs(actor_auth_user_id, created_at DESC)
  WHERE actor_auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created
  ON public.audit_logs(action, created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- INSERT: service_role 만 (정책 없음 = 차단). 서버 코드에서 admin client 로만 INSERT.
-- 단, anon/authenticated INSERT 명시적 차단 정책은 두지 않음 — PostgREST 가 정책 없으면 기본 차단.

-- SELECT: admin 만
DROP POLICY IF EXISTS audit_logs_admin_select ON public.audit_logs;
CREATE POLICY audit_logs_admin_select
  ON public.audit_logs
  FOR SELECT
  USING (is_admin());

-- 보관 정책: 1년 후 자동 삭제 (5만 명 미만 PIPA 기준).
-- pg_cron 도입 없이 일단 수동 정리 정책. 향후 cron 추가 가능.
COMMENT ON COLUMN public.audit_logs.created_at IS
  '1년 이상 보관 (PIPA). 정기 정리: DELETE FROM audit_logs WHERE created_at < now() - interval ''13 months''';
