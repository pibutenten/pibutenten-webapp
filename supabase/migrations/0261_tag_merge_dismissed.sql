-- 0261. 병합 후보 무시목록 tag_merge_dismissed (H)
--
-- 목적: /admin/tags 병합 후보 섹션에서 운영자가 '제외'한 영문 태그 ko 를 기록.
--   자동등록으로 같은 ko 가 다시 들어와도 병합 후보로 재노출되지 않게 함(영구 무시).
--   병합 실행 시엔 source 태그가 삭제되므로 이 표와 무관 — 어디까지나 '병합하지 않기로 한' 표시.
-- 권한: is_admin RLS + service_role/authenticated CRUD GRANT(0252 교훈: service_role 누락 금지).

CREATE TABLE IF NOT EXISTS public.tag_merge_dismissed (
  ko text PRIMARY KEY,
  dismissed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tag_merge_dismissed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tag_merge_dismissed admin all" ON public.tag_merge_dismissed;
CREATE POLICY "tag_merge_dismissed admin all" ON public.tag_merge_dismissed
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tag_merge_dismissed TO service_role, authenticated;
