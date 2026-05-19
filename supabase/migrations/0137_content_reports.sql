-- 0137_content_reports.sql (2026-05-19, 보안 2.5차 B묶음)
--
-- 콘텐츠 신고 테이블. 정보통신망법 제44조의2 임시조치 절차 충족.
-- 신고 접수 → admin 검토 → 즉시 삭제 또는 30일 임시조치 → 작성자 이의제기.
--
-- INSERT: anon/authenticated 모두 가능 (rate-limit 으로 abuse 방어).
-- SELECT/UPDATE/DELETE: admin (is_admin()) 만.

CREATE TABLE IF NOT EXISTS public.content_reports (
  id              bigserial PRIMARY KEY,
  card_id         bigint REFERENCES public.cards(id) ON DELETE SET NULL,
  comment_id      bigint REFERENCES public.comments(id) ON DELETE SET NULL,
  reporter_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reporter_email  text,            -- 비로그인 신고자 또는 응답용 이메일
  target_url      text,            -- 자유 입력 URL (URL 또는 카드번호 둘 중 하나)
  reason          text NOT NULL,   -- spam/harassment/medical_ad/false_info/csam/self_harm/copyright/personal_info/other
  detail          text,            -- 상세 사유 (선택)
  status          text NOT NULL DEFAULT 'pending',  -- pending / investigating / resolved / rejected / temp_blocked
  action_taken    text,            -- deleted / hidden / temp_block / none
  resolution_note text,
  resolved_at     timestamptz,
  resolved_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  temp_block_until timestamptz,    -- 임시조치 만료 시각 (30일)
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.content_reports IS '콘텐츠 신고 접수 큐 (보안 2.5차, 정보통신망법 제44조의2)';

-- 사유 카테고리 화이트리스트
ALTER TABLE public.content_reports
  ADD CONSTRAINT content_reports_reason_check
  CHECK (reason IN (
    'spam','harassment','medical_ad','false_info','csam',
    'self_harm','copyright','personal_info','other'
  ));

ALTER TABLE public.content_reports
  ADD CONSTRAINT content_reports_status_check
  CHECK (status IN (
    'pending','investigating','resolved','rejected','temp_blocked'
  ));

CREATE INDEX IF NOT EXISTS idx_content_reports_status_created
  ON public.content_reports(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_reports_card
  ON public.content_reports(card_id)
  WHERE card_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_content_reports_comment
  ON public.content_reports(comment_id)
  WHERE comment_id IS NOT NULL;

-- RLS
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

-- INSERT: 누구나 (rate-limit으로 abuse 방어)
DROP POLICY IF EXISTS content_reports_anyone_insert ON public.content_reports;
CREATE POLICY content_reports_anyone_insert
  ON public.content_reports
  FOR INSERT
  TO public
  WITH CHECK (true);

-- SELECT: admin만
DROP POLICY IF EXISTS content_reports_admin_select ON public.content_reports;
CREATE POLICY content_reports_admin_select
  ON public.content_reports
  FOR SELECT
  USING (is_admin());

-- UPDATE: admin만
DROP POLICY IF EXISTS content_reports_admin_update ON public.content_reports;
CREATE POLICY content_reports_admin_update
  ON public.content_reports
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

-- DELETE: admin만 (사실상 안 씀, soft delete 권장)
DROP POLICY IF EXISTS content_reports_admin_delete ON public.content_reports;
CREATE POLICY content_reports_admin_delete
  ON public.content_reports
  FOR DELETE
  USING (is_admin());

-- 권한 부여
GRANT INSERT ON public.content_reports TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.content_reports_id_seq TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.content_reports TO authenticated;
