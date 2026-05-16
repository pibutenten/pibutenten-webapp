-- 0104_drop_cards_published_column.sql
-- Phase 5-7 (2026-05-16): cards.published 컬럼 완전 제거.
--
-- 배경:
--   0011_qas_status_type.sql 에서 status enum 도입 후 published(boolean)는
--   `status = 'published'` 로 동등 의미로 통합되어야 했으나 컬럼만 남아 drift 발생.
--   - get_hot_card_ids: `c.published = true` 사용 → status 와 불일치 가능
--   - increment_card_view: `id = ... AND published = true`
--   - 클라이언트 .eq('published', true) 호출 3곳 (Phase 2 에서 status 로 교체)
--   - 앱 코드 insert/update 3곳 (Phase 5-7 직전 제거)
--   - RLS 'qas: public read published' 정책 (0099 에서 DROP)
--
-- 안전성:
--   - 이 마이그레이션은 column 참조 함수들을 status 기반으로 재정의 후 DROP.
--   - 트랜잭션 atomic — 중간 실패 시 전체 rollback.

-- ─────────────────────────────────────────────────────────────────
-- 1) get_hot_card_ids: published → status='published'
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_hot_card_ids(p_limit integer DEFAULT 50)
  RETURNS TABLE(id bigint)
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT c.id::bigint
    FROM public.cards c
   WHERE c.status = 'published'::qa_status
     -- 최소 점수 임계값 — 글 발행 직후의 0점 카드가 자동 진입 차단
     AND (COALESCE(c.like_count, 0) + COALESCE(c.view_count, 0) / 5) >= 5
   ORDER BY (
     (COALESCE(c.like_count, 0)::float8 + COALESCE(c.view_count, 0)::float8 / 5.0)
     * EXP(-EXTRACT(EPOCH FROM (now() - c.created_at)) / (86400.0 * 30.0))
   ) DESC,
            c.created_at DESC
   LIMIT p_limit;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 2) increment_card_view: published → status='published'
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_card_view(p_card_id bigint)
  RETURNS integer
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  UPDATE public.cards SET view_count = view_count + 1
   WHERE id = p_card_id AND status = 'published'::qa_status
  RETURNING view_count;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 3) cards.published 컬럼 DROP
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.cards DROP COLUMN IF EXISTS published;
