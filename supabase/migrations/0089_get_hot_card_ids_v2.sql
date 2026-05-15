-- 0089 — get_hot_card_ids v2: 시간 가중 + 최소 점수 임계값
--
-- 문제 (기존 0070 의 정의):
--   ORDER BY (like + view/5) DESC, created_at DESC
--   → 점수 0점 카드가 다수일 때 최신 글이 1순위 → 새 글이 자동 HOT 라벨 됨
--   → docstring 에는 "90일 반감기 가중" 이라 했지만 실제 본문엔 시간 가중 X
--
-- v2 정책:
--   1) 최소 점수 임계값 — (like + view/5) >= 5 인 카드만 후보
--      (새 글 like 0 view 0 케이스 자동 제외)
--   2) 시간 가중 — 30일 반감기 EXP decay (옛 글일수록 가중치 ↓)
--      → 같은 인기 점수면 신선한 카드가 위, 옛 카드는 자연 소멸
--   3) tiebreaker created_at DESC (정상 동작)

CREATE OR REPLACE FUNCTION public.get_hot_card_ids(p_limit integer DEFAULT 50)
RETURNS TABLE(id bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT c.id::bigint
    FROM public.cards c
   WHERE c.published = true
     -- 최소 점수 임계값 — 글 발행 직후의 0점 카드가 자동 진입 차단
     AND (COALESCE(c.like_count, 0) + COALESCE(c.view_count, 0) / 5) >= 5
   ORDER BY (
     (COALESCE(c.like_count, 0)::float8 + COALESCE(c.view_count, 0)::float8 / 5.0)
     * EXP(-EXTRACT(EPOCH FROM (now() - c.created_at)) / (86400.0 * 30.0))
   ) DESC,
            c.created_at DESC
   LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_hot_card_ids(integer) TO authenticated, anon;

SELECT 'OK 0089' AS status;
