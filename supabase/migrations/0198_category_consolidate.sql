-- 0198: 카테고리 정리 — 일반 포스팅을 doodle 하나로 통합, link 삭제 (P2)
--
-- 배경: 일반 포스팅 카테고리(diary/ask/tip/doodle)를 '끄적끄적'(doodle) 하나로 통일하고,
--   '소식공유'(link) 카테고리를 폐지. 모든 일반 포스팅은 noindex. qa(의사 Q&A)는 유지(인덱싱).
-- 데이터: diary(9)+ask(4)+tip(1)+doodle(1)=15 → doodle. link(3, draft/hidden 내부 테스트글) → soft-delete.
-- CHECK: cards.category 허용값을 qa/doodle 2종으로 축소. (review=시술후기는 P3에서 추가 예정)
-- 안전: 본 마이그 실행 전 _bak_category_260601 테이블에 post 카드의 (id, category, status, deleted_at) 백업.
-- 트리거 주의: category UPDATE 도 cards_set_updated_at 으로 updated_at=now() 갱신되나, post 는
--   표시일이 reviewed_at(NULL)→created_at 이라 updated_at 변동 무관(회귀 없음).

-- 1) diary/ask/tip → doodle (일반 포스팅 통합). deleted 포함 모든 row(이후 CHECK 통과 위해).
UPDATE public.cards
SET category = 'doodle'
WHERE category IN ('diary', 'ask', 'tip');

-- 2) link → soft-delete + category=doodle (CHECK 통과 위해 category 도 정리)
UPDATE public.cards
SET category = 'doodle',
    deleted_at = COALESCE(deleted_at, now())
WHERE category = 'link';

-- 3) CHECK constraint 교체: qa/doodle 2종
ALTER TABLE public.cards DROP CONSTRAINT IF EXISTS cards_category_check;
ALTER TABLE public.cards ADD CONSTRAINT cards_category_check
  CHECK (category = ANY (ARRAY['qa'::text, 'doodle'::text]));
