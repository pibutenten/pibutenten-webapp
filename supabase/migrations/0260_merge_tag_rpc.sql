-- 0260. 태그 병합 RPC merge_tag (F-Phase2)
--
-- 목적: 영문/중복 태그(source)를 한글 대표어(target)로 병합. rename(개명)과 달리 target 이
--   이미 존재할 때 사용 — source 카드 keywords 를 target 으로 치환·dedup, source 태그 삭제.
--   예: ko='thermage'(영문 자동등록, 카드 1) → '써마지'(대표어, 카드 104) 병합.
--
-- 단일 tx 전파(0246/0253 패턴):
--   1) procedure_reviews 방어 — source 가 후기 procedure_ko 면 target 으로 이관(FK 위반 방지).
--   2) cards.keywords array_replace(source→target) + array_agg(DISTINCT) dedup.
--      cards 트리거 3종 tx 한정 disable(updated_at 보존·재등록/알림 회피).
--   3) source tag_dictionary 행 DELETE.
--
-- 권한: EXECUTE service_role 만(API requireAdmin 게이트). 반환 jsonb.
-- 예외: empty_target / source_not_found / target_not_found / same_tag.

CREATE OR REPLACE FUNCTION public.merge_tag(p_source_id bigint, p_target_ko text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_ko text;
  v_target_id bigint;
  v_affected_cards int := 0;
  v_affected_reviews int := 0;
BEGIN
  p_target_ko := btrim(coalesce(p_target_ko, ''));
  IF p_target_ko = '' THEN RAISE EXCEPTION 'empty_target'; END IF;

  SELECT ko INTO v_source_ko FROM tag_dictionary WHERE id = p_source_id;
  IF v_source_ko IS NULL THEN RAISE EXCEPTION 'source_not_found'; END IF;

  SELECT id INTO v_target_id FROM tag_dictionary WHERE ko = p_target_ko;
  IF v_target_id IS NULL THEN RAISE EXCEPTION 'target_not_found'; END IF;
  IF v_target_id = p_source_id THEN RAISE EXCEPTION 'same_tag'; END IF;

  -- 1) procedure_reviews 방어 이관 (영문 source 는 보통 0건)
  UPDATE procedure_reviews SET procedure_ko = p_target_ko WHERE procedure_ko = v_source_ko;
  GET DIAGNOSTICS v_affected_reviews = ROW_COUNT;

  -- 2) cards.keywords 병합 (updated_at 보존 + 트리거 tx 한정 disable)
  ALTER TABLE public.cards DISABLE TRIGGER cards_set_updated_at;
  ALTER TABLE public.cards DISABLE TRIGGER cards_register_unknown_tags;
  ALTER TABLE public.cards DISABLE TRIGGER trg_card_status_notification;
  UPDATE public.cards c
  SET keywords = (
    SELECT array_agg(DISTINCT k)
    FROM unnest(array_replace(c.keywords, v_source_ko, p_target_ko)) k
  )
  WHERE c.deleted_at IS NULL
    AND c.keywords && ARRAY[v_source_ko]::text[];
  GET DIAGNOSTICS v_affected_cards = ROW_COUNT;
  ALTER TABLE public.cards ENABLE TRIGGER trg_card_status_notification;
  ALTER TABLE public.cards ENABLE TRIGGER cards_register_unknown_tags;
  ALTER TABLE public.cards ENABLE TRIGGER cards_set_updated_at;

  -- 3) source 태그 삭제
  DELETE FROM tag_dictionary WHERE id = p_source_id;

  RETURN jsonb_build_object(
    'ok', true, 'source', v_source_ko, 'target', p_target_ko,
    'affected_cards', v_affected_cards, 'affected_reviews', v_affected_reviews
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_tag(bigint, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_tag(bigint, text) TO service_role;
