-- 0294_review_rpc_is_public.sql
-- 긴급 라이브 안전 패치 — create_procedure_review 가 신규 컬럼 is_public 을 설정하지 않아
-- 0292 의 read_public 게이트(is_public=true AND card_id IS NOT NULL) 도입 후
-- 새 공개 후기가 is_public=false(DEFAULT) 로 저장되어 anon 에 가려지는 회귀를 교정.
-- 정본 계획서 §3.2 D-D: standalone 공개 후기 경로(/api/reviews)의 procedure_reviews
--   INSERT 절에 is_public=true, source='standalone', date_precision='exact' 명시 추가가 필수.
--
-- 변경 범위(최소): procedure_reviews INSERT 의 컬럼/값 목록에 위 3개만 추가.
--   시그니처·권한검증(42501)·시술검증(unknown_procedure 22023)·status 검증·cards INSERT·
--   review_summary 앵커 lazy 생성(ON CONFLICT DO NOTHING)·RETURN 은 직전 운영본 그대로 보존.
-- 비고: 직전 운영본의 한글 주석/앵커 제목 리터럴이 카탈로그 상 깨진 바이트(mojibake)로
--   저장되어 있어, CREATE OR REPLACE 시 정상 UTF-8 리터럴(= update_procedure_review 의
--   '피부텐텐 리포트 | ' 와 동일)로 복원해 적용한다.
-- update_procedure_review 는 procedure_reviews UPDATE 절이 is_public/source/date_precision 을
--   건드리지 않아(=수정 대상에서 제외) 자동 보존되므로 변경하지 않는다.

CREATE OR REPLACE FUNCTION public.create_procedure_review(p_author_id uuid, p_procedure_ko text, p_title text, p_body text, p_keywords text[], p_status text, p_shortcode text, p_post_year integer, p_satisfaction smallint, p_pain smallint, p_revisit text, p_effect_areas text[] DEFAULT NULL::text[], p_downtime text DEFAULT NULL::text, p_effect_onset text DEFAULT NULL::text)
 RETURNS TABLE(card_id bigint, shortcode text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_card_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_author_id AND auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized_author' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tag_dictionary WHERE ko = p_procedure_ko AND is_procedure) THEN
    RAISE EXCEPTION 'unknown_procedure' USING ERRCODE = '22023';
  END IF;
  IF p_status NOT IN ('published','pending_review') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.cards (type, category, author_id, title, body, keywords, status, shortcode, post_year)
  VALUES ('review'::qa_type, 'review', p_author_id, p_title, COALESCE(p_body,''),
          COALESCE(p_keywords, ARRAY[p_procedure_ko]), p_status::qa_status, p_shortcode, p_post_year)
  RETURNING id INTO v_card_id;

  INSERT INTO public.procedure_reviews
    (card_id, procedure_ko, author_id, satisfaction, pain, revisit, effect_areas, downtime, effect_onset, is_public, source, date_precision)
  VALUES
    (v_card_id, p_procedure_ko, p_author_id, p_satisfaction, p_pain, p_revisit, p_effect_areas, p_downtime, p_effect_onset, true, 'standalone', 'exact');

  -- published 면 자기 + 부모 리포트 앵커(review_summary) lazy 생성(이미 있으면 무동작). 리포트는 published.
  IF p_status = 'published' THEN
    INSERT INTO public.cards
      (type, category, author_id, title, body, keywords, status, post_slug, is_pick)
    SELECT
      'review_summary'::qa_type, 'review_summary',
      (SELECT id FROM public.profiles WHERE handle = 'pibutenten' LIMIT 1),
      '피부텐텐 리포트 | ' || t.ko, '', ARRAY[t.ko, t.en], 'published'::qa_status, t.en, false
    FROM public.tag_dictionary t
    WHERE t.ko IN (
            p_procedure_ko,
            (SELECT parent_ko FROM public.tag_dictionary WHERE ko = p_procedure_ko)
          )
      AND t.is_procedure
      AND t.en IS NOT NULL
    ON CONFLICT (post_slug) WHERE type = 'review_summary'::qa_type DO NOTHING;
  END IF;

  RETURN QUERY SELECT v_card_id, p_shortcode;
END $function$;
