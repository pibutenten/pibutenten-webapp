-- 0200: 시술 후기 DB 기반(procedure_reviews) — P3-b
--
-- 배경: P3 개별 시술후기의 정량 데이터 저장소. 카드(type=review)와 1:1.
--   시술 리포트(type=review_summary)는 P3-d 에서 집계 카드로 생성.
-- 영향: enum 값 추가(미사용 시 무해) + 신규 테이블. 기존 기능 무영향.
-- 노출: 개별 후기 카드=피드 노출·검색 noindex / 리포트=index (코드 단계에서 분기).
-- 주의: cards.category CHECK 에 review/review_summary 추가는 P3-c 에서 post-category.ts 와
--   함께 변경(CLAUDE.md §5 동기화 페어). 본 마이그는 category CHECK 미변경.

-- enum 확장: 개별 후기(review) + 시술 리포트(review_summary)
ALTER TYPE public.qa_type ADD VALUE IF NOT EXISTS 'review';
ALTER TYPE public.qa_type ADD VALUE IF NOT EXISTS 'review_summary';

-- procedure_reviews: 개별 시술후기의 정량 데이터 SSOT
CREATE TABLE IF NOT EXISTS public.procedure_reviews (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  card_id           bigint NOT NULL UNIQUE REFERENCES public.cards(id) ON DELETE CASCADE,
  procedure_ko      text   NOT NULL REFERENCES public.procedure_taxonomy(ko) ON UPDATE CASCADE,
  author_id         uuid   NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- 필수 5
  satisfaction      smallint NOT NULL CHECK (satisfaction BETWEEN 1 AND 5),
  effect            smallint NOT NULL CHECK (effect BETWEEN 1 AND 5),
  pain              smallint NOT NULL CHECK (pain BETWEEN 1 AND 5),
  recovery_days     smallint NOT NULL CHECK (recovery_days BETWEEN 0 AND 365),
  would_recommend   boolean  NOT NULL,
  -- 선택
  area              text,
  cost_satisfaction smallint CHECK (cost_satisfaction BETWEEN 1 AND 5),
  effect_areas      text[],
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS procedure_reviews_procedure_idx ON public.procedure_reviews(procedure_ko);
CREATE INDEX IF NOT EXISTS procedure_reviews_author_idx   ON public.procedure_reviews(author_id);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION public.procedure_reviews_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS procedure_reviews_set_updated_at ON public.procedure_reviews;
CREATE TRIGGER procedure_reviews_set_updated_at
  BEFORE UPDATE ON public.procedure_reviews
  FOR EACH ROW EXECUTE FUNCTION public.procedure_reviews_set_updated_at();

-- RLS: 공개(published·미삭제) 카드에 연결된 후기만 읽기 공개. 본인은 자기 후기 열람.
ALTER TABLE public.procedure_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS procedure_reviews_read_public ON public.procedure_reviews;
CREATE POLICY procedure_reviews_read_public ON public.procedure_reviews
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.cards c
    WHERE c.id = procedure_reviews.card_id
      AND c.status = 'published' AND c.deleted_at IS NULL
  ));
DROP POLICY IF EXISTS procedure_reviews_read_own ON public.procedure_reviews;
CREATE POLICY procedure_reviews_read_own ON public.procedure_reviews
  FOR SELECT TO authenticated
  USING (author_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));
-- 쓰기 정책 없음 = anon/authenticated 직접 쓰기 차단. 작성은 API(service_role)에서만.
