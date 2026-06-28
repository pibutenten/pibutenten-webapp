-- 0321_fix_review_downtime_clear.sql
-- [주의] 데이터 정합성 정정: update_procedure_review 의 downtime 갱신 CASE 조건을
--   COALESCE(array_length(p_reactions,1),0)=0  →  p_reactions IS NULL 로 좁힌다.
--   기존 조건은 p_reactions 가 빈 배열 '{}'(수정 모드에서 반응 전체 해제 = 명시적 비움)일 때도
--   길이 0이라 기존 downtime 을 보존했다. 신규 클라이언트는 반응을 모두 지우면
--   reactions=[] + downtime=null 을 보내 "둘 다 비움"을 의도하는데, RPC 가 downtime 을
--   안 지워 "reactions=빈배열 + downtime=잔존" 불일치가 남았다.
--   → p_reactions IS NULL(구 클라이언트 = 미전달)일 때만 기존값 보존, 빈 배열은 p_downtime 반영.
--   reactions 컬럼 갱신(COALESCE(p_reactions, pr.reactions))은 빈 배열이 NULL 아니라 정상이므로 유지.
--
-- 시그니처 동일 → CREATE OR REPLACE 만으로 충분(오버로드 신설 없음). GRANT 재부여 포함.

CREATE OR REPLACE FUNCTION public.update_procedure_review(p_shortcode text, p_title text, p_body text, p_keywords text[], p_status text, p_satisfaction smallint, p_pain smallint, p_revisit text, p_effect_areas text[] DEFAULT NULL::text[], p_downtime text DEFAULT NULL::text, p_effect_onset text DEFAULT NULL::text, p_recommend smallint DEFAULT NULL::smallint, p_reactions text[] DEFAULT NULL::text[])
 RETURNS TABLE(card_id bigint, shortcode text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_card_id bigint;
  v_author uuid;
  v_is_admin boolean;
  v_procedure_ko text;
BEGIN
  SELECT c.id, c.author_id INTO v_card_id, v_author
  FROM public.cards c
  WHERE c.shortcode = p_shortcode
    AND c.type = 'review'::qa_type
    AND c.deleted_at IS NULL;
  IF v_card_id IS NULL THEN
    RAISE EXCEPTION 'card_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_is_admin := EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid() AND role = 'admin'
  );
  IF NOT v_is_admin AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_author AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('published','pending_review') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.cards
  SET title = p_title,
      body = COALESCE(p_body, ''),
      keywords = COALESCE(p_keywords, public.cards.keywords),
      status = p_status::qa_status,
      updated_at = now()
  WHERE public.cards.id = v_card_id;

  UPDATE public.procedure_reviews pr
  SET satisfaction = p_satisfaction,
      pain = p_pain,
      revisit = p_revisit,
      effect_areas = p_effect_areas,
      downtime = CASE WHEN p_reactions IS NULL THEN pr.downtime ELSE p_downtime END,
      effect_onset = p_effect_onset,
      recommend = COALESCE(p_recommend, pr.recommend),
      reactions = COALESCE(p_reactions, pr.reactions),
      updated_at = now()
  WHERE pr.card_id = v_card_id;

  -- published 면 자기 + 부모 리포트 lazy 생성(이미 있으면 무동작). 리포트는 published.
  IF p_status = 'published' THEN
    SELECT prr.procedure_ko INTO v_procedure_ko
    FROM public.procedure_reviews prr
    WHERE prr.card_id = v_card_id;

    IF v_procedure_ko IS NOT NULL THEN
      INSERT INTO public.cards
        (type, category, author_id, title, body, keywords, status, post_slug, is_pick)
      SELECT
        'review_summary'::qa_type, 'review_summary',
        (SELECT id FROM public.profiles WHERE handle = 'pibutenten' LIMIT 1),
        '피부텐텐 리포트 | ' || t.ko, '', ARRAY[t.ko, t.en], 'published'::qa_status, t.en, false
      FROM public.tag_dictionary t
      WHERE t.ko IN (
              v_procedure_ko,
              (SELECT parent_ko FROM public.tag_dictionary WHERE ko = v_procedure_ko)
            )
        AND t.is_procedure
        AND t.en IS NOT NULL
      ON CONFLICT (post_slug) WHERE type = 'review_summary'::qa_type DO NOTHING;
    END IF;
  END IF;

  RETURN QUERY SELECT v_card_id, p_shortcode;
END
$function$;

GRANT EXECUTE ON FUNCTION public.update_procedure_review(text, text, text, text[], text, smallint, smallint, text, text[], text, text, smallint, text[]) TO authenticated;
