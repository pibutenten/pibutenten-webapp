-- 0265. 동의어 태그 병합 + 흡수 트리거 통일 (L-Phase2 3단계)
--
-- 디렉터 결정(대표어 ← 흡수, 사용량 기준 방향 교정):
--   선크림←자외선차단제 / 레이저토닝←토닝레이저 / 마리오네트주름←마리오네트라인 /
--   안티에이징←항노화 / 민감성피부←예민피부 / 대변이식술←FMT / V라인←브이라인
--   그 외 0카드 중복 ko 행은 대표어로 흡수(별칭만 편입): 겨땀→겨드랑이땀 / 보툴리늄→보툴리눔 /
--   시술후→시술후관리 / 요소크림→유리아 / 장벽손상→피부장벽손상 / 민감·민감성→민감성피부
--   헤르페스·단순포진은 둘 다 유지(병합 안 함) → 헤르페스.aliases 에서 단순포진 제거.
-- 회귀 점검: tag_dictionary 참조 FK 는 procedure_reviews.procedure_ko(NO ACTION) 뿐 + 삭제 ko 사용 0건.
--   삭제 ko 를 parent_ko 로 쓰는 자식 0건, 삭제 ko 자신의 parent_ko 0건 → dangling 없음.
-- 방식: merge_tag RPC 재사용(F 검증분 — 카드 keywords array_replace+dedup, procedure_reviews 이관,
--   source 행 삭제, 트리거 3종 tx 한정 disable). 흡수 트리거(cards_absorb_eng_tags)는 병합 동안 별도 disable(스코프 보호).
--   merge_tag 가 안 하는 alias/pubmed 이전·트리거 통일은 본 마이그레이션이 처리.

BEGIN;

-- 0) 마리오네트라인(pubmed 보유) 삭제 전 → 신규 대표어 마리오네트주름(id 22)으로 pubmed 이전
UPDATE public.tag_dictionary
   SET pubmed_keywords = ARRAY['marionette lines','perioral wrinkles']::text[]
 WHERE ko = '마리오네트주름';

-- 1) 병합 (흡수 트리거 disable → merge_tag 14건 → enable)
ALTER TABLE public.cards DISABLE TRIGGER cards_absorb_eng_tags;

-- 1-A) 카드 보유 병합 (방향 교정 포함)
SELECT public.merge_tag((SELECT id FROM public.tag_dictionary WHERE ko='자외선차단제'), '선크림');
SELECT public.merge_tag((SELECT id FROM public.tag_dictionary WHERE ko='토닝레이저'),   '레이저토닝');
SELECT public.merge_tag((SELECT id FROM public.tag_dictionary WHERE ko='마리오네트라인'), '마리오네트주름');
SELECT public.merge_tag((SELECT id FROM public.tag_dictionary WHERE ko='항노화'),       '안티에이징');
SELECT public.merge_tag((SELECT id FROM public.tag_dictionary WHERE ko='예민피부'),     '민감성피부');
SELECT public.merge_tag((SELECT id FROM public.tag_dictionary WHERE ko='FMT'),         '대변이식술');
SELECT public.merge_tag((SELECT id FROM public.tag_dictionary WHERE ko='브이라인'),     'V라인');

-- 1-B) 0카드 중복 ko 행 흡수(별칭만 편입 = ko 행 제거)
SELECT public.merge_tag((SELECT id FROM public.tag_dictionary WHERE ko='겨땀'),     '겨드랑이땀');
SELECT public.merge_tag((SELECT id FROM public.tag_dictionary WHERE ko='보툴리늄'), '보툴리눔');
SELECT public.merge_tag((SELECT id FROM public.tag_dictionary WHERE ko='시술후'),   '시술후관리');
SELECT public.merge_tag((SELECT id FROM public.tag_dictionary WHERE ko='요소크림'), '유리아');
SELECT public.merge_tag((SELECT id FROM public.tag_dictionary WHERE ko='장벽손상'), '피부장벽손상');
SELECT public.merge_tag((SELECT id FROM public.tag_dictionary WHERE ko='민감'),     '민감성피부');
SELECT public.merge_tag((SELECT id FROM public.tag_dictionary WHERE ko='민감성'),   '민감성피부');

ALTER TABLE public.cards ENABLE TRIGGER cards_absorb_eng_tags;

-- 2) 대표어 aliases 정리 (방향 교정된 대표어에 흡수어·기존 별칭 편입)
UPDATE public.tag_dictionary SET aliases = ARRAY['자외선차단제']::text[]            WHERE ko='선크림';
UPDATE public.tag_dictionary SET aliases = ARRAY['토닝레이저']::text[]              WHERE ko='레이저토닝';
UPDATE public.tag_dictionary SET aliases = ARRAY['마리오네트라인','마리오네트']::text[] WHERE ko='마리오네트주름';
UPDATE public.tag_dictionary SET aliases = ARRAY['항노화']::text[]                  WHERE ko='안티에이징';
UPDATE public.tag_dictionary SET aliases = ARRAY['FMT']::text[]                     WHERE ko='대변이식술';
-- 헤르페스·단순포진 분리 유지 → 헤르페스 별칭 제거
UPDATE public.tag_dictionary SET aliases = NULL                                     WHERE ko='헤르페스';

-- 3) 흡수 트리거 통일 — alias(언어 무관) 우선 + 기존 영문 slugify 폴백
--    cards_absorb_eng_tags 함수 본문 교체(트리거 바인딩 유지). 일반인·원장·관리자 동일 SSOT.
CREATE OR REPLACE FUNCTION public.cards_absorb_eng_tags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text;
  tgt text;
  newkw text[] := '{}';
  changed boolean := false;
BEGIN
  IF NEW.keywords IS NULL OR array_length(NEW.keywords, 1) IS NULL THEN
    RETURN NEW;
  END IF;
  FOREACH k IN ARRAY NEW.keywords LOOP
    tgt := NULL;
    -- 1) alias 매칭(언어 무관): keyword 가 어떤 ko 의 alias 면 그 ko(대표어)로
    SELECT ko INTO tgt
      FROM public.tag_dictionary
     WHERE k = ANY(aliases) AND ko <> k
     LIMIT 1;
    -- 2) alias 없으면 기존 영문 slugify 흡수(en 일치 → 한글 대표어)
    IF tgt IS NULL AND k ~ '^[A-Za-z0-9][A-Za-z0-9 _-]*$' THEN
      SELECT ko INTO tgt
        FROM public.tag_dictionary
       WHERE en = public.slugify_en(k) AND ko ~ '[가-힣]'
       LIMIT 1;
    END IF;
    IF tgt IS NOT NULL AND tgt <> k THEN
      newkw := array_append(newkw, tgt);
      changed := true;
      INSERT INTO public.tag_absorb_log(source_ko, target_ko) VALUES (k, tgt);
    ELSE
      newkw := array_append(newkw, k);
    END IF;
  END LOOP;
  IF changed THEN
    NEW.keywords := (SELECT array_agg(DISTINCT x) FROM unnest(newkw) x);
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
