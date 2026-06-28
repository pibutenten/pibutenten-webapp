-- 0313. 미지 태그 자동등록 정책 v2 (시술 카테고리 10종 체계 반영)
--
-- 변경점(0250 대비):
--   1) 시술 후기(source LIKE 'card:review%')에서 사용된 미지 태그는
--      category='기타', is_procedure=true 로 자동 등록하고,
--      동시에 tag_review_queue 에 source='auto_procedure' 로 검수 대기 삽입.
--   2) 기존에 '미지정'으로 등록된 태그가 시술 후기에서 사용되면
--      category='기타', is_procedure=true 로 승격.
--   3) 그 외 소스(qa, post 등)는 기존 동작 유지 (미지정 또는 tag_review_queue).

CREATE OR REPLACE FUNCTION public.register_unknown_tags(p_keywords text[], p_source text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_review boolean;
BEGIN
  IF p_keywords IS NULL OR array_length(p_keywords, 1) IS NULL THEN RETURN; END IF;

  v_is_review := (p_source LIKE 'card:review%');

  -- A) 시술 후기 경로: 기존 '미지정' 태그 → '기타'+is_procedure 승격
  IF v_is_review THEN
    UPDATE public.tag_dictionary
    SET category = '기타',
        is_procedure = true,
        updated_at = now()
    WHERE ko = ANY(p_keywords)
      AND category = '미지정'
      AND (NOT is_procedure OR is_procedure IS NULL);
  END IF;

  -- B) 미존재 + 용어집 en 있음 → tag_dictionary upsert
  --    시술 후기면 '기타'+is_procedure, 그 외면 '미지정'
  INSERT INTO public.tag_dictionary (ko, category, en, is_procedure)
  SELECT DISTINCT k.kw,
         CASE WHEN v_is_review THEN '기타' ELSE '미지정' END,
         g.en,
         CASE WHEN v_is_review THEN true ELSE false END
  FROM unnest(p_keywords) AS k(kw)
  JOIN LATERAL (
    SELECT en FROM public.term_glossary
    WHERE ko = k.kw AND en IS NOT NULL
    ORDER BY recommended DESC, id ASC LIMIT 1
  ) g ON true
  WHERE k.kw IS NOT NULL AND length(trim(k.kw)) > 0
    AND NOT EXISTS (SELECT 1 FROM public.tag_dictionary t WHERE t.ko = k.kw)
  ON CONFLICT (ko) DO NOTHING;

  -- C) 미존재 + 용어집도 없음
  --    시술 후기면: tag_dictionary 에 '기타'+is_procedure 등록 + 검수큐
  --    그 외: 검수큐만
  IF v_is_review THEN
    INSERT INTO public.tag_dictionary (ko, category, is_procedure)
    SELECT DISTINCT k.kw, '기타', true
    FROM unnest(p_keywords) AS k(kw)
    WHERE k.kw IS NOT NULL AND length(trim(k.kw)) > 0
      AND NOT EXISTS (SELECT 1 FROM public.tag_dictionary t WHERE t.ko = k.kw)
      AND NOT EXISTS (SELECT 1 FROM public.term_glossary  g WHERE g.ko = k.kw)
    ON CONFLICT (ko) DO NOTHING;
  END IF;

  -- D) 검수큐 upsert (시술 후기 자동등록분은 source='auto_procedure', 그 외는 p_source)
  INSERT INTO public.tag_review_queue (ko, suggested_en, source)
  SELECT DISTINCT k.kw, NULL,
         CASE WHEN v_is_review THEN 'auto_procedure' ELSE p_source END
  FROM unnest(p_keywords) AS k(kw)
  WHERE k.kw IS NOT NULL AND length(trim(k.kw)) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.tag_dictionary t
      WHERE t.ko = k.kw
        AND t.category <> '미지정'
    )
  ON CONFLICT (ko) DO NOTHING;

EXCEPTION WHEN OTHERS THEN
  RETURN;  -- 어떤 실패도 카드 저장을 막지 않음
END;
$$;

-- 기존 GRANT 유지 (0250 에서 설정)
REVOKE ALL ON FUNCTION public.register_unknown_tags(text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_unknown_tags(text[], text) TO authenticated, service_role;
