-- 0271. merge_tag(병합/흡수) en 승계 — target.en 공란 + source.en 있으면 승계 (발주 N)
--
-- 배경: merge_tag 는 source 카드들의 keyword 를 target 으로 array_replace + 중복제거 한 뒤
--   source 행을 삭제한다(0260). target 행 자체(en/created_at/aliases)는 손대지 않으므로
--   '사용량=합산 / 생성일·영문=target 기존 기준' 이 원칙이다.
--   그러나 target.en 이 비어있고 source.en 이 있던 경우, 병합으로 source 가 삭제되면서
--   유일하게 존재하던 영문 슬러그가 유실된다. 이때만 source.en 을 target 으로 승계한다.
--   (target.en 이 이미 있으면 절대 덮어쓰지 않음 — 기존 기준 보존.)
--
-- 그 외 본문은 production 정의(0260 + 0265 호출부)와 동일. CREATE OR REPLACE(비파괴).

CREATE OR REPLACE FUNCTION public.merge_tag(p_source_id bigint, p_target_ko text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source_ko text;
  v_source_en text;
  v_target_id bigint;
  v_affected_cards int := 0;
  v_affected_reviews int := 0;
  v_en_rows int := 0;
BEGIN
  p_target_ko := btrim(coalesce(p_target_ko, ''));
  IF p_target_ko = '' THEN RAISE EXCEPTION 'empty_target'; END IF;

  SELECT ko, en INTO v_source_ko, v_source_en FROM tag_dictionary WHERE id = p_source_id;
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

  -- 2-1) en 승계 — target.en 공란일 때만 source.en 채움(기존 영문은 절대 덮어쓰지 않음)
  UPDATE tag_dictionary t
  SET en = btrim(v_source_en)
  WHERE t.id = v_target_id
    AND coalesce(btrim(t.en), '') = ''
    AND coalesce(btrim(v_source_en), '') <> '';
  GET DIAGNOSTICS v_en_rows = ROW_COUNT;

  -- 3) source 태그 삭제
  DELETE FROM tag_dictionary WHERE id = p_source_id;

  RETURN jsonb_build_object(
    'ok', true, 'source', v_source_ko, 'target', p_target_ko,
    'affected_cards', v_affected_cards, 'affected_reviews', v_affected_reviews,
    'en_succeeded', (v_en_rows > 0)
  );
END;
$function$;
