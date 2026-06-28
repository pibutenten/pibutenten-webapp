-- 0317_legacy_stock_cleanup.sql
-- 목적: 선재고(legacy stock) 태그 정리입니다.
--   신규 시술 편입, 별칭 병합, 미지정 처리, 삭제, 일반어 재분류를 한 번에 수행합니다.
-- 본 마이그레이션은 멱등(idempotent)하게 작성되어 반복 적용해도 결과가 동일합니다.
-- 한글이 포함되므로 파일은 UTF-8 로 저장되어 있으며, 적용 시 UTF-8 경로(CLAUDE.md §8)를 사용해야 합니다.

BEGIN;

-- =====================================================================
-- A) 신규 시술 11종 + 레디어스 UPSERT (is_procedure=true)
--    레디어스는 기존 '스킨부스터' 행을 '필러·볼륨' 으로 갱신합니다.
-- =====================================================================
INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES
  ('레디어스', '필러·볼륨', 'radiesse', NULL, true, ARRAY['Radiesse','래디어스']::text[], ARRAY['Radiesse','calcium hydroxylapatite','CaHA']::text[]),
  ('세르프아이', '리프팅', 'xerf-eye', '세르프', true, ARRAY[]::text[], ARRAY[]::text[]),
  ('레스틸렌비탈', '스킨부스터', 'restylane-vital', '레스틸렌', true, ARRAY[]::text[], ARRAY[]::text[]),
  ('리쥬란HB', '스킨부스터', 'rejuran-hb', '리쥬란', true, ARRAY[]::text[], ARRAY[]::text[]),
  ('리투오', '스킨부스터', 're2o', NULL, true, ARRAY['엘라비에리투오']::text[], ARRAY[]::text[]),
  ('벨로테로리바이브', '스킨부스터', 'belotero-revive', '벨로테로', true, ARRAY[]::text[], ARRAY[]::text[]),
  ('비탈라이트', '스킨부스터', 'vital-light', '레스틸렌', true, ARRAY[]::text[], ARRAY[]::text[]),
  ('쥬베룩아이', '스킨부스터', 'juvelook-eye', '쥬베룩', true, ARRAY[]::text[], ARRAY[]::text[]),
  ('올리디아', '필러·볼륨', 'olidia', NULL, true, ARRAY[]::text[], ARRAY[]::text[]),
  ('울트라콜', '필러·볼륨', 'ultracol', NULL, true, ARRAY[]::text[], ARRAY[]::text[]),
  ('주름보톡스', '주름·윤곽', 'wrinkle-botox', '보톡스', true, ARRAY[]::text[], ARRAY[]::text[]),
  ('레비나스', '기타', 'levinas', NULL, true, ARRAY[]::text[], ARRAY[]::text[])
ON CONFLICT (ko) DO UPDATE SET
  category        = EXCLUDED.category,
  en              = EXCLUDED.en,
  parent_ko       = EXCLUDED.parent_ko,
  is_procedure    = true,
  aliases         = EXCLUDED.aliases,
  pubmed_keywords = EXCLUDED.pubmed_keywords;

-- =====================================================================
-- B) 부모 시술 aliases 에 흡수된 별칭 추가 (중복 방지)
--    덴서티 += 덴서티알파팁, 티타늄리프팅 += 티타늄, 엑셀V += 엑셀브이
-- =====================================================================
UPDATE public.tag_dictionary
   SET aliases = array_append(coalesce(aliases, ARRAY[]::text[]), '덴서티알파팁')
 WHERE ko = '덴서티'
   AND NOT ('덴서티알파팁' = ANY(coalesce(aliases, ARRAY[]::text[])));

UPDATE public.tag_dictionary
   SET aliases = array_append(coalesce(aliases, ARRAY[]::text[]), '티타늄')
 WHERE ko = '티타늄리프팅'
   AND NOT ('티타늄' = ANY(coalesce(aliases, ARRAY[]::text[])));

