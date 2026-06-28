-- 0311. tag_dictionary.category CHECK 제약 확장 (6종 → 10종)
--
-- 기존 6종: 피부고민, 리프팅, 스킨부스터, 홈케어, 피부상식, 미지정
-- 추가 4종: 필러·볼륨, 주름·윤곽, 레이저, 기타
-- 0312(시술 태그 대량 UPSERT) 전 반드시 적용.

ALTER TABLE public.tag_dictionary
  DROP CONSTRAINT IF EXISTS tag_dictionary_category_check;

ALTER TABLE public.tag_dictionary
  ADD CONSTRAINT tag_dictionary_category_check
  CHECK (category IN (
    '피부고민','리프팅','스킨부스터','홈케어','피부상식','미지정',
    '필러·볼륨','주름·윤곽','레이저','기타'
  ));
