-- 0303_create_review_recommend.sql
-- 후기·시술일기 통합 — standalone(단독) 후기 경로에 추천의향(recommend) 추가.
--
-- 배경:
--   통합 visit 경로(create_visit_with_entries)는 procedure_reviews.recommend 를 이미 저장하나,
--   단독 후기 경로(/review/new → /api/reviews → create_procedure_review)는 recommend 인자가
--   빠져 있어 항상 NULL 로 저장되던 D-D 잔여 항목. 본 마이그레이션은 이 경로에만 recommend 를 추가.
--
-- 변경:
--   create_procedure_review 시그니처 끝에 p_recommend smallint DEFAULT NULL 추가(기존 호출 무영향),
--   procedure_reviews INSERT 의 컬럼/VALUES 에 recommend 추가. is_public/source/date_precision 등
--   기존 동작은 모두 그대로 보존. recommend 는 NULL 허용(CHECK: NULL 또는 1~5).
--
-- update_procedure_review 는 본 작업 범위 외(단독 후기 수정의 recommend 갱신은 API/UI 에서
--   p_recommend 미전달 시 NULL 유지 정책과 충돌하지 않도록 별도 안건). 본 마이그는 create 만 다룬다.
--
-- 주의: 새 파라미터(p_recommend) 를 끝에 추가하면 인자 시그니처가 바뀌어 CREATE OR REPLACE 가
--   기존 14-인자 함수를 "치환"하지 못하고 별도 오버로드를 만든다. 두 버전이 공존하면 호출 모호성이
--   발생하므로, 기존 14-인자 시그니처를 먼저 DROP 한 뒤 15-인자로 재생성한다.

DROP FUNCTION IF EXISTS public.create_procedure_review(uuid, text, text, text, text[], text, text, integer, smallint, smallint, text, text[], text, text);

CREATE OR REPLACE FUNCTION public.create_procedure_review(p_author_id uuid, p_procedure_ko text, p_title text, p_body text, p_keywords text[], p_status text, p_shortcode text, p_post_year integer, p_satisfaction smallint, p_pain smallint, p_revisit text, p_effect_areas text[] DEFAULT NULL::text[], p_downtime text DEFAULT NULL::text, p_effect_onset text DEFAULT NULL::text, p_recommend smallint DEFAULT NULL::smallint)
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
    (card_id, procedure_ko, author_id, satisfaction, pain, revisit, effect_areas, downtime, effect_onset, recommend, is_public, source, date_precision)
  VALUES
    (v_card_id, p_procedure_ko, p_author_id, p_satisfaction, p_pain, p_revisit, p_effect_areas, p_downtime, p_effect_onset, p_recommend, true, 'standalone', 'exact');

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

-- 기존 14-인자 함수에 있던 EXECUTE 권한(postgres·authenticated)을 새 15-인자 함수에 재부여.
--   DROP 으로 사라졌으므로 명시 재부여(authenticated 가 API 호출 주체).
GRANT EXECUTE ON FUNCTION public.create_procedure_review(uuid, text, text, text, text[], text, text, integer, smallint, smallint, text, text[], text, text, smallint) TO authenticated;
