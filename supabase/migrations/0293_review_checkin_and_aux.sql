-- 0293_review_checkin_and_aux.sql
-- 후기·시술일기 통합 Phase 1 — DB 토대 (2/2)
-- 정본 계획서 §2.2(review_checkin) + §1.5(보조 테이블 3종) DDL 그대로.
-- 전부 순신규 테이블 — 기존 데이터 영향 0. 측정원본은 로그인 단위 owner-only RLS.

BEGIN;

-- ============================================================
-- (A) review_checkin — 시계열 측정 (코어). 정본 §2.2
-- ============================================================
CREATE TABLE review_checkin (
  id            bigserial PRIMARY KEY,
  review_id     bigint NOT NULL REFERENCES procedure_reviews(id) ON DELETE CASCADE,
  timepoint     text   NOT NULL CHECK (timepoint IN ('day0','week1','month1','month4')),
  satisfaction  smallint CHECK (satisfaction IS NULL OR (satisfaction BETWEEN 1 AND 5)),
  recommend     smallint CHECK (recommend    IS NULL OR (recommend    BETWEEN 1 AND 5)),
  effect_felt   smallint CHECK (effect_felt  IS NULL OR (effect_felt  BETWEEN 1 AND 5)),
  pain          smallint CHECK (pain          IS NULL OR (pain          BETWEEN 1 AND 5)),  -- day0만 의미
  changed_points text[],
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, timepoint)
);

CREATE INDEX idx_review_checkin_review ON review_checkin(review_id);

ALTER TABLE review_checkin ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_checkin_read_own ON review_checkin
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM procedure_reviews pr
      JOIN profiles p ON p.id = pr.author_id
       WHERE pr.id = review_checkin.review_id
         AND p.auth_user_id = auth.uid()
    )
  );

-- ============================================================
-- (B) 보조 테이블 — 후속 단계(자리만 확보). 정본 §1.5
-- ============================================================

-- (1) review_symptom — 증상 지연발현·결절
CREATE TABLE public.review_symptom (
  id             bigserial PRIMARY KEY,
  review_id      bigint NOT NULL REFERENCES public.procedure_reviews(id) ON DELETE CASCADE,
  symptom_type   text   NOT NULL,
  severity       smallint CHECK (severity IS NULL OR (severity BETWEEN 1 AND 5)),
  onset_timepoint text  CHECK (onset_timepoint IS NULL
                          OR onset_timepoint IN ('day0','week1','month1','month4')),
  resolved       boolean NOT NULL DEFAULT false,
  resolved_days  int     CHECK (resolved_days IS NULL OR resolved_days >= 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_symptom_review_idx ON public.review_symptom (review_id);
ALTER TABLE public.review_symptom ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_symptom_select_own ON public.review_symptom
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.procedure_reviews pr
    WHERE pr.id = review_symptom.review_id
      AND pr.author_id IN (SELECT p.id FROM public.profiles p WHERE p.auth_user_id = auth.uid())));

-- (2) question_pool — 단답풀(운영 마스터 데이터)
CREATE TABLE public.question_pool (
  id            bigserial PRIMARY KEY,
  timepoint     text NOT NULL CHECK (timepoint IN ('day0','week1','month1','month4')),
  category      text NOT NULL,
  question_text text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  weight        smallint NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.question_pool ENABLE ROW LEVEL SECURITY;
CREATE POLICY question_pool_read_active ON public.question_pool
  FOR SELECT TO anon, authenticated USING (is_active = true);

-- (3) short_answer_response — 단답응답
CREATE TABLE public.short_answer_response (
  id          bigserial PRIMARY KEY,
  review_id   bigint NOT NULL REFERENCES public.procedure_reviews(id) ON DELETE CASCADE,
  checkin_id  bigint REFERENCES public.review_checkin(id) ON DELETE SET NULL,
  question_id bigint NOT NULL REFERENCES public.question_pool(id) ON DELETE CASCADE,
  answer_text text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, question_id, checkin_id)
);
CREATE INDEX short_answer_response_review_idx  ON public.short_answer_response (review_id);
CREATE INDEX short_answer_response_checkin_idx ON public.short_answer_response (checkin_id) WHERE checkin_id IS NOT NULL;
ALTER TABLE public.short_answer_response ENABLE ROW LEVEL SECURITY;
CREATE POLICY short_answer_response_select_own ON public.short_answer_response
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.procedure_reviews pr
    WHERE pr.id = short_answer_response.review_id
      AND pr.author_id IN (SELECT p.id FROM public.profiles p WHERE p.auth_user_id = auth.uid())));

COMMIT;
