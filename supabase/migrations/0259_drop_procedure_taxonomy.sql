-- 0259. procedure_taxonomy 청산 완료 (C-Phase2 STEP 3) — FK 재지정 + DROP + rename_tag 단순화
--
-- 선행(완료): 0257 백업+sort_order, 0258 RPC 6→5 전환(tag_dictionary 기반, category 영문 slug 매핑),
--   코드 12파일 전환(procedure_taxonomy → tag_dictionary is_procedure). 남은 참조 = rename_tag + FK.
--
-- 본 마이그:
--  1) 더엘주사 리포트 카드 post_slug 정합: the-l-injection → the-l-solution
--     (en 단일화 the-l-solution, the-l-injection 폐기). 미정합 시 RPC JOIN(en=post_slug) 누락.
--  2) procedure_reviews.procedure_ko FK: procedure_taxonomy(ko) → tag_dictionary(ko) ON UPDATE CASCADE.
--     (orphan 0 확인. tag_dictionary.ko UNIQUE 존재.)
--  3) rename_tag 단순화: procedure_taxonomy UPDATE/충돌체크 제거. 이제 tag_dictionary.ko 변경 시
--     procedure_reviews 가 FK CASCADE 로 자동 전파(시술 양쪽 동시 변경 로직 폐기).
--  4) procedure_taxonomy DROP(self FK parent_ko 동반 제거). 잔여 의존 0.
--
-- 백업: 0257 의 procedure_taxonomy_bak_0257 / procedure_reviews_ko_bak_0257.

BEGIN;

-- 1) en 단일화 정합
UPDATE public.cards
SET post_slug = 'the-l-solution'
WHERE type = 'review_summary'::qa_type
  AND post_slug = 'the-l-injection';

-- 2) FK 재지정
ALTER TABLE public.procedure_reviews
  DROP CONSTRAINT procedure_reviews_procedure_ko_fkey;
ALTER TABLE public.procedure_reviews
  ADD CONSTRAINT procedure_reviews_procedure_ko_fkey
  FOREIGN KEY (procedure_ko) REFERENCES public.tag_dictionary(ko) ON UPDATE CASCADE;

-- 3) rename_tag 단순화 (procedure_taxonomy 의존 제거)
CREATE OR REPLACE FUNCTION public.rename_tag(p_id bigint, p_new_ko text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_ko text;
  v_is_proc boolean;
  v_affected_cards int := 0;
  v_affected_reviews int := 0;
BEGIN
  p_new_ko := btrim(coalesce(p_new_ko, ''));
  IF p_new_ko = '' THEN RAISE EXCEPTION 'empty_ko'; END IF;
  IF char_length(p_new_ko) > 120 THEN RAISE EXCEPTION 'too_long'; END IF;

  SELECT ko, is_procedure INTO v_old_ko, v_is_proc
  FROM tag_dictionary WHERE id = p_id;
  IF v_old_ko IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  IF p_new_ko = v_old_ko THEN
    RETURN jsonb_build_object('ok', true, 'unchanged', true,
      'old', v_old_ko, 'new', p_new_ko, 'is_procedure', v_is_proc,
      'affected_cards', 0, 'affected_reviews', 0);
  END IF;

  IF EXISTS (SELECT 1 FROM tag_dictionary WHERE ko = p_new_ko AND id <> p_id) THEN
    RAISE EXCEPTION 'duplicate_ko';
  END IF;

  -- 시술 태그 영향 후기 수(변경 전 기준). procedure_reviews 는 tag_dictionary FK CASCADE 로 자동 전파됨.
  IF v_is_proc THEN
    SELECT count(*)::int INTO v_affected_reviews
      FROM procedure_reviews WHERE procedure_ko = v_old_ko;
  END IF;

  -- tag_dictionary.ko 변경 → procedure_reviews.procedure_ko ON UPDATE CASCADE 자동 전파
  UPDATE tag_dictionary SET ko = p_new_ko, updated_at = now() WHERE id = p_id;

  -- cards.keywords 전파 (updated_at 보존 + 재등록/알림 트리거 tx 한정 disable)
  ALTER TABLE public.cards DISABLE TRIGGER cards_set_updated_at;
  ALTER TABLE public.cards DISABLE TRIGGER cards_register_unknown_tags;
  ALTER TABLE public.cards DISABLE TRIGGER trg_card_status_notification;
  UPDATE public.cards c
  SET keywords = (
    SELECT array_agg(DISTINCT k)
    FROM unnest(array_replace(c.keywords, v_old_ko, p_new_ko)) k
  )
  WHERE c.deleted_at IS NULL
    AND c.keywords && ARRAY[v_old_ko]::text[];
  GET DIAGNOSTICS v_affected_cards = ROW_COUNT;
  ALTER TABLE public.cards ENABLE TRIGGER trg_card_status_notification;
  ALTER TABLE public.cards ENABLE TRIGGER cards_register_unknown_tags;
  ALTER TABLE public.cards ENABLE TRIGGER cards_set_updated_at;

  RETURN jsonb_build_object(
    'ok', true, 'old', v_old_ko, 'new', p_new_ko, 'is_procedure', v_is_proc,
    'affected_cards', v_affected_cards, 'affected_reviews', v_affected_reviews
  );
END;
$$;

-- 4) procedure_taxonomy DROP (self FK 동반 제거)
DROP TABLE public.procedure_taxonomy;

COMMIT;