UPDATE public.tag_dictionary
   SET aliases = array_append(coalesce(aliases, ARRAY[]::text[]), '엑셀브이')
 WHERE ko = '엑셀V'
   AND NOT ('엑셀브이' = ANY(coalesce(aliases, ARRAY[]::text[])));

-- =====================================================================
-- C) 올리디아365 의 parent_ko 를 올리디아로 설정합니다.
-- =====================================================================
UPDATE public.tag_dictionary SET parent_ko = '올리디아' WHERE ko = '올리디아365';

-- =====================================================================
-- D) merge_alias 로 흡수된 standalone 행 강등
--    덴서티알파팁 / 티타늄 / 엑셀브이 → 독립 시술 아님
-- =====================================================================
UPDATE public.tag_dictionary
   SET is_procedure = false, category = '미지정'
 WHERE ko IN ('덴서티알파팁', '티타늄', '엑셀브이');

-- =====================================================================
-- E) 래디어스 → 레디어스의 별칭이 되었으므로 standalone 시술에서 제외
--    (category 는 필러·볼륨 유지해도 무방합니다.)
-- =====================================================================
UPDATE public.tag_dictionary SET is_procedure = false WHERE ko = '래디어스';

-- =====================================================================
-- F) 미라젯 → 미지정 처리
-- =====================================================================
UPDATE public.tag_dictionary
   SET is_procedure = false, category = '미지정'
 WHERE ko = '미라젯';

-- =====================================================================
-- G) 이펙스 → 행 삭제
-- =====================================================================
DELETE FROM public.tag_dictionary WHERE ko = '이펙스';

-- =====================================================================
-- H) Group B 일반어 재분류 (is_procedure=false 유지, category 만 변경)
-- =====================================================================
UPDATE public.tag_dictionary SET category = '주름·윤곽'
 WHERE ko IN ('교근보톡스', '네페르티티', '네페르티티보톡스', '라인보톡스', '보툴리눔', '보툴리눔톡신', '윤곽보톡스');

UPDATE public.tag_dictionary SET category = '레이저'
 WHERE ko IN ('QS레이저', '광노화레이저', '레이저', '레이저제모', '루비레이저', '바늘고주파', '색소레이저', '색소치료', '알렉산드라이트', '엔디야그', '플라즈마', '이산화탄소');

UPDATE public.tag_dictionary SET category = '필러·볼륨'
 WHERE ko IN ('히알루론산필러');

UPDATE public.tag_dictionary SET category = '기타'
 WHERE ko IN ('미세더마브레이젼', '크라이오셀', '글루타치온주사', '스테로이드주사', '온열치료', '콜라겐주사');

-- =====================================================================
-- I) Group B 미지정 처리 (is_procedure=false 유지)
-- =====================================================================
UPDATE public.tag_dictionary SET category = '미지정'
 WHERE ko IN ('안면거상술', '바이브로', 'PCL', 'PDLLA', 'PLA', 'PLLA', 'PN', '대웅', '엘러간', '주사', '캐뉼라', '콜라겐자극', '콜라겐자극제', '트리암시놀론', '폴리뉴클레오타이드', '혈관막힘');

-- =====================================================================
-- J) tag_normalization 정정 (canonical=입력/오타·구표기, variants=[정상 ko])
--    0316 가 만든 역방향 항목을 제거하고 올바른 방향으로 재삽입합니다.
-- =====================================================================
DELETE FROM public.tag_normalization WHERE canonical = '레디어스';
DELETE FROM public.tag_normalization WHERE canonical = '티타늄리프팅';

INSERT INTO public.tag_normalization (canonical, variants) VALUES
  ('래디어스',   ARRAY['레디어스']::text[]),
  ('티타늄',     ARRAY['티타늄리프팅']::text[]),
  ('덴서티알파팁', ARRAY['덴서티']::text[]),
  ('엑셀브이',   ARRAY['엑셀V']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

COMMIT;
