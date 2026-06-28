-- 0315. resolve_tag_review 허용 카테고리 6종 → 10종 (신체계 정합)
--
-- 배경: 0311 에서 tag_dictionary.category CHECK 를 10종으로 확장했으나,
--   관리자 검수 RPC resolve_tag_review 내부의 자체 화이트리스트는
--   구체계 6종('피부고민','리프팅','스킨부스터','홈케어','피부상식','미지정')에 머물러
--   신규 4종('필러·볼륨','주름·윤곽','레이저','기타')을 'invalid category' 로 거부.
-- 증상: 관리자가 검수큐 태그를 filler/contour/laser/other 로 분류 저장 불가.
--   register_unknown_tags 가 시술후기 미존재 태그를 '기타' 로 자동등록하는데
--   이 RPC 는 '기타' 조차 통과 못해 두 함수 간 정합성 붕괴.
-- 수정: IN 목록을 tag_dictionary_category_check(10종)와 정확히 일치시킴.
--   (이 목록은 tag_dictionary CHECK 와 동기 유지 — CLAUDE.md §5 동기 페어)

CREATE OR REPLACE FUNCTION public.resolve_tag_review(
  p_ko text,
  p_category text,
  p_en text DEFAULT NULL::text,
  p_parent_ko text DEFAULT NULL::text,
  p_is_procedure boolean DEFAULT false,
  p_onboarding text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_category NOT IN (
    '피부고민','리프팅','스킨부스터','홈케어','피부상식','미지정',
    '필러·볼륨','주름·윤곽','레이저','기타'
  ) THEN
    RAISE EXCEPTION 'invalid category';
  END IF;
  INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, onboarding)
  VALUES (p_ko, p_category, p_en, p_parent_ko, COALESCE(p_is_procedure, false), p_onboarding)
  ON CONFLICT (ko) DO UPDATE
    SET category = EXCLUDED.category,
        en = COALESCE(EXCLUDED.en, public.tag_dictionary.en),
        parent_ko = EXCLUDED.parent_ko,
        is_procedure = EXCLUDED.is_procedure,
        onboarding = EXCLUDED.onboarding,
        updated_at = now();
  DELETE FROM public.tag_review_queue WHERE ko = p_ko;
END;
$function$;
