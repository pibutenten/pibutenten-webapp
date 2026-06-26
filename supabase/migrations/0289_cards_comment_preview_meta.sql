-- 0289_cards_comment_preview_meta.sql
-- 피드 댓글 미리보기 N+1 제거 (2026-06-27).
--   기존: 피드 카드마다 /api/comments?cardId=X 를 따로 호출(스크롤 시 카드 수만큼 요청).
--   변경: 피드가 카드 묶음의 댓글 미리보기 메타를 한 번에 조회 → 카드별 요청 0.
--
-- 본 함수는 카드별 (total, top_root_ids) 만 반환한다. 댓글 본문·작성자·viewer_liked 조립은
--   /api/comments/preview 라우트가 기존 GET 로직(작성자 batch + 트리 조립)을 재사용한다.
--   - total        : 공개(status='visible') 댓글 수(root+답글). 카드 💬 배지용. 숨김/삭제 제외.
--   - top_root_ids : 인기순(like_count DESC, created_at DESC, id DESC) 상위 3개 root 댓글 id.
--
-- 보안: SECURITY INVOKER → 호출자(anon/authenticated) RLS 적용. 미발행 카드·권한 밖 댓글은
--   RLS 가 자동 제외하고, status='visible' 명시 필터로 공개 배지 카운트를 모든 viewer 에 일관시킨다
--   (본인/관리자가 숨김 댓글을 펼쳐 회색으로 보더라도 배지 수치는 공개 visible 기준 — 기존 동작 정합).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_cards_comment_preview_meta(p_card_ids bigint[])
RETURNS TABLE(card_id bigint, total integer, top_root_ids bigint[])
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  SELECT
    cid AS card_id,
    COALESCE((
      SELECT count(*)::int
      FROM public.comments c
      WHERE c.card_id = cid AND c.status = 'visible'
    ), 0) AS total,
    COALESCE((
      SELECT array_agg(t.id ORDER BY t.like_count DESC, t.created_at DESC, t.id DESC)
      FROM (
        SELECT c.id, c.like_count, c.created_at
        FROM public.comments c
        WHERE c.card_id = cid AND c.parent_id IS NULL AND c.status = 'visible'
        ORDER BY c.like_count DESC, c.created_at DESC, c.id DESC
        LIMIT 3
      ) t
    ), ARRAY[]::bigint[]) AS top_root_ids
  FROM unnest(p_card_ids) AS cid;
$$;

GRANT EXECUTE ON FUNCTION public.get_cards_comment_preview_meta(bigint[]) TO anon, authenticated;

COMMIT;
